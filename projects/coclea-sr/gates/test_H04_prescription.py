"""GATE-H4 -- the calibration engine's prescription, against its own two truths.

This gate exists because `fitting.prescribe` is the piece a product claim would
rest on, and a number that decides how much noise to put into somebody's ear
must not be checkable only against itself.

Every assertion below compares the engine to `truth/rice_inverse.py` or to
`truth/hopf_normal_form.py`, which import nothing from ``src`` (§6.4 rule 4).

**The load-bearing case is the one that prescribes nothing.** An engine that
always returns a dose is the engine nobody could approve — the SR curve is an
inverted U and the falling side is a harm. So the test that an ear past its
optimum receives exactly zero, and not a clamped negative, is the one this gate
is really for.
"""

from __future__ import annotations

import numpy as np
import pytest

from coclea import fitting
from truth import hopf_normal_form as nf
from truth import rice_inverse as rice

GATE = "H4"
SPEC = "4.5 / 7.5"


def test_h4_ratio_matches_the_rice_inversion_exactly(report):
    """The engine adds nothing of its own to the inversion."""
    obs = fitting.Observables(spontaneous_rate=30.0, cf_hz=1000.0)
    p = fitting.prescribe(obs)
    expected = rice.threshold_over_sigma(30.0, 2 * np.pi * 1000.0)
    report(theta_over_sigma=p.theta_over_sigma, truth=expected)
    assert abs(p.theta_over_sigma - expected) < 1e-12


def test_h4_prescribes_nothing_for_an_ear_past_the_optimum(report):
    """Zero, and zero because more would hurt — not a clamped negative.

    A high spontaneous rate means a *low* threshold-to-noise ratio: the ear is
    already noisy relative to its threshold and sits on the falling side of the
    U. 300 sp/s at 1 kHz is beyond physiology and is used here because the
    arithmetic is what is under test; the physiological question is the next
    test, and its answer is not the one this docstring first assumed.
    """
    p = fitting.prescribe(fitting.Observables(spontaneous_rate=300.0, cf_hz=1000.0))
    report(theta_over_sigma=p.theta_over_sigma, add=p.add_noise_fraction, verdict=p.verdict)
    assert p.theta_over_sigma < fitting.THETA_OVER_SIGMA_OPT
    assert p.add_noise_fraction == 0.0
    assert "reduce" in p.verdict


def test_h4_whether_the_optimum_is_reachable_depends_on_frequency(report):
    """The prediction that makes this a per-channel prescription, not a dose.

    ``theta/sigma = 2`` requires ``r0 = CF * exp(-2) = 0.135 * CF``. Spontaneous
    rates in the auditory nerve run 0 to about 100 spikes per second **whatever
    the fibre's CF**, so the optimum is reachable at low CF and out of reach at
    high CF:

    ======  ===========================  =========================
    CF      r0 needed to reach optimum   within physiology?
    ======  ===========================  =========================
    500 Hz  67.7 sp/s                    yes — high-SR fibres are there
    1 kHz   135 sp/s                     no
    4 kHz   541 sp/s                     no, by a factor of five
    ======  ===========================  =========================

    So the model predicts added noise **helps at high CF and can harm at low CF
    for high-spontaneous-rate fibres**. That is a frequency-dependent, per-fibre
    prescription rather than a single dose — which is the shape a fitting
    product has to have, and it is falsifiable against any study that measured
    the SR benefit across channels.

    This test was written after a wrong assumption in the previous one: its
    docstring asserted 100 sp/s at 1 kHz was past the optimum. It is not — it
    lands at 2.15, just short — and finding that out is where the CF dependence
    came from.
    """
    reachable = {}
    for cf in (500.0, 1000.0, 4000.0):
        needed = cf * np.exp(-2.0)
        reachable[cf] = needed
        # The engine must agree with the closed form about which side of the
        # optimum a top-of-range fibre is on.
        p = fitting.prescribe(fitting.Observables(spontaneous_rate=100.0, cf_hz=cf))
        past = p.theta_over_sigma < fitting.THETA_OVER_SIGMA_OPT
        assert past == (100.0 > needed), f"CF {cf}: engine and closed form disagree"

    report(rate_needed_for_optimum={str(k): v for k, v in reachable.items()})
    assert reachable[500.0] < 100.0 < reachable[1000.0] < reachable[4000.0]


