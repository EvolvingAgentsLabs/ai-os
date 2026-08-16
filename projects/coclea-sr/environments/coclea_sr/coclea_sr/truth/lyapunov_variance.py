"""Stationary variance of a driven, damped mode. The truth value for GATE-A9.

Spec §4.1: in the modal basis the semidiscretised stochastic system (4.1) is a
set of independent two-dimensional Ornstein-Uhlenbeck processes, so **the field
is Gaussian and its statistics are exactly computable**. That is the property the
whole design rests on: the linear field is analytic, and every non-Gaussianity —
every bit of the stochastic resonance — is manufactured by the threshold in
`detector.py`. If the field's variance is wrong, nothing downstream means
anything, and no amount of looking at an SR curve would tell you.

## The derivation, done rather than quoted

Mode ``n`` obeys ``q'' + 2 G q' + w^2 q = xi`` with ``<xi(t) xi(t')> = 2 D
delta(t - t')``. As a first-order system, ``z = (q, q')``::

    dz = A z dt + Sigma dW,    A = [[0, 1], [-w^2, -2G]],  Sigma Sigma^T = [[0,0],[0,2D]]

and the stationary covariance ``P`` is the solution of the continuous Lyapunov
equation

    A P + P A^T + Sigma Sigma^T = 0

which sympy solves here symbolically rather than being asserted. The answer is

    Var(q)  = D / (2 G w^2)
    Var(q') = D / (2 G)
    Cov(q, q') = 0

The vanishing cross-covariance is not decoration: it is what makes
``sigma_qdot / sigma_q = w`` exactly, which is the ratio Rice's crossing formula
needs (`rice_sr_toy.py`). Position and velocity of a stationary damped mode are
uncorrelated at equal times, and the whole 0-D theory of GATE-A10 follows from it.

Imports nothing from `src/` — spec §6.4 rule 4.
"""

from __future__ import annotations

import sympy as sp


def lyapunov_solution() -> dict[str, sp.Expr]:
    """Solve ``A P + P A^T + Sigma Sigma^T = 0`` symbolically.

    Returns the three entries of ``P``. Solved rather than written down, so a
    transposed sign in the drift matrix is caught here and not agreed with.
    """
    w, G, D = sp.symbols("omega Gamma D", positive=True)
    p11, p12, p22 = sp.symbols("p11 p12 p22", real=True)

    A = sp.Matrix([[0, 1], [-(w**2), -2 * G]])
    P = sp.Matrix([[p11, p12], [p12, p22]])
    Q = sp.Matrix([[0, 0], [0, 2 * D]])

    residual = A * P + P * A.T + Q
    sol = sp.solve([residual[0, 0], residual[0, 1], residual[1, 1]], [p11, p12, p22], dict=True)
    if not sol:
        raise RuntimeError("the Lyapunov equation had no solution; the drift matrix is wrong")
    s = sol[0]
    return {
        "var_q": sp.simplify(s[p11]),
        "cov": sp.simplify(s[p12]),
        "var_qdot": sp.simplify(s[p22]),
    }


def variance(omega: float, gamma: float, noise_intensity: float) -> float:
    """``Var(q) = D / (2 G w^2)``. ``gamma`` is ``G``, the half-bandwidth."""
    if omega <= 0 or gamma <= 0:
        raise ValueError("a mode with no frequency or no damping has no stationary state")
    return noise_intensity / (2.0 * gamma * omega**2)


def velocity_variance(omega: float, gamma: float, noise_intensity: float) -> float:
    """``Var(q') = D / (2 G)`` -- independent of ``w``, which is the fact that
    makes the crossing rate depend on ``w`` only through ``sigma_qdot/sigma_q``."""
    if gamma <= 0:
        raise ValueError("no damping, no stationary state")
    return noise_intensity / (2.0 * gamma)


def crossing_rate_ratio(omega: float) -> float:
    """``sigma_qdot / sigma_q = w`` exactly, for any ``D`` and ``G``.

    Rice's formula for the upcrossing rate of a stationary Gaussian process needs
    this ratio. For a damped mode it is the mode's own frequency — the noise
    intensity and the damping cancel — and that cancellation is why GATE-A10's
    prediction has no free parameters left in it.
    """
    return omega


def response_amplitude(omega: float, gamma: float, drive_omega: float, drive: float) -> float:
    """Steady-state amplitude of ``q`` under ``A sin(Omega t)``.

    ``|A| / |w^2 - Omega^2 + 2 i G Omega|``. Needed by GATE-A10 because the
    threshold sees the *response*, not the drive, and using the drive amplitude
    instead would misplace the predicted optimum by the resonance factor.
    """
    denom = complex(omega**2 - drive_omega**2, 2.0 * gamma * drive_omega)
    return abs(drive) / abs(denom)
