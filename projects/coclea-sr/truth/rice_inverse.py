"""Rice's crossing rate, inverted. The truth value for E4.

Spec §4.5 states the project's falsifiable prediction and, in one parenthesis,
the only way to test it: *"σ_est a partir de r₀ y θ"* — infer the noise level
from the **spontaneous rate**, which is measurable, rather than from a
displacement, which is not.

## Why the inversion is the whole trick

The model lives in dimensionless displacement (§3.3 sets `ũ = u / u_ref` and
never fixes `u_ref`), so its optimum ``σ_opt = θ/2`` cannot be compared against a
figure in nanometres without inventing a scale. Any such comparison would be a
statement about the scale somebody chose.

Rice's rate removes the problem, because the displacement units cancel inside it:

    r0 = (ω_eff / 2π) exp(−θ² / 2σ²)

Solve for the **ratio**:

    θ/σ = sqrt( 2 ln( ω_eff / (2π r0) ) )

Both sides are now dimensionless. The model says the optimum is at ``θ/σ = 2``.
Physiology supplies ``r0`` — the spontaneous firing rate of an auditory nerve
fibre — and ``ω_eff/2π``, the effective bandwidth of the internal noise, for
which a fibre's characteristic frequency is the natural stand-in. **No
displacement scale enters anywhere.**

## How robust it actually is — measured, after a wrong guess

``θ/σ`` depends on ``r0`` only through a **logarithm under a square root**, and
the first draft of this docstring claimed that made a factor of ten in the
spontaneous rate worth "about 20%". **Measured: 41%**, and only downward — a
tenfold *increase* runs into the ceiling ``r0 → ω_eff/2π`` where the crossing
picture stops applying at all. `sensitivity_to_rate` now reports the two
directions separately instead of taking the larger and calling it symmetric.

So the honest statement is compression, not insensitivity: across the **whole**
physiological span of spontaneous rates at 1 kHz — 0.5 to 100 spikes per second,
a factor of two hundred — ``θ/σ`` moves only from 3.90 to 2.15, less than a
factor of two. What that buys is that the **ordering** of the verdict is safe
even when the individual numbers are not: high-rate fibres come out nearer the
optimum than low-rate fibres by a margin no plausible measurement error closes.
The exact percentage is not safe, and E4 reports its sensitivity beside it.

Imports nothing from `src/` — spec §6.4 rule 4.
"""

from __future__ import annotations

import math

import sympy as sp


def inversion_symbolic() -> sp.Expr:
    """Solve Rice's rate for ``θ/σ`` in sympy rather than restating the algebra."""
    theta, sigma, r0, w = sp.symbols("theta sigma r_0 omega_eff", positive=True)
    rate = (w / (2 * sp.pi)) * sp.exp(-(theta**2) / (2 * sigma**2))
    ratio = sp.Symbol("R", positive=True)  # R = theta / sigma
    solved = sp.solve(sp.Eq(rate.subs(theta, ratio * sigma), r0), ratio)
    positive = [s for s in solved if s.is_positive is not False]
    if not positive:
        raise RuntimeError(f"no positive solution for theta/sigma; sympy gave {solved}")
    return sp.simplify(positive[0])


def threshold_over_sigma(rate: float, omega_eff: float) -> float:
    """``θ/σ = sqrt(2 ln(ω_eff / (2π r0)))``.

    Raises rather than returning a complex number when ``r0`` exceeds the
    zero-threshold crossing rate ``ω_eff/2π``: that is a fibre firing faster than
    a threshold at zero would allow, which means the Gaussian-crossing picture
    does not describe it and no ``θ/σ`` exists to report. Returning NaN would let
    it flow into an average.
    """
    if rate <= 0:
        raise ValueError("a rate of zero implies an infinite threshold")
    ceiling = omega_eff / (2.0 * math.pi)
    if rate >= ceiling:
        raise ValueError(
            f"rate {rate:.4g} is at or above the zero-threshold rate {ceiling:.4g}; "
            "Rice's picture does not apply and theta/sigma is undefined"
        )
    return math.sqrt(2.0 * math.log(ceiling / rate))


def rate_from_ratio(ratio: float, omega_eff: float) -> float:
    """The forward direction, for round-tripping the inversion."""
    return (omega_eff / (2.0 * math.pi)) * math.exp(-(ratio**2) / 2.0)


def rate_at_optimum(omega_eff: float) -> float:
    """The spontaneous rate a detector sitting exactly at the SR optimum would show.

    ``θ/σ = 2`` gives ``r0 = (ω_eff/2π) e^{-2} = 0.1353 (ω_eff/2π)``: **a fibre at
    the stochastic-resonance optimum fires spontaneously at 13.5% of its
    effective bandwidth.** That single number is what E4 confronts with
    physiology, and it contains no free parameter at all.
    """
    return rate_from_ratio(2.0, omega_eff)


def distance_from_optimum(rate: float, omega_eff: float) -> float:
    """Relative distance of a measured fibre from ``θ/σ = 2``."""
    return abs(threshold_over_sigma(rate, omega_eff) - 2.0) / 2.0


def sensitivity_to_rate(rate: float, omega_eff: float, factor: float = 10.0) -> dict:
    """How much ``θ/σ`` moves when ``r0`` is wrong by ``factor``, in each direction.

    Returned as two numbers and not one. The first version took the larger of the
    two and reported it as *the* sensitivity, which gave 97.9% at 1 kHz — a figure
    produced entirely by the upward arm being clamped against the ceiling
    ``ω_eff/2π``, where the formula does not apply. Averaging or maximising over a
    direction that is undefined manufactures a number out of a boundary.

    ``up`` is ``None`` when a tenfold increase would cross that ceiling, which is
    the truthful answer: not a large sensitivity, but no sensitivity to report.
    """
    mid = threshold_over_sigma(rate, omega_eff)
    ceiling = omega_eff / (2.0 * math.pi)

    down = abs(threshold_over_sigma(rate / factor, omega_eff) - mid) / mid
    up = None
    if rate * factor < ceiling:
        up = abs(threshold_over_sigma(rate * factor, omega_eff) - mid) / mid
    return {
        "theta_over_sigma": mid,
        "relative_change_if_rate_divided_by_factor": down,
        "relative_change_if_rate_multiplied_by_factor": up,
        "factor": factor,
        "rate_ceiling": ceiling,
        "upward_arm_crosses_ceiling": up is None,
    }
