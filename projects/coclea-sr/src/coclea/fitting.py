"""Per-patient calibration: how much noise, for this ear, from measurable things.

This module is the project's answer to the question that kept thirty years of
validated stochastic-resonance science out of every cochlear implant on the
market. The science was never the blocker. **`D_opt` is individual**, the SNR
curve is an inverted U, and too much noise is worse than none — so a feature
that helps some patients and harms others cannot be shipped, clinically or
regulatorily. What was missing was a way to estimate one patient's optimum from
data a clinic already collects.

## What it takes in, and why those and not others

Two observables, both routine:

* **Spontaneous rate** ``r0`` and the fibre's characteristic frequency. These
  give ``θ/σ`` through `truth.rice_inverse` — the ratio of threshold to internal
  noise — with **no displacement scale anywhere**, which is what makes the model
  comparable to a patient at all (see `truth/rice_inverse.py`).
* **The compression knee** of the loudness-growth curve, optionally. Through
  `truth.hopf_normal_form.crossover_drive` (``F = |mu_H|^(3/2)``) this gives the
  ear's distance from criticality, which is what sets how much the active layer
  is still contributing.

Both are things an audiologist measures. ``mu_H`` and ``σ`` are not.

## What it gives back, including the answer that makes it shippable

`prescribe` returns the noise to **add**, and that number is often **zero**.
An ear already at or past its optimum is on the falling side of the U, and more
noise makes it worse. A calibration engine that always prescribes something is
the engine nobody could approve; the clinically useful output is the one that
says "not this patient".

## What this is not

Not a fit. Nothing here has an adjustable constant: ``θ/σ = 2`` at the optimum
comes from Rice with no free parameter (GATE-A10), and the knee relation comes
from the normal form in closed form (GATE-H3). The uncertainty reported is
propagated from the measurement, not from a residual.

Not clinical advice, and not validated in humans: every number below is a
statement about the model. The verdict this module supports is "worth measuring
in a patient", never "this dose is safe".
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from truth import hopf_normal_form as _nf
from truth import rice_inverse as _rice

#: The model's own optimum, as a threshold-to-noise ratio. `sigma_opt = theta/2`.
THETA_OVER_SIGMA_OPT = 2.0


@dataclass(frozen=True)
class Observables:
    """What a clinic can measure. Every field is a real measurement, not a knob."""

    #: Spontaneous firing rate of the fibre or population, spikes per second.
    spontaneous_rate: float
    #: Characteristic frequency, Hz. Stands in for the internal noise bandwidth.
    cf_hz: float
    #: Multiplicative uncertainty on `spontaneous_rate`. 2.0 means "within 2x".
    rate_uncertainty: float = 2.0
    #: Drive at which the loudness-growth curve bends, in the same arbitrary
    #: units as the drive itself. Optional: without it `mu_H` is not estimated.
    compression_knee: float | None = None


@dataclass(frozen=True)
class Prescription:
    """The engine's output. Read `add_noise_fraction` first, then the interval."""

    theta_over_sigma: float
    #: Interval implied by `rate_uncertainty`, propagated through Rice.
    theta_over_sigma_lo: float
    theta_over_sigma_hi: float
    #: Noise to add, as a fraction of threshold. **Zero when none should be.**
    add_noise_fraction: float
    add_noise_fraction_lo: float
    add_noise_fraction_hi: float
    #: Distance to criticality, when a compression knee was supplied.
    mu_h: float | None
    #: One line a clinician reads. Never a dose.
    verdict: str


def _add_fraction(theta_over_sigma: float) -> float:
    """Noise to add so total noise reaches ``theta/2``, in units of ``theta``.

    Noise powers add, so with the ear's own ``sigma`` and an added independent
    ``sigma_add``::

        sigma_total^2 = sigma^2 + sigma_add^2      ==>
        sigma_add/theta = sqrt( (1/2)^2 - (sigma/theta)^2 )

    and there is **no real solution once the ear is already past the optimum**,
    which is the case that returns zero rather than a negative or a clamp. The
    distinction matters: a clamped negative would read as "add nothing because
    the maths broke", and this reads as "add nothing because more would hurt".
    """
    sigma_over_theta = 1.0 / theta_over_sigma
    target = 1.0 / THETA_OVER_SIGMA_OPT
    if sigma_over_theta >= target:
        return 0.0
    return float(np.sqrt(target**2 - sigma_over_theta**2))


