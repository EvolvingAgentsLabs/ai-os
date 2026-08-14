"""The long-wave cochlear transmission line. ADR-0002's operator.

    P''(x) + k^2(x) P(x) = 0,   k^2(x) = beta^2 Omega^2 / Z(x)
    Z(x) = S(x) - Omega^2 M(x) + i Omega R(x)
    P(0) = drive   (the stapes),   P(1) = 0   (the helicotrema)
    U(x) = P(x) / Z(x)

## Why this operator and not the one in the specification

Spec §2.1 gives a string, and [ADR-0001] added a spring to ground to give it a
characteristic frequency per position. Both were run and both failed, and the
reason is a sign that no amount of parameter choice can move: for a string, the
membrane impedance sits in the **numerator** of the local wavenumber, so the wave
is blocked exactly where the membrane is stiff — which is the base, which is
where the wave has to enter. Measured, the response fell by twenty-eight orders
of magnitude before reaching the place it was tuned to.

Here the impedance sits in the **denominator**, which is what fluid coupling
does and membrane tension cannot, and the signs come out right *for the physical
reason*:

* **basal** to the characteristic place, ``S >> Omega^2 M``, so ``Z > 0``,
  ``k^2 > 0`` — the wave **propagates**, slowing as ``Z`` falls;
* **at** the place, ``Z -> i Omega R``: the wavelength collapses, the envelope
  piles up, and the energy goes into the damping. Békésy's peak, as a
  consequence rather than an input;
* **apical** to it, ``Omega^2 M > S``, ``Z < 0`` — **evanescent**.

## It is not an eigenvalue problem, and that changes what can be reused

``Z`` contains ``Omega``, so this is a linear solve per drive frequency and
there is no ``S phi = w^2 M phi`` behind it. `modal.py` does not apply, and
neither do GATE-A1 through A12 — those remain gates on the passive string, which
is still the object spec §2.1 defines and §2.5's WKB is about. Nothing there is
wasted and nothing there transfers.

What does carry over is `forced.py`'s discipline about what counts as a place:
a peak at the last node is not a characteristic place, and this module's
`Response` refuses to call it one.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.linalg import solve_banded

from .profiles import BMProfile


@dataclass(frozen=True)
class LineResponse:
    """The steady state of the line at one drive frequency."""

    omega: float
    x: np.ndarray
    #: Pressure difference across the partition.
    P: np.ndarray
    #: Membrane displacement, ``P / Z``.
    U: np.ndarray
    Z: np.ndarray
    k2: np.ndarray
    beta: float
    #: The stapes boundary value. Known exactly — it is the Dirichlet condition.
    drive: float

    @property
    def magnitude(self) -> np.ndarray:
        return np.abs(self.U)

    @property
    def x_cf(self) -> float:
        return float(self.x[int(np.argmax(self.magnitude))])

    @property
    def peak(self) -> float:
        return float(self.magnitude.max())

    @property
    def peak_is_interior(self) -> bool:
        """A maximum at either end encodes nothing about frequency."""
        return 0 < int(np.argmax(self.magnitude)) < self.x.size - 1

    def characteristic_place(self) -> float:
        """Where ``Z`` changes sign: the resonant place, from the impedance alone.

        Independent of the solved field, so comparing it against `x_cf` asks
        whether the response actually peaks where the membrane is tuned — which
        is a different question from whether it peaks at all.
        """
        real = self.Z.real
        sign_change = np.flatnonzero(np.sign(real[:-1]) != np.sign(real[1:]))
        if sign_change.size == 0:
            return float("nan")
        i = int(sign_change[0])
        # Linear interpolation of the zero of Re(Z).
        f = real[i] / (real[i] - real[i + 1])
        return float(self.x[i] + f * (self.x[i + 1] - self.x[i]))


def partition_impedance(profile: BMProfile, x: np.ndarray, omega: float) -> np.ndarray:
    """``Z(x) = S - Omega^2 M + i Omega R``.

    ``S`` is `BMProfile.K_ref` and ``M`` is `BMProfile.mu` — the same two
    profiles the string used, which is what makes the two operators comparable
    rather than two unrelated models. ``R`` is written as a fraction of the local
    critical damping ``2 sqrt(S M)``, so ``zeta0`` means the same thing at every
    position and at every frequency.
    """
    S = profile.K_ref(x)
    M = profile.mu(x)
    R = 2.0 * profile.zeta0 * (1.0 + profile.g1 * x) * np.sqrt(S * M)
    return (S - omega**2 * M) + 1j * omega * R


def respond(
    profile: BMProfile, N: int, omega: float, beta: float, drive: float = 1.0
) -> LineResponse:
    """Solve the line at one frequency. Tridiagonal, ``O(N)``.

    Both ends are Dirichlet, so the unknowns are the interior nodes and neither
    boundary needs a ghost node or a one-sided stencil — the whole argument that
    made the string's apex delicate simply does not arise here.
    """
    if N < 8:
        raise ValueError("N must be at least 8")
    dx = 1.0 / N
    x_all = np.linspace(0.0, 1.0, N + 1)
    x = x_all[1:-1]

    Z = partition_impedance(profile, x, omega)
    if np.any(np.abs(Z) == 0):
        raise FloatingPointError("zero impedance: undamped resonance, k^2 is infinite")
    k2 = (beta**2) * (omega**2) / Z

    ab = np.zeros((3, x.size), dtype=complex)
    ab[0, 1:] = 1.0 / dx**2
    ab[1, :] = -2.0 / dx**2 + k2
    ab[2, :-1] = 1.0 / dx**2

    rhs = np.zeros(x.size, dtype=complex)
    rhs[0] = -drive / dx**2  # the stapes, at the eliminated node x = 0
    # P(1) = 0 at the helicotrema contributes nothing to the right-hand side.

    P = solve_banded((1, 1), ab, rhs)
    return LineResponse(omega=omega, x=x, P=P, U=P / Z, Z=Z, k2=k2, beta=beta, drive=drive)


def wave_regions(resp: LineResponse) -> dict[str, object]:
    """Where the response propagates and where it decays. ADR-0002's acceptance test.

    Békésy's traveling wave requires **propagating basal** to the characteristic
    place and **evanescent apical** to it. This returns which way round it
    actually is, so the claim is measured rather than assumed from the algebra.
    """
    x_star = resp.characteristic_place()
    if not np.isfinite(x_star):
        return {"applicable": False}
    basal = resp.x < x_star
    apical = resp.x > x_star
    if not basal.any() or not apical.any():
        return {"applicable": False}
    basal_prop = bool(np.mean(resp.k2.real[basal] > 0) > 0.5)
    apical_prop = bool(np.mean(resp.k2.real[apical] > 0) > 0.5)
    return {
        "applicable": True,
        "characteristic_place": x_star,
        "basal_is_propagating": basal_prop,
        "apical_is_propagating": apical_prop,
        "cochlear_orientation": bool(basal_prop and not apical_prop),
    }


def partition_impedance_scalar(resp: LineResponse, x: float) -> complex:
    """``Z`` at one position, recovered from the response's own profile.

    Needed only to close the power integral at the two boundary nodes, which the
    solve eliminates. Kept as its own function so the boundary values come from
    the same expression as the interior ones rather than from a second copy of
    the formula.
    """
    # Rebuild from k^2 = beta^2 Omega^2 / Z at a neighbouring node is not
    # possible at the boundary, so the profile is asked directly. The response
    # carries what is needed to do that without a second profile object:
    # extrapolate Z from its two nearest interior nodes, which is exact to
    # O(dx^2) and enters only a trapezoid endpoint weighted by dx/2.
    if x <= resp.x[0]:
        return complex(2.0 * resp.Z[0] - resp.Z[1])
    return complex(2.0 * resp.Z[-1] - resp.Z[-2])


def power_balance(resp: LineResponse) -> dict[str, float]:
    """Power in at the stapes against power dissipated in the membrane.

    From ``P'' + k^2 P = 0``, multiplying by ``P*`` and integrating over ``[0,1]``::

        Im( [P* P']_0^1 ) + int Im(k^2) |P|^2 dx = 0

    ``P(1) = 0`` kills the upper limit, and ``Im(k^2) = -beta^2 Omega^3 R / |Z|^2``,
    so

        -Im( P*(0) P'(0) )  =  beta^2 Omega^3 int R |P|^2 / |Z|^2 dx

    Both sides are computed independently — one from the boundary, one from a
    volume integral — so this is a genuine conservation check and not an
    identity the solver satisfies by construction. A stencil that is right in the
    interior and wrong at the drive node fails here and passes everything else.
    """
    dx = float(resp.x[1] - resp.x[0])

    # P(0) is not estimated: it IS the Dirichlet value. An earlier version
    # back-extrapolated it from the interior and got a boundary term that was
    # wrong by O(dx) — in the one quantity this check exists to compare.
    P0 = complex(resp.drive)
    # Second-order one-sided derivative at the boundary. First order here would
    # put an O(dx) error into one side of a balance whose residual is the gate.
    dP0 = (-3.0 * P0 + 4.0 * resp.P[0] - resp.P[1]) / (2.0 * dx)
    influx = float(-np.imag(np.conj(P0) * dP0))

    # The volume integral over the whole [0, 1], with both known boundary values
    # included: P(0) = drive and P(1) = 0.
    x_full = np.concatenate(([0.0], resp.x, [1.0]))
    P_full = np.concatenate(([P0], resp.P, [0.0 + 0j]))
    Z_full = np.concatenate((
        [partition_impedance_scalar(resp, 0.0)], resp.Z, [partition_impedance_scalar(resp, 1.0)]
    ))
    R_over = np.imag(Z_full) / resp.omega
    dissipated = float(
        (resp.beta**2)
        * (resp.omega**3)
        * np.trapezoid(R_over * np.abs(P_full) ** 2 / np.abs(Z_full) ** 2, x_full)
    )
    denom = max(abs(influx), abs(dissipated), 1e-300)
    return {
        "power_in": influx,
        "power_dissipated": dissipated,
        "relative_residual": abs(influx - dissipated) / denom,
    }


def tonotopic_map(profile: BMProfile, N: int, omegas: np.ndarray, beta: float) -> dict[str, np.ndarray]:
    """Sweep the drive and extract the place map. Spec §2.7, GATE-B1."""
    xcf, peak, interior, x_star, orient = [], [], [], [], []
    for w in omegas:
        r = respond(profile, N, float(w), beta)
        xcf.append(r.x_cf)
        peak.append(r.peak)
        interior.append(r.peak_is_interior)
        reg = wave_regions(r)
        x_star.append(reg.get("characteristic_place", np.nan))
        orient.append(bool(reg.get("cochlear_orientation", False)))
    return {
        "omega": np.asarray(omegas, dtype=float),
        "x_cf": np.array(xcf),
        "peak": np.array(peak),
        "peak_is_interior": np.array(interior, dtype=bool),
        "characteristic_place": np.array(x_star),
        "cochlear_orientation": np.array(orient, dtype=bool),
    }
