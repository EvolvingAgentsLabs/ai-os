"""Closed-form modes of the uniform fixed-free string. The truth value for GATE-A1.

Derived from the spec §2.2. With ``mu`` and ``K`` constant, ``gamma = 0`` and
``c**2 = K/mu``, separation of variables ``u = phi(x) e^{i w t}`` gives

    phi'' + (w/c)**2 phi = 0,   phi(0) = 0,   phi'(L) = 0

so ``phi_n(x) = sin(k_n x)`` with ``k_n L = (2n-1) pi / 2`` and therefore

    w_n = (2n-1) pi c / (2 L)                                       (spec 2.4)

Only the odd quarter-wave harmonics survive. That is the whole content of the
gate, and it is worth stating why it deserves a module of its own rather than a
literal in the test: **the truth value must not be produced by the code under
test.** Spec §6.4 rule 4 forbids ``truth/`` from importing ``src/`` and this file
imports nothing from it — `sympy` derives the eigenvalue relation symbolically
rather than restating it, so a wrong sign in the boundary condition would be
caught here rather than agreed with.
"""

from __future__ import annotations

import sympy as sp


def eigenvalue_relation() -> sp.Eq:
    """Re-derive ``phi'(L) = 0`` symbolically and return the relation it forces.

    Not decoration. The alternative -- writing ``(2n-1)*pi*c/(2L)`` straight into
    the test -- makes the gate a test of whether someone typed the same formula
    twice. Here the ODE is solved, the boundary conditions are applied, and the
    surviving condition is ``cos(w L / c) = 0``, which is the statement the gate
    is actually about.
    """
    x, w, c, L = sp.symbols("x omega c L", positive=True)
    # Amplitudes are NOT positive symbols. `B` has to be allowed to be zero --
    # that is the entire content of the Dirichlet condition -- and declaring it
    # positive makes `solve` return an empty set for the one answer that matters.
    A = sp.Symbol("A", nonzero=True)
    B = sp.Symbol("B")
    phi = A * sp.sin(w * x / c) + B * sp.cos(w * x / c)

    # phi(0) = 0 kills the cosine.
    at_zero = sp.simplify(phi.subs(x, 0))
    solved_B = sp.solve(sp.Eq(at_zero, 0), B)[0]
    phi = phi.subs(B, solved_B)

    # phi'(L) = 0 is the free end. A != 0 and w, c, L > 0, so the whole content
    # is the cosine factor.
    at_L = sp.simplify(sp.diff(phi, x).subs(x, L))
    return sp.Eq(sp.simplify(at_L / (A * w / c)), 0)


def omega(n: int, c: float, length: float) -> float:
    """``w_n`` for the n-th mode, ``n >= 1``. Spec (2.4)."""
    if n < 1:
        raise ValueError("modes are numbered from 1")
    return (2 * n - 1) * float(sp.pi) * c / (2.0 * length)


def omegas(n_modes: int, c: float, length: float) -> list[float]:
    return [omega(n, c, length) for n in range(1, n_modes + 1)]


def mode_shape(n: int, x, c: float, length: float):
    """``phi_n(x) = sin(k_n x)``, unnormalised. Accepts a scalar or a numpy array."""
    import numpy as np

    k = omega(n, c, length) / c
    return np.sin(k * np.asarray(x, dtype=float))


def interior_zeros(n: int) -> int:
    """The oscillation theorem's prediction: ``phi_n`` has exactly ``n-1`` interior zeros.

    Trivial here and stated anyway, because GATE-A3 compares a *count from the
    numerics* against a *count from the theory*, and the theory's count has to
    come from somewhere that is not the numerics.
    """
    return n - 1
