"""Making the tone subthreshold, on purpose and by measurement. Spec §4.4.4.

Stochastic resonance is a claim about a signal that **cannot be detected without
noise**. If the tone is strong enough to cross the threshold on its own, the
detector fires without help, the curve is monotone, and what was measured is a
suprathreshold detector being switched on. Spec §R2 names this as the way the
result can be manufactured by design, so the calibration is not a convenience —
it is the precondition that makes the experiment about anything.

The check is exact rather than empirical. The linear membrane's response to a
tone has a closed-form amplitude (`stochastic.simulate_ou_modal` superposes it),
so "is this subthreshold" is a comparison of two numbers and not an estimate off
a noisy trace.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .stochastic import Drive, ModalSystem, modal_forcing


@dataclass(frozen=True)
class Calibration:
    """The drive amplitude that puts the response at a chosen fraction of theta."""

    drive_amplitude: float
    response_amplitude: np.ndarray
    theta: float
    fraction: float
    probe: int

    @property
    def subthreshold(self) -> bool:
        return bool(self.response_amplitude[self.probe] < self.theta)


def response_amplitude(
    ms: ModalSystem, drive_omega: float, drive_amplitude: float, modal_force: np.ndarray | None = None
) -> np.ndarray:
    """Steady-state tone amplitude at each probe. Spec (2.13), evaluated.

    Linear in ``drive_amplitude``, which is what makes `calibrate_subthreshold`
    a division rather than a search.
    """
    if modal_force is not None:
        # `modal_force` is the force at unit drive; the system is linear, so the
        # scaling is a multiplication. The first version of this line divided by
        # itself and silently ignored `drive_amplitude` entirely.
        f_n = np.asarray(modal_force, dtype=float) * drive_amplitude
    elif ms.modes is not None:
        f_n = modal_forcing(ms.modes, Drive(omega=drive_omega, amplitude=drive_amplitude))
    else:
        raise ValueError("no membrane and no explicit modal force")
    denom = ms.omega**2 - drive_omega**2 + 2j * ms.gamma * drive_omega
    return np.abs((f_n / denom) @ ms.phi_probe.T)


def calibrate_subthreshold(
    ms: ModalSystem,
    drive_omega: float,
    theta: float,
    probe: int = 0,
    fraction: float = 0.5,
) -> Calibration:
    """Scale the drive so the response at ``probe`` is ``fraction * theta``.

    ``fraction`` defaults to 0.5 rather than to something just under 1. A tone at
    0.95 theta needs almost no noise to cross, so the optimum is pushed to the
    left edge of any reasonable grid and the curve looks monotone-decreasing —
    a *true* SR curve whose peak is outside the window, which reads exactly like
    no resonance at all.

    Exact, because the response is linear in the drive: measure at unit drive,
    then divide.
    """
    if not 0.0 < fraction < 1.0:
        raise ValueError("a subthreshold fraction must be strictly between 0 and 1")

    unit = response_amplitude(ms, drive_omega, 1.0)
    if unit[probe] <= 0:
        raise ValueError(f"probe {probe} has no response to this frequency; nothing to calibrate")

    amp = fraction * theta / unit[probe]
    return Calibration(
        drive_amplitude=float(amp),
        response_amplitude=unit * amp,
        theta=theta,
        fraction=fraction,
        probe=probe,
    )


def calibrate_threshold(sigma_target: float, fraction: float = 2.0) -> float:
    """Pick ``theta`` from the noise level rather than the other way round.

    `truth/rice_sr_toy` derives ``sigma_opt = theta / 2``, so choosing
    ``theta = 2 sigma_target`` puts the predicted optimum at ``sigma_target``.
    Used to centre a sweep on the interesting region instead of discovering
    afterwards that the whole grid sat on one flank.

    **This does not decide the answer.** The gate is whether a significant
    interior maximum exists at all and where the *measured* one lands; centring
    the grid only ensures the window contains the region where an answer could
    be seen. A grid that cannot contain the peak cannot report its absence
    either.
    """
    return float(fraction * sigma_target)