def prescribe(obs: Observables) -> Prescription:
    """Estimate this ear's distance from the SR optimum, and what to do about it.

    The interval comes from ``rate_uncertainty`` propagated through the Rice
    inversion, and it is **asymmetric on purpose**: ``theta/sigma`` depends on
    ``r0`` under a logarithm, so a factor-of-two error downward and upward do not
    move it equally, and `truth/rice_inverse.py` records a wrong guess about
    exactly this (a claimed 20% that measured 41%).
    """
    if obs.spontaneous_rate <= 0.0:
        # Not clamped to a floor. A silent fibre carries no information about
        # its own noise level through this route, and returning a number for it
        # would be inventing one.
        raise ValueError("a silent fibre gives no crossing rate to invert; r0 must be > 0")
    if obs.rate_uncertainty < 1.0:
        raise ValueError("rate_uncertainty is a multiplicative factor >= 1")

    omega_eff = 2.0 * np.pi * obs.cf_hz
    ratio = _rice.threshold_over_sigma(obs.spontaneous_rate, omega_eff)

    # A higher rate implies a *lower* threshold-to-noise ratio, so the bounds
    # cross over. Named rather than sorted silently.
    hi_rate = min(obs.spontaneous_rate * obs.rate_uncertainty, omega_eff / (2.0 * np.pi) * 0.99)
    lo_rate = obs.spontaneous_rate / obs.rate_uncertainty
    ratio_from_hi_rate = _rice.threshold_over_sigma(hi_rate, omega_eff)
    ratio_from_lo_rate = _rice.threshold_over_sigma(lo_rate, omega_eff)
    lo, hi = sorted((ratio_from_hi_rate, ratio_from_lo_rate))

    add = _add_fraction(ratio)
    # The interval on the prescription runs the other way round: the *larger*
    # theta/sigma (quieter ear) needs the *more* noise.
    add_lo, add_hi = sorted((_add_fraction(lo), _add_fraction(hi)))

    mu_h = None
    if obs.compression_knee is not None:
        if obs.compression_knee <= 0.0:
            raise ValueError("a compression knee is a drive level > 0")
        # Invert F = |mu|^(3/2).
        mu_h = -float(obs.compression_knee ** (2.0 / 3.0))

    if add == 0.0:
        verdict = (
            f"already at or past the optimum (theta/sigma {ratio:.2f} <= {THETA_OVER_SIGMA_OPT:.1f}); "
            "added noise is predicted to reduce, not improve, detection"
        )
    elif add_lo == 0.0:
        verdict = (
            f"below the optimum (theta/sigma {ratio:.2f}) but the measurement uncertainty "
            "spans the optimum; the prescription is not separated from zero"
        )
    else:
        verdict = (
            f"below the optimum (theta/sigma {ratio:.2f}); adding noise at "
            f"{add:.3f} theta [{add_lo:.3f}, {add_hi:.3f}] is predicted to improve detection"
        )

    return Prescription(
        theta_over_sigma=float(ratio),
        theta_over_sigma_lo=float(lo),
        theta_over_sigma_hi=float(hi),
        add_noise_fraction=add,
        add_noise_fraction_lo=add_lo,
        add_noise_fraction_hi=add_hi,
        mu_h=mu_h,
        verdict=verdict,
    )


def knee_for(mu_h: float) -> float:
    """Forward direction: the knee an ear at distance ``mu_h`` should show.

    Kept beside the inverse so a calibration can be checked against a second
    measurement on the same patient rather than trusted. Delegates to the truth
    module, which is the only definition.
    """
    return _nf.crossover_drive(mu_h)
