"""Closed form for the transmission line with constant impedance.
The truth value for GATE-C1.

[ADR-0002](../decisions/0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md)
replaces the string-with-a-ground-spring with the long-wave cochlear
transmission line, on the pressure difference across the partition::

    P''(x) + k^2(x) P(x) = 0,    k^2(x) = beta^2 Omega^2 / Z(x)
    Z(x) = S(x) - Omega^2 M(x) + i Omega R(x)
    P(0) = 1  (the stapes),   P(L) = 0  (the helicotrema)

A new operator needs a truth value of its own before it is allowed to produce
results, and this is it: with ``S``, ``M`` and ``R`` constant, ``Z`` is constant,
``k`` is constant and the boundary-value problem is elementary::

    P(x) = sin(k (1 - x)) / sin(k)

which satisfies ``P(0) = 1``, ``P(1) = 0`` and ``P'' = -k^2 P`` identically, for
**complex** ``k`` — damping included, no separate case.

## Why the uniform case is the right first gate and not a soft one

It is tempting to gate a new operator only on the physics it was built for — here,
that the traveling wave runs the right way. That check is necessary and it is
not sufficient: it is a statement about a *sign*, and a solver with the right
signs and the wrong stencil passes it. The uniform box tests the discretisation
itself against an exact solution, in the same complex arithmetic production uses,
and it is the only gate here that can catch an error of a constant factor.

The physics check — GATE-C2, the pre-registered acceptance condition of
ADR-0002 — comes after, on top of a solver that is already known to solve.

Imports nothing from `src/` — spec §6.4 rule 4.
"""

from __future__ import annotations

import numpy as np
import sympy as sp


def verify_solution() -> bool:
    """Check ``P'' + k^2 P = 0`` and both boundary conditions, symbolically."""
    x, k = sp.symbols("x k")
    P = sp.sin(k * (1 - x)) / sp.sin(k)
    residual = sp.simplify(sp.diff(P, x, 2) + k**2 * P)
    at0 = sp.simplify(P.subs(x, 0))
    at1 = sp.simplify(P.subs(x, 1))
    return bool(residual == 0 and at0 == 1 and at1 == 0)


def pressure(x, k: complex) -> np.ndarray:
    """``P(x) = sin(k(1-x)) / sin(k)`` for complex ``k``."""
    xs = np.asarray(x, dtype=float)
    return np.sin(k * (1.0 - xs)) / np.sin(k)


def wavenumber(beta: float, omega: float, impedance: complex) -> complex:
    """``k = beta Omega / sqrt(Z)``, on the branch with ``Im(k) <= 0``.

    The branch matters and choosing it wrongly is not a cosmetic error: the two
    square roots give a wave decaying *away* from the stapes and one growing
    without bound toward the apex. Both satisfy the differential equation; only
    one is the physical solution of a driven passive line, and a run that picked
    the other would report an amplitude that grows with distance and still pass
    a residual check.
    """
    k = beta * omega / np.sqrt(complex(impedance))
    return k if k.imag <= 0 else -k


def impedance(stiffness: float, mass: float, damping: float, omega: float) -> complex:
    """``Z = S - Omega^2 M + i Omega R``. The partition's point impedance."""
    return complex(stiffness - omega**2 * mass, omega * damping)


def displacement(x, k: complex, impedance_value: complex) -> np.ndarray:
    """``U = P / Z`` -- what the membrane actually does."""
    return pressure(x, k) / impedance_value
