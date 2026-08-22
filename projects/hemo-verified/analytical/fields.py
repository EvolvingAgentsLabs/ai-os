"""The field container every oracle reads.

Deliberately not a solver format. An oracle takes `Fields` and a `Grid`, so the
same oracle reads an analytical solution, a solver result and a neural
prediction without knowing which it has -- which is the property that makes the
suite worth publishing, and the one that has to be true from the first line.

Axisymmetric (r, z) with a time axis: enough for Poiseuille and Womersley, and
enough for every oracle in SPEC.md section 4 that does not need a 3D wall.
"""
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Grid:
    r: np.ndarray          # (nr,) node radii, 0 .. R
    z: np.ndarray          # (nz,) axial stations
    t: np.ndarray          # (nt,) times

    @property
    def R(self):
        return float(self.r[-1])

    @property
    def dr(self):
        return float(self.r[1] - self.r[0])

    @property
    def dz(self):
        return float(self.z[1] - self.z[0]) if self.z.size > 1 else 1.0

    @property
    def dt(self):
        return float(self.t[1] - self.t[0]) if self.t.size > 1 else 1.0

    def cell_volume(self):
        """Trapezoidal weights for integral(0..R) f(r) 2*pi*r dr.

        The naive version -- 2*pi*r*dr at every node -- overshoots the exact
        cross-section by 2.6% on a 40-node grid, because it counts both
        endpoints in full. That is a systematic bias, not noise: it would sit
        inside every flux, every energy budget and every mass residual, and it
        is larger than A1's 1% threshold, so the mass oracle would have been
        measuring the quadrature rule. With the ends halved this integrates
        2*pi*r exactly on a uniform grid.
        """
        w = 2.0 * np.pi * np.maximum(self.r, 0.0) * self.dr
        w[0] *= 0.5
        w[-1] *= 0.5
        return w


@dataclass(frozen=True)
class BC:
    rho: float             # density
    mu: float              # dynamic viscosity
    dpdz: float            # mean axial pressure gradient (negative drives +z)
    period: float = 0.0    # 0 for steady
    u_ref: float = 1.0     # velocity scale the thresholds are written against


@dataclass(frozen=True)
class Fields:
    """uz, ur on (nt, nz, nr). p on (nt, nz)."""
    uz: np.ndarray
    ur: np.ndarray
    p: np.ndarray

    def copy(self):
        return Fields(self.uz.copy(), self.ur.copy(), self.p.copy())

    def l2_error(self, truth, grid):
        """Volume-weighted relative L2 against a reference field."""
        w = grid.cell_volume()[None, None, :]
        num = np.sum(w * ((self.uz - truth.uz) ** 2 + (self.ur - truth.ur) ** 2))
        den = np.sum(w * (truth.uz ** 2 + truth.ur ** 2))
        return float(np.sqrt(num / den)) if den > 0 else float("inf")
