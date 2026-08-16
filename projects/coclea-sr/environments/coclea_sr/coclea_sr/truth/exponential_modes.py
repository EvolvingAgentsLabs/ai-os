"""Closed-form modes of the exponential profile. The truth value for GATE-A8.

This is the load-bearing gate of the passive layer, and the reason is stated in
spec §2.6: GATE-A1 validates a solver whose stiffness matrix has one number in
it repeated. A1 passing tells you almost nothing about whether ``K(x)`` was
assembled correctly, because a solver that ignores ``K(x)`` entirely still
passes it. A8 puts a genuinely varying coefficient in the matrix and checks it
against an independent, closed-form truth.

## The derivation

With ``K(x) = K0 e^{-a x}`` and ``mu(x) = mu0 e^{-a x}`` (the same exponential,
so ``c = sqrt(K0/mu0)`` is constant and only the impedance varies), the
Sturm-Liouville problem ``-(K phi')' = w^2 mu phi`` reduces to a constant
coefficient ODE::

    -(K phi'' + K' phi') = w^2 mu phi
    -K0 e^{-ax} (phi'' - a phi') = w^2 mu0 e^{-ax} phi
    phi'' - a phi' + (w/c)^2 phi = 0

with the exponentials cancelling exactly. Roots ``r = a/2 +- i b``,
``b = sqrt((w/c)^2 - a^2/4)``, so

    phi(x) = e^{a x / 2} (A sin(b x) + B cos(b x))

``phi(0) = 0`` gives ``B = 0``; ``phi'(L) = 0`` gives the transcendental relation

    (a/2) sin(bL) + b cos(bL) = 0      i.e.    tan(bL) = -2b/a       (spec 2.11)

and then ``w_n = c sqrt(b_n^2 + a^2/4)`` in closed-implicit form.

## Why the non-singular form is the one that is solved

``tan(bL) = -2b/a`` has poles wherever ``cos(bL) = 0``, which is *inside* every
bracketing interval. Root-finding on it means root-finding on a function that
runs to infinity between the bracket ends, and a bisection will happily converge
onto the pole and report it as a mode. The equivalent form
``f(b) = (a/2) sin(bL) + b cos(bL)`` is entire, and that is what is solved.

## That the brackets miss nothing

``a > 0``, so the right-hand side of ``tan(bL) = -2b/a`` is strictly negative and
the roots sit where the tangent is negative: ``b_n L`` in ``((2n-1)pi/2, n pi)``.
Two ends have to be closed for that to be a complete list, and both are checked
in `gates/test_A08_exponential_eigenvalues.py` rather than asserted here:

* **Below the first bracket.** On ``bL`` in ``(0, pi/2)`` both ``sin`` and ``cos``
  are positive, so ``f > 0`` and there is no root.
* **The non-oscillatory branch.** If ``(w/c)^2 < a^2/4`` then ``b = i v`` and
  ``phi = e^{ax/2} sinh(v x)``, whose derivative
  ``e^{ax/2}((a/2) sinh(vx) + v cosh(vx))`` is strictly positive for
  ``a, v, x > 0``. It can never satisfy ``phi'(L) = 0``, so no mode hides there.

Miss either and the numerics would be compared against a truth list whose first
entry is the solver's second mode -- a failing gate whose message points at the
solver.
"""

from __future__ import annotations

import mpmath as mp

# 50 digits: the gate's tolerance is 1e-5 relative, and the truth value must not
# be the thing consuming the budget. Set once, here, so a gate cannot quietly
# loosen it.
mp.mp.dps = 50


def _f(b, alpha: float, length: float):
    """The entire form of (2.11). Zero at every mode, finite everywhere."""
    return (mp.mpf(alpha) / 2) * mp.sin(b * length) + b * mp.cos(b * length)


def beta(n: int, alpha: float, length: float) -> mp.mpf:
    """The n-th root of (2.11), ``n >= 1``, by bisection inside its own bracket."""
    if n < 1:
        raise ValueError("modes are numbered from 1")
    if alpha <= 0:
        raise ValueError("the bracketing argument above assumes alpha > 0")
    lo = mp.mpf(2 * n - 1) * mp.pi / (2 * length)
    hi = mp.mpf(n) * mp.pi / length
    # Nudge off the interval ends: both are exact zeros of one of the two terms
    # and mpmath's bisection wants a genuine sign change.
    eps = (hi - lo) * mp.mpf("1e-30")
    return mp.findroot(
        lambda b: _f(b, alpha, length), (lo + eps, hi - eps), solver="bisect", tol=mp.mpf("1e-45")
    )


def omega(n: int, alpha: float, length: float, c: float) -> float:
    """``w_n = c sqrt(b_n^2 + a^2/4)``. Spec §2.6."""
    b = beta(n, alpha, length)
    return float(c * mp.sqrt(b**2 + (mp.mpf(alpha) ** 2) / 4))


def omegas(n_modes: int, alpha: float, length: float, c: float) -> list[float]:
    return [omega(n, alpha, length, c) for n in range(1, n_modes + 1)]


def mode_shape(n: int, x, alpha: float, length: float):
    """``phi_n(x) = e^{a x / 2} sin(b_n x)``, unnormalised."""
    import numpy as np

    b = float(beta(n, alpha, length))
    xs = np.asarray(x, dtype=float)
    return np.exp(alpha * xs / 2.0) * np.sin(b * xs)


def residual(n: int, alpha: float, length: float) -> float:
    """``|f(b_n)|`` -- how well the returned root actually solves (2.11).

    Reported by the gate rather than trusted. A root finder that returns the
    bracket midpoint on failure is indistinguishable from one that converged,
    unless somebody evaluates the function there.
    """
    return float(abs(_f(beta(n, alpha, length), alpha, length)))
