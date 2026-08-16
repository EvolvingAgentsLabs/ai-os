"""Eigenmodes of the assembled membrane, and the Sturm-Liouville properties
spec §2.3 guarantees. GATE-A2, A3, A4.

The generalised problem ``Sm phi = w^2 M phi`` has a diagonal ``M``, so it is
solved by symmetrising rather than by a general dense routine::

    A = M^{-1/2} Sm M^{-1/2}      still symmetric tridiagonal
    A y = w^2 y                   `scipy.linalg.eigh_tridiagonal`
    phi = M^{-1/2} y              and then phi^T M phi = y^T y = I

Spec §5.1 says "never invert M explicitly for the report of gates". ``M`` here is
diagonal and strictly positive (`assemble` eliminates the Dirichlet node rather
than zeroing its row, which is what keeps it so), and ``M^{-1/2}`` is an
elementwise reciprocal square root of positive numbers -- not an inversion, and
exact to a rounding. The reason behind the rule -- do not let an ill-conditioned
solve contaminate the truth comparison -- is met, and met better than by a dense
generalised solver.

The saving is not cosmetic: GATE-A12's largest grid is ``N = 4000``, where the
dense generalised route is minutes of ``O(N^3)`` and this is milliseconds.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.linalg import eigh_tridiagonal

from .assembly import System


@dataclass(frozen=True)
class Modes:
    """``n_modes`` eigenpairs, ascending. ``phi[:, k]`` is the k-th mode."""

    #: Angular frequencies ``w_1 <= w_2 <= ...``, dimensionless.
    omega: np.ndarray
    #: Mode shapes at the interior + apex nodes, ``M``-orthonormal.
    phi: np.ndarray
    #: Node positions, echoed from the system.
    x: np.ndarray
    system: System

    @property
    def n_modes(self) -> int:
        return self.omega.size


def eigenmodes(sys: System, n_modes: int) -> Modes:
    if n_modes < 1 or n_modes > sys.n:
        raise ValueError(f"n_modes must be in [1, {sys.n}]")

    inv_sqrt_m = 1.0 / np.sqrt(sys.Md)
    d = sys.Sd * inv_sqrt_m * inv_sqrt_m
    e = sys.Se * inv_sqrt_m[:-1] * inv_sqrt_m[1:]

    lam, y = eigh_tridiagonal(d, e, select="i", select_range=(0, n_modes - 1))

    # A negative eigenvalue here would be a physically impossible membrane and a
    # silently complex frequency downstream. Clipping would hide it; raising is
    # the point.
    if np.any(lam < 0.0):
        raise FloatingPointError(f"negative eigenvalue {lam.min():.3e}: Sm is not PSD")

    phi = y * inv_sqrt_m[:, None]

    # Fix the sign so `phi[0] > 0` for every mode. Eigenvector sign is arbitrary
    # and comparing shapes against an analytic truth with a free sign turns a
    # correct mode into a failing gate half the time.
    flip = np.where(phi[0, :] < 0.0, -1.0, 1.0)
    phi = phi * flip

    return Modes(omega=np.sqrt(lam), phi=phi, x=sys.x, system=sys)


def gram(modes: Modes) -> np.ndarray:
    """``phi^T M phi`` -- the mass-weighted Gram matrix.

    **What this does and does not prove.** ``eigh_tridiagonal`` returns an
    orthonormal ``y``, and ``phi = M^{-1/2} y``, so this is the identity by
    construction to machine precision. It therefore checks that ``M`` is
    positive and that the symmetrisation is consistent -- and it *cannot* fail
    for a solver that is orthogonal in the wrong inner product, which is the
    error GATE-A2 sounds like it is about. Use :func:`cross_gram` for that.

    Reported rather than dropped, because "structurally exact" is a fact about
    the method worth recording next to the numbers it produced.
    """
    return modes.phi.T @ (modes.system.Md[:, None] * modes.phi)


def cross_gram(modes: Modes, analytic: np.ndarray) -> np.ndarray:
    """``phi_num^T M phi_analytic`` -- the orthogonality check that can fail.

    ``analytic[:, k]`` is a closed-form mode from ``truth/``, sampled at the same
    nodes and normalised the same way. The diagonal should be ``+-1`` and the
    off-diagonal zero, and neither is true by construction: a numeric mode that
    is orthogonal to the wrong family, or ordered wrongly, or normalised against
    the wrong weight, shows up here and nowhere else.
    """
    m = modes.system.Md[:, None]
    a = analytic / np.sqrt(np.sum(modes.system.Md[:, None] * analytic**2, axis=0))
    return modes.phi.T @ (m * a)


def simpson_gram(modes: Modes) -> np.ndarray:
    """The Gram matrix under a quadrature the solver does not use.

    The cell volumes in `assembly.py` are exactly the trapezoid weights, so a
    trapezoid Gram is the same object :func:`gram` returns and would add nothing.
    Simpson's rule is a genuinely different quadrature of the same continuous
    integral ``int mu phi_m phi_n dx``, whose exact value is zero for ``m != n``.
    What it measures is the discretisation error in the orthogonality, which
    should fall with ``N`` -- reported as a diagnostic, not gated, because its
    magnitude is a property of the grid rather than of the code.
    """
    n = modes.system.n
    dx = modes.system.dx
    mu = modes.system.profile.mu(modes.x)

    # Prepend the Dirichlet node, where every mode is zero, so the panel has an
    # odd number of points and Simpson applies over [0, 1] without a special case.
    xs = np.concatenate(([0.0], modes.x))
    vals = np.concatenate((np.zeros((1, modes.n_modes)), modes.phi), axis=0)
    weights = np.concatenate(([modes.system.profile.mu(0.0)], mu))

    npts = xs.size
    w = np.ones(npts)
    if npts % 2 == 1:
        w[1:-1:2] = 4.0
        w[2:-1:2] = 2.0
        w *= dx / 3.0
    else:
        # Even point count: Simpson over all but the last panel, trapezoid on it.
        w[1 : npts - 2 : 2] = 4.0
        w[2 : npts - 2 : 2] = 2.0
        w[: npts - 1] *= dx / 3.0
        w[npts - 1] = dx / 2.0
        w[npts - 2] += dx / 2.0

    weighted = vals * (w * weights)[:, None]
    return weighted.T @ vals


def interior_zeros(modes: Modes) -> np.ndarray:
    """Sign changes strictly inside ``(0, L)``, per mode. GATE-A3.

    The Sturm oscillation theorem says mode ``n`` has exactly ``n-1`` of them.
    Counted on the interior nodes only: ``x = 0`` is a zero of every mode by the
    boundary condition and counting it would offset the whole comparison by one,
    turning a correct solver into a failing gate.
    """
    interior = modes.phi[:-1, :]
    signs = np.sign(interior)
    # A node that lands exactly on zero belongs to whichever side follows it;
    # forward-filling avoids counting one crossing as two.
    for k in range(signs.shape[1]):
        col = signs[:, k]
        zero_at = np.flatnonzero(col == 0.0)
        for i in zero_at:
            col[i] = col[i - 1] if i > 0 else 1.0
    return np.count_nonzero(np.diff(signs, axis=0) != 0.0, axis=0)


def project(modes: Modes, u0: np.ndarray) -> np.ndarray:
    """Generalised Fourier coefficients of ``u0``. Spec (2.6), ``a_n``."""
    return modes.phi.T @ (modes.system.Md * u0)


def reconstruct(modes: Modes, coeffs: np.ndarray) -> np.ndarray:
    """Sum the series back. The other half of GATE-A4."""
    return modes.phi @ coeffs


def mass_norm(sys: System, u: np.ndarray) -> float:
    """``sqrt(int mu u^2 dx)`` on the discrete grid -- the norm GATE-A4 reports in."""
    return float(np.sqrt(np.sum(sys.Md * np.asarray(u, dtype=float) ** 2)))
