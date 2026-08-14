"""GATE-A10 -- stochastic resonance in 0-D, against Rice's crossing rate.

Spec §4.2: **this gate validates the entire measurement pipeline** — crossing
detection, binning, Welch PSD, the SNR definition of §4.3, the bootstrap — on a
system whose answer is closed-form, *before* any of it is pointed at the PDE. A
pipeline first exercised on the thing it is meant to measure cannot be told apart
from the thing it is measuring.

The prediction is `truth/rice_sr_toy.optimum_sigma`:

    sigma_opt = theta / 2

with **no free parameters**. The noise intensity, the damping, the drive
amplitude and the proportionality constant of the SNR all cancel. There is
nothing left to adjust to make a simulation agree, which is what separates this
from a fit.

Spec fixes the tolerance at 15% in ``sigma_opt``.
"""

from __future__ import annotations

import numpy as np
import pytest

from coclea import analysis, detector, stochastic
from truth import rice_sr_toy

GATE = "A10"
SPEC = "4.2 / 4.4"

OMEGA0 = 1.0
GAMMA = 0.05
THETA = 1.0
#: Spec §4.2's adiabatic limit: the tone must be slow against the mode's own
#: correlation time ``1/GAMMA``, or the quasi-static rate-modulation picture the
#: prediction rests on does not apply and the gate would be testing a theory
#: outside its stated range of validity.
DRIVE_OMEGA = 0.005
TOLERANCE = 0.15


def _snr_curve(sigmas, n_paths=8, seed=11):
    """Run the toy across a noise grid and return the measured SNR at each point."""
    a_target = 0.30
    out = []
    for s in sigmas:
        D = float(s**2 * 2 * GAMMA * OMEGA0**2)
        ms = stochastic.toy_modal_system(OMEGA0, GAMMA, D)
        # Drive chosen so the *response* amplitude is a_target, not the force.
        resp = abs(complex(OMEGA0**2 - DRIVE_OMEGA**2, 2 * GAMMA * DRIVE_OMEGA))
        force = a_target * resp
        period = 2 * np.pi / DRIVE_OMEGA
        ps = stochastic.simulate_ou_modal(
            ms,
            stochastic.Drive(omega=DRIVE_OMEGA, amplitude=force),
            T=200 * period,
            dt=period / 200,
            rng=np.random.default_rng(seed),
            n_paths=n_paths,
            modal_force=np.array([force]),
        )
        ev = detector.threshold_events(ps.disp, ps.t, THETA, tau_ref=0.0)
        est = analysis.snr_db(
            ev, ps.t, DRIVE_OMEGA, 0, analysis.WelchCfg(nperseg=8192),
            n_boot=400, rng=np.random.default_rng(3),
        )
        out.append((float(s), est, float(ev.rates().mean()), a_target))
    return out


def _peak_sigma(sigmas: np.ndarray, snr: np.ndarray) -> float:
    """Sub-grid peak by a parabola through the maximum and its neighbours.

    In ``log sigma``, because the grid is logarithmic and the theoretical curve
    is symmetric in that variable near its peak. Taking the grid point itself
    would make the measured optimum depend on grid spacing, and then the 15%
    tolerance would be a statement about the grid.
    """
    k = int(np.argmax(snr))
    if k == 0 or k == snr.size - 1:
        return float(sigmas[k])
    x = np.log(sigmas[k - 1 : k + 2])
    y = snr[k - 1 : k + 2]
    denom = (y[0] - 2 * y[1] + y[2])
    if denom == 0:
        return float(sigmas[k])
    shift = 0.5 * (y[0] - y[2]) / denom
    return float(np.exp(x[1] + shift * (x[1] - x[0])))


def test_the_prediction_is_derived_symbolically(report):
    """`optimum_sigma_symbolic` maximises the expression rather than restating it."""
    import sympy as sp

    expr = rice_sr_toy.optimum_sigma_symbolic()
    theta = sp.Symbol("theta", positive=True)
    report(sigma_opt_symbolic=str(expr))
    assert sp.simplify(expr - theta / 2) == 0


def test_the_tone_is_subthreshold(report):
    """The precondition, checked and not assumed. Spec §R2.

    If the response crosses ``theta`` unaided there is no resonance to find — the
    detector is simply on, the curve is monotone, and a green gate would be
    measuring a suprathreshold detector.
    """
    a = 0.30
    report(response_amplitude=a, theta=THETA, ratio=a / THETA)
    assert rice_sr_toy.subthreshold_bound(THETA, a)

    # And with no noise at all it must fire exactly zero times.
    ms = stochastic.toy_modal_system(OMEGA0, GAMMA, 1e-300)
    resp = abs(complex(OMEGA0**2 - DRIVE_OMEGA**2, 2 * GAMMA * DRIVE_OMEGA))
    period = 2 * np.pi / DRIVE_OMEGA
    ps = stochastic.simulate_ou_modal(
        ms, stochastic.Drive(omega=DRIVE_OMEGA, amplitude=a * resp),
        T=20 * period, dt=period / 200, rng=np.random.default_rng(1),
        n_paths=1, modal_force=np.array([a * resp]),
    )
    ev = detector.threshold_events(ps.disp, ps.t, THETA, 0.0)
    report.data["events_with_no_noise"] = int(sum(len(x) for x in ev.times[0]))
    assert ev.rates().max() == 0.0, "the tone crosses on its own; it is not subthreshold"


def test_the_measured_optimum_matches_theta_over_two(report):
    """The gate. Spec §4.2: within 15% in ``sigma_opt``."""
    sigmas = np.geomspace(0.15 * THETA, 3.0 * THETA, 14)
    curve = _snr_curve(sigmas)
    snr = np.array([c[1].value for c in curve])

    measured = _peak_sigma(sigmas, snr)
    predicted = rice_sr_toy.optimum_sigma(THETA)
    rel = abs(measured - predicted) / predicted

    report(
        omega0=OMEGA0,
        gamma=GAMMA,
        theta=THETA,
        drive_omega=DRIVE_OMEGA,
        sigma_grid=sigmas.tolist(),
        snr_db=snr.tolist(),
        snr_ci=[[c[1].ci_lo, c[1].ci_hi] for c in curve],
        event_rate=[c[2] for c in curve],
        sigma_opt_measured=measured,
        sigma_opt_predicted=predicted,
        relative_error=rel,
        tolerance=TOLERANCE,
    )

    assert rel < TOLERANCE, (
        f"measured sigma_opt {measured:.4f} vs predicted {predicted:.4f} ({rel:.1%})"
    )


def test_the_curve_is_an_inverted_u_and_not_a_ramp(report):
    """The shape, not just the peak position.

    A monotone curve has an argmax too — at an end — and parabolic interpolation
    would still return a number. Requiring the maximum to be *interior* and to
    stand clear of both ends is what makes this about resonance rather than about
    a detector being switched on.
    """
    sigmas = np.geomspace(0.15 * THETA, 3.0 * THETA, 14)
    curve = _snr_curve(sigmas)
    estimates = [c[1] for c in curve]
    verdict = analysis.interior_maximum(sigmas, estimates)

    report(**{k: v for k, v in verdict.items()})
    assert verdict["maximum_is_interior"], "the peak sits at a grid end"
    assert verdict["significant_interior_maximum"], (
        "the peak does not clear both ends with non-overlapping 95% intervals"
    )
