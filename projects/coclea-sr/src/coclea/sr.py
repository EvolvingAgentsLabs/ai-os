"""The stochastic-resonance curve on the membrane. Spec §7.1 E3, GATE-B2.

One function, used by GATE-A14 and by `experiments/e3_sr_curve.py`, so the
truncation check and the headline result cannot drift apart by being two
different pieces of code that happen to be pointed at the same physics.

## The prediction carries over from 0-D, and that is what makes B2 checkable

`truth/rice_sr_toy` derives ``sigma_opt = theta / 2`` for a single damped mode.
The probe series here is a **sum** of independent modes, so it is still a
stationary Gaussian process — the sum only changes the effective frequency in
Rice's rate,

    r0 = (1 / 2pi) (sigma_vdot / sigma_v) exp(-theta^2 / 2 sigma_v^2)

and that prefactor scales the SNR without moving its maximum. So the membrane
should put its optimum in the same place as the toy, and GATE-B2 has a
*quantitative* prediction to miss rather than only the qualitative "there is a
bump somewhere".

## Why the sweep is in sigma and reported in D

The physical control is the noise intensity ``D``; the theory is about the
standard deviation ``sigma`` the probe actually sees, and the map between them
depends on the mode shapes at that probe. Sweeping ``sigma`` and inverting to
``D`` keeps the grid centred on the region where an answer could be seen for
*every* probe, instead of one probe getting a well-resolved peak and the others a
flat flank of the same curve. Both are recorded.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import analysis, calibrate, detector, stochastic
from .modal import Modes
from .stochastic import DetectorInput, NoiseScaling


@dataclass(frozen=True)
class SRPoint:
    """One point of the curve: a noise level and what the detector made of it."""

    sigma: float
    noise_intensity: float
    snr: analysis.Estimate
    vs: analysis.Estimate
    event_rate: float
    tone_amplitude: float


@dataclass(frozen=True)
class SRCurve:
    probe_x: float
    drive_omega: float
    theta: float
    points: list[SRPoint] = field(default_factory=list)

    @property
    def sigma_grid(self) -> np.ndarray:
        return np.array([p.sigma for p in self.points])

    @property
    def snr_estimates(self) -> list[analysis.Estimate]:
        return [p.snr for p in self.points]

    def verdict(self) -> dict[str, object]:
        return analysis.interior_maximum(self.sigma_grid, self.snr_estimates)


def probe_sigma(ms: stochastic.ModalSystem, probe: int, which: DetectorInput = "disp") -> float:
    """Standard deviation the detector at ``probe`` sees, in closed form.

    Modes are independent, so the variance of the probe series is the weighted
    sum of the modal variances. Computed rather than measured, because it is the
    quantity the theoretical optimum is stated in and estimating it off a noisy
    trace would put sampling error into the x-axis of the result.
    """
    var_q = ms.noise / (2.0 * ms.gamma * ms.omega**2)
    w = ms.phi_probe[probe] ** 2
    if which == "vel":
        var_q = ms.noise / (2.0 * ms.gamma)
    return float(np.sqrt(np.sum(w * var_q)))


def noise_for_sigma(ms: stochastic.ModalSystem, probe: int, target: float,
                    which: DetectorInput = "disp") -> float:
    """Invert :func:`probe_sigma`. Linear in ``D``, so it is a division."""
    unit = probe_sigma(
        stochastic.ModalSystem(
            omega=ms.omega, gamma=ms.gamma, noise=np.ones_like(ms.noise),
            phi_probe=ms.phi_probe, probe_x=ms.probe_x, modes=ms.modes,
        ),
        probe, which,
    )
    return float((target / unit) ** 2)


def sr_curve(
    modes: Modes,
    probe_x: float,
    drive_omega: float,
    *,
    sigma_grid: np.ndarray,
    theta: float | None = None,
    subthreshold_fraction: float = 0.5,
    n_seeds: int = 20,
    n_periods: int = 200,
    samples_per_period: int = 200,
    detector_input: DetectorInput = "disp",
    noise_scaling: NoiseScaling = "mass",
    tau_ref: float = 0.0,
    n_modes: int | None = None,
    noise_stream_modes: int | None = None,
    master_seed: int = 20260814,
    n_boot: int = 2000,
) -> SRCurve:
    """Measure SNR and vector strength across a noise grid at one probe.

    ``theta`` defaults to ``2 * median(sigma_grid)``, which puts the theoretical
    optimum in the middle of the swept window — see `calibrate.calibrate_threshold`
    for why that centres the instrument without deciding its answer.
    """
    if n_modes is not None:
        modes = Modes(
            omega=modes.omega[:n_modes],
            phi=modes.phi[:, :n_modes],
            x=modes.x,
            system=modes.system,
        )

    ms0 = stochastic.modal_system(modes, np.array([probe_x]), 1.0, noise_scaling)
    theta = theta if theta is not None else calibrate.calibrate_threshold(float(np.median(sigma_grid)))

    cal = calibrate.calibrate_subthreshold(ms0, drive_omega, theta, probe=0,
                                           fraction=subthreshold_fraction)
    if not cal.subthreshold:
        raise ValueError("the calibrated tone is not subthreshold; the run would measure a detector")

    period = 2.0 * np.pi / drive_omega
    dt = period / samples_per_period
    T = n_periods * period

    # One SeedSequence, spawned once. Spec §6.4 rule 6 wants an explicit seed per
    # run; deriving them from one root in one place is what makes them provably
    # distinct rather than distinct-looking.
    seeds = np.random.SeedSequence(master_seed).spawn(len(sigma_grid))

    points: list[SRPoint] = []
    for s_target, seed in zip(sigma_grid, seeds):
        D = noise_for_sigma(ms0, 0, float(s_target), detector_input)
        ms = stochastic.modal_system(modes, np.array([probe_x]), D, noise_scaling)
        ps = stochastic.simulate_ou_modal(
            ms,
            stochastic.Drive(omega=drive_omega, amplitude=cal.drive_amplitude),
            T, dt, np.random.default_rng(seed), n_paths=n_seeds,
            noise_stream_modes=noise_stream_modes,
        )
        v = ps.channel(detector_input)
        ev = detector.threshold_events(v, ps.t, theta, tau_ref)
        boot_rng = np.random.default_rng(seed.spawn(1)[0])
        points.append(
            SRPoint(
                sigma=float(s_target),
                noise_intensity=D,
                snr=analysis.snr_db(ev, ps.t, drive_omega, 0, n_boot=n_boot, rng=boot_rng),
                vs=analysis.vector_strength(ev, drive_omega, 0, n_boot=n_boot, rng=boot_rng),
                event_rate=float(ev.rates().mean()),
                tone_amplitude=float(ps.tone_amplitude[0]),
            )
        )

    return SRCurve(probe_x=float(ms0.probe_x[0]), drive_omega=drive_omega,
                   theta=theta, points=points)
