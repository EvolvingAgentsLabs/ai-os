"""GATE-A5 -- a symplectic integrator conserves energy over 100 periods.

Spec §2.4: with ``gamma = 0``, ``F = 0`` and a symplectic integrator,
``|E(t) - E(0)| / E(0) < 1e-6`` for 100 periods of the fundamental.

## What is actually being asserted

A symplectic integrator does **not** conserve the energy — it conserves a nearby
Hamiltonian exactly, so the true energy oscillates with a bounded amplitude of
order ``(w dt)^2 / 4`` and never drifts. GATE-A5 is a test that the error stays
**bounded**, and the distinction is the whole content: a scheme that drifts
linearly can look fine over ten periods and be wrong over ten thousand. This
gate therefore also checks that the error at 100 periods is no worse than the
error at 10 — which a drifting scheme fails and a bounded one passes.

## The initial condition is part of the gate, not a detail

The error bound is set by the frequency of whichever mode *carries the energy*,
and mode ``n`` carries energy proportional to ``(a_n w_n)^2``. Excite the modes
with equal amplitudes and the highest one dominates both the energy and the
error, and no affordable step size reaches ``1e-6``. Excite them with amplitudes
falling like ``n^-3`` and the energy sits almost entirely in the fundamental,
where ``w_1 dt`` is small.

That is a real constraint and it is stated rather than tuned into: the gate
records the energy share of every mode it excites, so a reader can see that the
tolerance is being met by a physically reasonable field and not by a field
chosen to make it pass.
"""

from __future__ import annotations

import numpy as np

from coclea import assembly, dynamics, modal, profiles
from truth import uniform_modes

GATE = "A05"
SPEC = "2.4 / 5.3"

N = 200
N_PERIODS = 100
TOLERANCE = 1e-6
N_EXCITED = 5
#: Safety factor between the predicted error bound and the gate's tolerance.
MARGIN = 2.0


def _initial_condition(modes):
    """Modes 1..5 with amplitudes falling like ``n^-3``. See the module docstring."""
    amps = np.array([1.0 / (n**3) for n in range(1, N_EXCITED + 1)])
    u0 = modes.phi[:, :N_EXCITED] @ amps
    return u0, np.zeros_like(u0), amps


def _energy_share(modes, amps):
    """Fraction of the total energy each excited mode carries: ``(a_n w_n)^2``."""
    share = (amps * modes.omega[: amps.size]) ** 2
    return share / share.sum()


def _step_for_tolerance(modes, amps, tolerance=TOLERANCE, margin=MARGIN):
    """Derive ``dt`` from the integrator's own error bound, not from a run.

    Störmer-Verlet's relative energy error for mode ``n`` is ``(w_n dt)^2 / 4``,
    so the energy-weighted total is ``dt^2 / 4 * sum(share_n w_n^2)``. Requiring
    that below ``tolerance / margin`` and solving:

        dt = sqrt( 4 * tolerance / (margin * sum(share_n w_n^2)) )

    **The first version of this gate hard-coded ``dt = 1e-3`` and failed at
    2.4e-6 on the exponential profile** — a step chosen for one membrane and
    carried to another whose fundamental is 68% higher. Deriving it means the
    gate tests the integrator's theory rather than whether somebody guessed a
    step size that happened to work.
    """
    share = _energy_share(modes, amps)
    weighted = float(np.sum(share * modes.omega[: amps.size] ** 2))
    return float(np.sqrt(4.0 * tolerance / (margin * weighted)))


def _predicted_bound(modes, amps, dt):
    """``sum(share_n (w_n dt)^2 / 4)`` — what the theory says the error will be."""
    share = _energy_share(modes, amps)
    return float(np.sum(share * (modes.omega[: amps.size] * dt) ** 2) / 4.0)