def test_h4_prescribes_noise_for_a_quiet_ear_and_the_sum_reaches_the_optimum(report):
    """The dose is the one that makes total noise land on ``theta/2``.

    Checked by recomputing the sum rather than by re-deriving the formula:
    powers add, so ``sigma_total^2 = sigma^2 + sigma_add^2`` must come out at
    ``(theta/2)^2``.
    """
    obs = fitting.Observables(spontaneous_rate=0.5, cf_hz=1000.0)
    p = fitting.prescribe(obs)
    sigma_over_theta = 1.0 / p.theta_over_sigma
    total = np.hypot(sigma_over_theta, p.add_noise_fraction)
    report(
        theta_over_sigma=p.theta_over_sigma,
        add=p.add_noise_fraction,
        total_sigma_over_theta=float(total),
    )
    assert p.add_noise_fraction > 0.0
    assert abs(total - 0.5) < 1e-12, "the prescribed dose must land the total on theta/2"


def test_h4_the_interval_is_asymmetric_and_ordered(report):
    """A quieter-than-measured ear needs more noise, not less.

    The bounds cross over through the inversion — a *higher* rate gives a
    *lower* ``theta/sigma`` — and an engine that sorted them silently would
    report an interval whose ends mean the opposite of what they say.
    """
    p = fitting.prescribe(
        fitting.Observables(spontaneous_rate=5.0, cf_hz=1000.0, rate_uncertainty=10.0)
    )
    report(
        lo=p.theta_over_sigma_lo, mid=p.theta_over_sigma, hi=p.theta_over_sigma_hi,
        add_lo=p.add_noise_fraction_lo, add=p.add_noise_fraction, add_hi=p.add_noise_fraction_hi,
    )
    assert p.theta_over_sigma_lo < p.theta_over_sigma < p.theta_over_sigma_hi
    assert p.add_noise_fraction_lo <= p.add_noise_fraction <= p.add_noise_fraction_hi
    # Asymmetric: the logarithm compresses one side more than the other, and
    # `truth/rice_inverse.py` records a wrong guess about exactly this.
    below = p.theta_over_sigma - p.theta_over_sigma_lo
    above = p.theta_over_sigma_hi - p.theta_over_sigma
    assert abs(below - above) > 0.05 * max(below, above)


def test_h4_the_knee_round_trips_through_the_normal_form(report):
    """``mu_H`` recovered from a knee reproduces the knee it came from."""
    for mu in (-0.01, -0.04, -0.25):
        knee = nf.crossover_drive(mu)
        p = fitting.prescribe(
            fitting.Observables(spontaneous_rate=10.0, cf_hz=1000.0, compression_knee=knee)
        )
        assert p.mu_h is not None
        assert abs(p.mu_h - mu) / abs(mu) < 1e-9, f"mu {p.mu_h} from knee {knee}, expected {mu}"
        assert abs(fitting.knee_for(p.mu_h) - knee) / knee < 1e-9
    report(checked_mu=[-0.01, -0.04, -0.25])


def test_h4_refuses_what_it_cannot_estimate(report):
    """A silent fibre gets an error, not a number.

    Returning a floor here would put a fabricated ``theta/sigma`` into an
    average, and nothing downstream could tell it from a measurement.
    """
    with pytest.raises(ValueError):
        fitting.prescribe(fitting.Observables(spontaneous_rate=0.0, cf_hz=1000.0))
    with pytest.raises(ValueError):
        fitting.prescribe(fitting.Observables(spontaneous_rate=10.0, cf_hz=1000.0, rate_uncertainty=0.5))
    with pytest.raises(ValueError):
        fitting.prescribe(
            fitting.Observables(spontaneous_rate=10.0, cf_hz=1000.0, compression_knee=0.0)
        )
    report(refusals=["silent fibre", "uncertainty < 1", "non-positive knee"])
