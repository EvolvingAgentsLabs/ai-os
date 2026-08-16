"""Threshold stochastic resonance in 0-D, from Rice's crossing rate.
The truth value for GATE-A10.

Spec §4.2 and §4.4. This is the gate that validates **the entire measurement
pipeline** — PSD, windowing, SNR definition, crossing detection — on a system
whose answer is known in closed form, before any of it is pointed at the PDE. A
pipeline first exercised on the thing it is meant to measure cannot be told apart
from the thing it is measuring.

## Why the toy is a damped oscillator and not an OU process

The obvious 0-D toy is an Ornstein-Uhlenbeck process plus a threshold, and it is
the wrong one: **an OU path is not differentiable**, so its expected upcrossing
rate is infinite and Rice's formula does not apply to it at all. Any finite
number a simulation reported would be an artefact of the time step.

A damped mode driven by white noise — which is exactly what one mode of the
semidiscretised membrane is (§4.1) — has a *smooth* position: the white noise
enters the velocity, so ``q`` is differentiable and Rice applies. The toy is
therefore a genuine reduction of the real system rather than an analogy to it.

## The prediction, and why it has no free parameters

For a stationary Gaussian ``q`` with standard deviation ``sigma`` and threshold
``theta``, Rice's upcrossing rate is

    r0 = (1 / 2pi) (sigma_qdot / sigma_q) exp(-theta^2 / 2 sigma^2)

and `lyapunov_variance.crossing_rate_ratio` shows ``sigma_qdot / sigma_q = w``
exactly — the noise intensity and the damping cancel. So

    r0(sigma) = (w / 2pi) exp(-theta^2 / 2 sigma^2)

With a weak subthreshold tone, the response amplitude ``a`` modulates the
threshold, and to first order in ``a`` the rate is ``r0 (1 + (a theta / sigma^2)
sin(Omega t))``. Signal power at ``Omega`` goes as the square of that modulation
depth; the noise floor of a point process is its own rate. So

    SNR(sigma)  proportional to  r0(sigma) (a theta / sigma^2)^2
                =  const * exp(-theta^2 / 2 sigma^2) / sigma^4

Maximising gives — and `optimum_sigma_symbolic` derives it rather than asserting
it —

    **sigma_opt = theta / 2**

No noise intensity, no damping, no drive amplitude, no proportionality constant.
Everything that could have been tuned cancels, which is what makes this a gate
rather than a fit: there is nothing left to adjust to make a simulation agree.

Imports nothing from `src/` — spec §6.4 rule 4.
"""

from __future__ import annotations

import math

import sympy as sp


def optimum_sigma_symbolic() -> sp.Expr:
    """Derive ``sigma_opt`` by maximising the SNR expression in sympy.

    The stationary point of ``log SNR`` is taken rather than of ``SNR`` itself:
    the two have the same argmax and the logarithm turns a product of an
    exponential and a power into a sum sympy solves without hand-holding.
    """
    sigma, theta = sp.symbols("sigma theta", positive=True)
    snr = sp.exp(-(theta**2) / (2 * sigma**2)) / sigma**4
    stationary = sp.solve(sp.diff(sp.log(snr), sigma), sigma)
    positive = [s for s in stationary if s.is_positive or s == theta / 2]
    if not positive:
        raise RuntimeError(f"no positive stationary point; sympy returned {stationary}")
    return sp.simplify(positive[0])


def optimum_sigma(theta: float) -> float:
    """``sigma_opt = theta / 2``. The whole content of GATE-A10."""
    return theta / 2.0


def crossing_rate(omega: float, theta: float, sigma: float) -> float:
    """Rice's upcrossing rate for the damped mode, ``r0(sigma)``."""
    if sigma <= 0:
        return 0.0
    return (omega / (2.0 * math.pi)) * math.exp(-(theta**2) / (2.0 * sigma**2))


def snr_shape(omega: float, theta: float, sigma: float, response_amplitude: float) -> float:
    """The theoretical SNR curve, up to one constant that does not move its peak.

    Returned unnormalised on purpose. The gate compares the *position* of the
    maximum, which spec §4.2 fixes at 15%, because the absolute level depends on
    windowing and binning conventions that are properties of the estimator rather
    than of the physics — and a gate on a number the estimator defines would be a
    gate on the estimator's conventions.
    """
    if sigma <= 0:
        return 0.0
    modulation = response_amplitude * theta / sigma**2
    return crossing_rate(omega, theta, sigma) * modulation**2


def subthreshold_bound(theta: float, response_amplitude: float) -> bool:
    """Is the tone genuinely subthreshold?

    ``a < theta``. If it is not, the detector fires on the signal alone, the
    inverted-U disappears into a monotone curve, and the run measures a
    suprathreshold detector — which is spec §R2's warning that stochastic
    resonance can be manufactured by the detector's design. Checked before every
    A10 run rather than assumed from the parameters.
    """
    return response_amplitude < theta
