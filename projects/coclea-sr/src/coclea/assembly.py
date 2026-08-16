"""Semidiscretisation of the membrane. Spec §5.1, in conservative flux form.

The operator being discretised is ADR-0001's::

    d/dt[mu du/dt] = d/dx[K du/dx] - S u - gamma du/dt + F
    u(0,t) = 0                      Dirichlet, the base
    du/dx(L,t) = 0                  Neumann, the apex (helicotrema)

producing ``M u'' = -Sm u - C u' + F`` with ``M`` and ``C`` diagonal and ``Sm``
symmetric tridiagonal.

## Why finite volume rather than the ghost node the spec suggests

Spec §5.1 prescribes a second-order Neumann via a ghost node,
``u_{N+1} = u_{N-1}``. Substituted into the interior stencil that produces the
apex row

    Sm[N,N] = (K_{N+1/2} + K_{N-1/2}) / dx^2,   Sm[N,N-1] = -(K_{N+1/2} + K_{N-1/2}) / dx^2

while the row above it still contributes ``Sm[N-1,N] = -K_{N-1/2}/dx^2``. **The
matrix is not symmetric**, and GATE-A11 -- which the same section demands, at
``1e-12`` -- fails on the assembly the section prescribes. The two requirements
are inconsistent as written.

The finite-volume form resolves it and is second order for the same reason the
ghost node was meant to be: the apex node owns a **half cell** of width ``dx/2``
with zero flux through its outer face. That gives

    Sm[N,N] = K_{N-1/2}/dx,  Sm[N,N-1] = Sm[N-1,N] = -K_{N-1/2}/dx,  M[N,N] = mu_N dx/2

which is symmetric by construction, conserves mass exactly, and is the mass-lumped
linear finite element method on a uniform grid -- second order in the eigenvalues,
which GATE-A12 measures rather than assumes.

Note the shape of what is stored: ``Sm`` and ``M`` are *integrated* over their
cells (units of ``1/dx`` and ``dx``), not divided by ``dx^2`` as in the spec's
(5.1). The generalised eigenproblem ``Sm phi = w^2 M phi`` is identical either
way, and the integrated form is the one in which symmetry is manifest.

## The deliberate defect

``neumann="lumped-full-cell"`` assembles the apex node with a **full** cell of
mass while keeping the correct zero-flux stiffness row. It is the ordinary
version of this mistake -- forgetting that the boundary node owns half a cell --
and it is here on purpose, as the fixture that proves GATE-A12 can go red. A
gate that has never failed is not evidence that it works, and this defect is
chosen because it leaves the matrix symmetric and positive definite: GATE-A11
passes, the spectrum is real and ordered, the mode shapes have the right number
of zeros, and the answer is wrong. See `gates/test_A12_convergence.py`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from .profiles import BMProfile

NeumannScheme = Literal["flux", "lumped-full-cell"]


@dataclass(frozen=True)
class System:
    """The assembled semidiscrete system on the interior + apex nodes.

    ``Sm`` is symmetric tridiagonal and stored as its two bands, because that is
    what makes the eigensolve ``O(N)`` per eigenvalue instead of ``O(N^3)`` --
    at ``N = 4000`` (GATE-A12's largest grid) the dense route is minutes and this
    one is milliseconds.
    """

    #: Node positions, ``x_1 .. x_N``. The Dirichlet node ``x_0 = 0`` is eliminated.
    x: np.ndarray
    #: Main diagonal of the stiffness operator, integrated over cells.
    Sd: np.ndarray
    #: Off-diagonal of the stiffness operator, length ``N-1``.
    Se: np.ndarray
    #: Diagonal mass, integrated over cells.
    Md: np.ndarray
    #: Diagonal damping, integrated over cells.
    Cd: np.ndarray
    #: Cell volumes. Kept so quadrature elsewhere uses the same weights.
    volume: np.ndarray
    profile: BMProfile
    scheme: NeumannScheme

    @property
    def n(self) -> int:
        return self.x.size

    @property
    def dx(self) -> float:
        return float(self.x[0])

    def dense_stiffness(self) -> np.ndarray:
        """``Sm`` as a full matrix. For GATE-A11 only -- never for solving."""
        m = np.diag(self.Sd)
        idx = np.arange(self.n - 1)
        m[idx, idx + 1] = self.Se
        m[idx + 1, idx] = self.Se
        return m


def assemble(profile: BMProfile, N: int, scheme: NeumannScheme = "flux") -> System:
    """Assemble on ``N`` cells over the dimensionless membrane ``x`` in ``[0, 1]``.

    Unknowns are ``u_1 .. u_N`` at ``x_i = i/N``; ``u_0 = 0`` is the Dirichlet
    base and is eliminated rather than constrained, so no zero row enters the
    generalised eigenproblem and ``M`` stays positive definite.
    """
    if N < 4:
        raise ValueError("N must be at least 4 for the stencil to mean anything")

    dx = 1.0 / N
    x = np.arange(1, N + 1, dtype=float) * dx

    # Faces at x_{i-1/2} for i = 1..N, and the outer face x_{N+1/2} which carries
    # no flux. Evaluated AT the midpoint, not averaged from the nodes: spec §5.1
    # is right that the arithmetic mean of neighbouring nodes is the wrong
    # instinct, though for a smooth K both are second order.
    faces_lower = profile.K(x - dx / 2.0)  # K_{i-1/2}, i = 1..N
    faces_upper = profile.K(x[:-1] + dx / 2.0)  # K_{i+1/2}, i = 1..N-1

    volume = np.full(N, dx)
    volume[-1] = dx / 2.0  # the apex owns half a cell

    # Stiffness, integrated over cells. Interior rows see both faces; the apex
    # row sees only its inner one, which is exactly du/dx(L) = 0.
    Sd = np.empty(N)
    Sd[:-1] = (faces_upper + faces_lower[:-1]) / dx
    Sd[-1] = faces_lower[-1] / dx
    Se = -faces_upper / dx

    # ADR-0001's stiffness to ground, and the damping. Both are cell integrals of
    # a pointwise coefficient, so both carry the same volume weights -- including
    # the apex half cell.
    Sd = Sd + profile.S(x) * volume
    Cd = profile.gamma(x) * volume

    Md = profile.mu(x) * volume

    if scheme == "lumped-full-cell":
        # The deliberate defect. Stiffness untouched, mass wrong by one half
        # cell at the apex -- an O(dx) error in the total mass, and therefore an
        # O(dx) error in every eigenvalue. Symmetric and positive definite, so
        # nothing but a convergence study can see it.
        Md = Md.copy()
        Md[-1] = profile.mu(x[-1]) * dx
    elif scheme != "flux":
        raise ValueError(f"unknown Neumann scheme: {scheme!r}")

    return System(
        x=x, Sd=Sd, Se=Se, Md=Md, Cd=Cd, volume=volume, profile=profile, scheme=scheme
    )


def symmetry_defect(sys: System) -> float:
    """``||Sm - Sm^T||_inf``. GATE-A11.

    Zero by construction here -- the off-diagonal is stored once and mirrored --
    and measured anyway, because the value of the gate is that it fails if
    somebody replaces this assembly with one that writes the two bands
    separately, which is precisely the ghost-node form the module docstring
    rejects.
    """
    m = sys.dense_stiffness()
    return float(np.max(np.abs(m - m.T)))
