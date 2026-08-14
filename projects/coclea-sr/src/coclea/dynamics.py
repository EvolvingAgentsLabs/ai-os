"""Deterministic time integration, and the energy it is supposed to keep.
Spec §2.4 and §5.3, GATE-A5 and GATE-A6.

This module is the debt H3 left. The stochastic layer never needed it — the exact
Ornstein-Uhlenbeck sampling of `stochastic.py` has no time integrator in it at
all — so the project reached its main result with the deterministic operator
never having been marched in time. That is precisely why the gates exist: a
spatial discretisation can be right in its eigenvalues and wrong in its energy,
and nothing before this file would have noticed.

## The discrete energy is the discrete one, not a quadrature of the continuous one

    E = ½ ( u̇ᵀ M u̇ + uᵀ Sm u )

`M` and `Sm` are already cell-integrated by `assembly.assemble`, so this **is**
the discrete analogue of ``½ ∫ [μ u̇² + K u'²] dx`` rather than an independent
approximation of it. That matters: an energy computed with its own quadrature
would drift against the one the integrator actually conserves, and the drift
would be attributed to the integrator.

## Störmer-Verlet conserves a shadow, not the energy

A symplectic integrator conserves a *nearby* Hamiltonian exactly, so the true
energy oscillates with a bounded amplitude of order ``(ω Δt)² / 4`` instead of
drifting. That is the property GATE-A5 is really testing — **bounded, not
zero** — and it sets the step size: reaching ``1e-6`` needs ``ω Δt ≤ 2e-3`` for
whichever mode carries the energy.

The consequence is a constraint on the *initial condition*, not only on ``Δt``.
Excite modes with amplitudes falling like ``n^-3`` and the energy sits almost
entirely in the fundamental, so the bound is set by ``ω₁``. Excite them equally
and the highest mode dominates the error while contributing most of the energy,
and no affordable step size passes. `gates/test_A05_energy.py` states which it
uses and why.

## Damping is split off and integrated exactly

Spec §5.3 asks for the ``γ`` term semi-implicit, "exact for the damped
oscillator per mode". The symmetric splitting here does better: the damping
half-step is ``v ← v e^{-(C/M) Δt}``, which is the *exact* solution of
``M v̇ = -C v`` over the step, so the scheme carries no damping-discretisation
error at all and GATE-A6's residual is the conservative part alone.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .assembly import System


@dataclass(frozen=True)
class Trajectory:
    """What a run kept. Deliberately not the whole field.

    Storing ``u`` at every step of a 400,000-step run would be gigabytes and
    would be read by nothing: the gates are about scalars. The final state is
    kept so a run can be continued or checked.
    """

    t: np.ndarray
    energy: np.ndarray
    #: Instantaneous dissipation rate, ``u̇ᵀ C u̇``. Zero when ``gamma`` is zero.
    dissipation: np.ndarray
    u_final: np.ndarray
    v_final: np.ndarray
    dt: float

    @property
    def relative_drift(self) -> float:
        """``max |E(t) − E(0)| / E(0)`` — GATE-A5's quantity."""
        return float(np.max(np.abs(self.energy - self.energy[0])) / abs(self.energy[0]))


def energy(sys: System, u: np.ndarray, v: np.ndarray) -> float:
    """``½ (v^T M v + u^T Sm u)``, in the same cell-integrated weights as the operator."""
    kinetic = 0.5 * float(np.sum(sys.Md * v * v))
    # Tridiagonal quadratic form, without materialising the matrix.
    potential = 0.5 * float(
        np.sum(sys.Sd * u * u) + 2.0 * np.sum(sys.Se * u[:-1] * u[1:])
    )
    return kinetic + potential


def _stiffness_apply(sys: System, u: np.ndarray) -> np.ndarray:
    """``Sm u`` for the stored two-band symmetric tridiagonal."""
    out = sys.Sd * u
    out[:-1] += sys.Se * u[1:]
    out[1:] += sys.Se * u[:-1]
    return out


def integrate(
    sys: System,
    u0: np.ndarray,
    v0: np.ndarray,
    dt: float,
    n_steps: int,
    damped: bool = False,
    sample_every: int = 1,
) -> Trajectory:
    """March the membrane. Störmer-Verlet, with damping split off exactly.

    The step is the symmetric splitting

        v ← v − (Δt/2) M⁻¹ Sm u
        u ← u + (Δt/2) v
        v ← v · exp(−(C/M) Δt)          (skipped when `damped` is False)
        u ← u + (Δt/2) v
        v ← v − (Δt/2) M⁻¹ Sm u

    which is second order, time-reversible when undamped, and symplectic in that
    case. ``M`` is diagonal, so ``M⁻¹`` is an elementwise reciprocal and not an
    inversion — the same distinction `modal.py` makes about ``M^{-1/2}``.
    """
    stability = 2.0 / np.sqrt(np.max(sys.Sd / sys.Md))
    if dt >= stability:
        raise ValueError(
            f"dt = {dt:.4g} is at or beyond the stability limit {stability:.4g}; "
            "an explicit scheme would grow without bound and the energy trace "
            "would be a property of the blow-up"
        )

    inv_m = 1.0 / sys.Md
    decay = np.exp(-(sys.Cd * inv_m) * dt) if damped else None

    u = np.array(u0, dtype=float)
    v = np.array(v0, dtype=float)

    n_samples = n_steps // sample_every + 1
    t = np.empty(n_samples)
    e = np.empty(n_samples)
    d = np.empty(n_samples)

    def record(k: int, step: int):
        t[k] = step * dt
        e[k] = energy(sys, u, v)
        d[k] = float(np.sum(sys.Cd * v * v)) if damped else 0.0

    record(0, 0)
    k = 1
    for step in range(1, n_steps + 1):
        v -= 0.5 * dt * inv_m * _stiffness_apply(sys, u)
        u += 0.5 * dt * v
        if decay is not None:
            v *= decay
        u += 0.5 * dt * v
        v -= 0.5 * dt * inv_m * _stiffness_apply(sys, u)
        if step % sample_every == 0 and k < n_samples:
            record(k, step)
            k += 1

    return Trajectory(t=t[:k], energy=e[:k], dissipation=d[:k],
                      u_final=u, v_final=v, dt=dt)


def energy_balance_residual(traj: Trajectory) -> dict[str, float]:
    """GATE-A6: does the energy lost equal the energy dissipated?

    Spec §2.4: ``dE/dt = −∫ γ u̇² dx``. Integrated over the run,

        E(T) − E(0) + ∫₀^T u̇ᵀ C u̇ dt  =  0

    The two terms are computed from different things — one from the endpoints of
    the energy trace, one from a quadrature of the dissipation trace — so this is
    a genuine balance and not an identity the integrator satisfies by
    construction.
    """
    lost = float(traj.energy[0] - traj.energy[-1])
    dissipated = float(np.trapezoid(traj.dissipation, traj.t))
    scale = max(abs(lost), abs(dissipated), 1e-300)
    return {
        "energy_lost": lost,
        "energy_dissipated": dissipated,
        "relative_residual": abs(lost - dissipated) / scale,
        "fraction_of_initial_energy_lost": lost / float(traj.energy[0]),
    }