def test_the_energy_stays_bounded_over_a_hundred_periods(report):
    sys = assembly.assemble(profiles.uniform(), N)
    modes = modal.eigenmodes(sys, N_EXCITED)
    u0, v0, amps = _initial_condition(modes)

    dt = _step_for_tolerance(modes, amps)
    period = 2.0 * np.pi / uniform_modes.omega(1, c=1.0, length=1.0)
    n_steps = int(round(N_PERIODS * period / dt))
    traj = dynamics.integrate(sys, u0, v0, dt, n_steps, damped=False, sample_every=50)

    predicted = _predicted_bound(modes, amps, dt)
    report(
        N=N, dt=dt, n_periods=N_PERIODS, n_steps=n_steps,
        tolerance=TOLERANCE,
        energy_initial=float(traj.energy[0]),
        relative_drift=traj.relative_drift,
        modal_energy_share=_energy_share(modes, amps).tolist(),
        predicted_bound=predicted,
        measured_over_predicted=traj.relative_drift / predicted,
    )

    assert traj.relative_drift < TOLERANCE, (
        f"energy moved by {traj.relative_drift:.3e} over {N_PERIODS} periods"
    )
    # The stronger statement: the observed error matches what the integrator's
    # theory predicts, within a factor of three. A scheme that merely passed the
    # tolerance by being over-resolved would not.
    assert 0.2 < traj.relative_drift / predicted < 3.0, (
        f"observed {traj.relative_drift:.3e} against predicted {predicted:.3e} — "
        "the error is not the one Stormer-Verlet's theory describes"
    )


def test_the_error_is_bounded_and_not_drifting(report):
    """The property that separates a symplectic scheme from a merely accurate one.

    A drifting scheme's error grows with time; a symplectic one's oscillates. So
    the error over the last ten periods must be no larger than over the first
    ten. A gate that only measured the endpoint would pass a slow drift.
    """
    sys = assembly.assemble(profiles.uniform(), N)
    modes = modal.eigenmodes(sys, N_EXCITED)
    u0, v0, amps = _initial_condition(modes)

    dt = _step_for_tolerance(modes, amps)
    period = 2.0 * np.pi / uniform_modes.omega(1, c=1.0, length=1.0)
    n_steps = int(round(N_PERIODS * period / dt))
    traj = dynamics.integrate(sys, u0, v0, dt, n_steps, damped=False, sample_every=50)

    e0 = traj.energy[0]
    tenth = max(1, traj.energy.size // 10)
    early = float(np.max(np.abs(traj.energy[:tenth] - e0)) / abs(e0))
    late = float(np.max(np.abs(traj.energy[-tenth:] - e0)) / abs(e0))

    report(early_window_drift=early, late_window_drift=late,
           ratio=late / early if early else None)
    assert late < 3.0 * early, (
        f"the error grows with time: {early:.3e} early, {late:.3e} late — not symplectic"
    )


def test_it_refuses_a_step_beyond_the_stability_limit(report):
    """An explicit scheme past its limit produces an energy trace of its own blow-up.

    Reporting that as a conservation failure would be reporting the wrong thing,
    so `integrate` refuses instead. Checked because a silent instability is the
    failure mode that looks most like a physics result.
    """
    import pytest

    sys = assembly.assemble(profiles.uniform(), N)
    limit = 2.0 / np.sqrt(np.max(sys.Sd / sys.Md))
    report(stability_limit=float(limit), N=N)
    with pytest.raises(ValueError, match="stability limit"):
        dynamics.integrate(sys, np.zeros(sys.n), np.zeros(sys.n), limit * 1.01, 10)


def test_a_varying_profile_conserves_too(report):
    """The uniform membrane is one repeated number; this is the real operator.

    An assembly that is symmetric but subtly wrong in its variable coefficient
    can still conserve *something*, so this is checked on the exponential profile
    where `K(x)` genuinely varies.
    """
    alpha = 3.0
    sys = assembly.assemble(profiles.exponential(alpha), N)
    modes = modal.eigenmodes(sys, N_EXCITED)
    amps = np.array([1.0 / (n**3) for n in range(1, N_EXCITED + 1)])
    u0 = modes.phi[:, :N_EXCITED] @ amps

    dt = _step_for_tolerance(modes, amps)
    period = 2.0 * np.pi / float(modes.omega[0])
    n_steps = int(round(N_PERIODS * period / dt))
    traj = dynamics.integrate(sys, u0, np.zeros_like(u0), dt, n_steps,
                              damped=False, sample_every=50)

    predicted = _predicted_bound(modes, amps, dt)
    report(case="exponential", alpha=alpha, N=N, dt=dt, n_steps=n_steps,
           omega_1=float(modes.omega[0]),
           relative_drift=traj.relative_drift, predicted_bound=predicted,
           measured_over_predicted=traj.relative_drift / predicted,
           tolerance=TOLERANCE)
    assert traj.relative_drift < TOLERANCE
    assert 0.2 < traj.relative_drift / predicted < 3.0
