"""Steady-state response to a tone, and the tonotopic map. Spec §2.7, GATE-B1.

For a drive at angular frequency ``Omega``, the semidiscrete system reduces to
one complex linear solve::

    (-Omega^2 M + i Omega C + Sm) U = f

with ``M``, ``C`` diagonal and ``Sm`` symmetric tridiagonal, so the whole thing
is a banded solve -- ``O(N)``, not a modal sum. Spec (2.13) gives the modal form
and it is the right way to *think* about it; it is the wrong way to compute it,
because it needs every mode whose frequency is anywhere near the drive and the
truncation error is largest exactly at resonance, which is the only place the
answer matters.

## Where the drive enters

The stapes moves the oval window: ``u(0, t) = s(t)``. That node is eliminated
rather than solved (it is the Dirichlet condition), so the drive enters as a
source on its neighbour with the weight the eliminated coupling carried,
``K_{1/2}/dx``. That is spec §3.2's "borde (realista)" mode, and it needs no
lifting function -- eliminating the node already did the homogenisation.

## What ``x_cf`` is, and what it is not

``x_cf(Omega)`` is the position of the largest response magnitude. It is a place
code only if the response actually has an interior maximum that *moves* with
frequency. Whether it does is the question ADR-0001 exists to answer, and
`experiments/e2_tonotopy.py` runs both arms rather than assuming it.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.linalg import solve_banded

from .assembly import System


@dataclass(frozen=True)
class Response:
    """The steady state at one drive frequency."""

    omega: float
    #: Complex displacement amplitude at each node.
    U: np.ndarray
    x: np.ndarray

    @property
    def magnitude(self) -> np.ndarray:
        return np.abs(self.U)

    @property
    def x_cf(self) -> float:
        """Position of the peak response -- the characteristic place."""
        return float(self.x[int(np.argmax(self.magnitude))])

    @property
    def peak(self) -> float:
        return float(self.magnitude.max())

    @property
    def peak_is_interior(self) -> bool:
        """Whether the maximum is a real peak or just the end of the membrane.

        A response that grows monotonically to the apex has its maximum at the
        last node and encodes nothing about frequency. Distinguishing the two is
        the difference between a tonotopic map and a plot that looks like one.
        """
        return 0 < int(np.argmax(self.magnitude)) < self.x.size - 1


def respond(sys: System, omega: float, drive: float = 1.0) -> Response:
    """Solve for the steady state at ``omega``."""
    n = sys.n
    dx = sys.dx

    diag = sys.Sd - (omega**2) * sys.Md + 1j * omega * sys.Cd
    off = sys.Se.astype(complex)

    # Banded storage for a tridiagonal system: (1 super, 1 sub).
    ab = np.zeros((3, n), dtype=complex)
    ab[0, 1:] = off
    ab[1, :] = diag
    ab[2, :-1] = off

    f = np.zeros(n, dtype=complex)
    # The eliminated base node, driven. Its coupling weight is the same face
    # stiffness `assemble` used, so the source is consistent with the operator
    # rather than an independently chosen constant.
    f[0] = drive * sys.profile.K(dx / 2.0) / dx

    U = solve_banded((1, 1), ab, f)
    return Response(omega=omega, U=U, x=sys.x)


def tonotopic_map(sys: System, omegas: np.ndarray) -> dict[str, np.ndarray]:
    """Sweep the drive and extract the place map. Spec §2.7 / GATE-B1."""
    xcf, peak, interior, q10 = [], [], [], []
    for w in omegas:
        r = respond(sys, float(w))
        xcf.append(r.x_cf)
        peak.append(r.peak)
        interior.append(r.peak_is_interior)
    return {
        "omega": np.asarray(omegas, dtype=float),
        "x_cf": np.array(xcf),
        "peak": np.array(peak),
        "peak_is_interior": np.array(interior, dtype=bool),
    }


def tuning_curve(sys: System, probe_x: float, omegas: np.ndarray) -> dict[str, float | np.ndarray]:
    """Response at one fixed position across frequency, and its ``Q_10dB``.

    Spec §2.7 asks for this and predicts the answer will be *low* -- ``Q ~ 1-10``
    against the much sharper tuning measured in vivo. The gap is the quantitative
    argument for the active layer of Phase 2, so it is reported as a result
    rather than treated as a shortfall.
    """
    i = int(np.argmin(np.abs(sys.x - probe_x)))
    mags = np.array([abs(respond(sys, float(w)).U[i]) for w in omegas])

    k = int(np.argmax(mags))
    f_c = float(omegas[k])
    cutoff = mags[k] / (10.0 ** (10.0 / 20.0))  # -10 dB

    below = omegas[:k][mags[:k] < cutoff]
    above = omegas[k + 1 :][mags[k + 1 :] < cutoff]
    lo = float(below[-1]) if below.size else float(omegas[0])
    hi = float(above[0]) if above.size else float(omegas[-1])
    bandwidth = hi - lo

    return {
        "probe_x": float(sys.x[i]),
        "omega": np.asarray(omegas, dtype=float),
        "magnitude": mags,
        "f_c": f_c,
        "q10db": float(f_c / bandwidth) if bandwidth > 0 else float("inf"),
        # Whether the -10 dB points were actually found inside the swept band.
        # A Q computed off the edge of the sweep is a property of the sweep.
        "bracketed": bool(below.size and above.size),
    }
