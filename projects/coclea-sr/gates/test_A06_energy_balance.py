"""GATE-A6 -- with damping, the energy lost equals the energy dissipated.

Spec §2.4: ``dE/dt = -int gamma (du/dt)^2 dx``, numerical residual below ``1e-4``.
Integrated over a run,

    E(T) - E(0) + int_0^T u'^T C u' dt = 0

The two terms come from different places — one from the endpoints of the energy
trace, one from a quadrature of the dissipation trace — so this is a genuine
balance and not an identity the scheme satisfies by construction.

## Why this gate is not implied by GATE-A5

A5 runs undamped, so it says nothing about ``C``. A damping matrix assembled with
the wrong cell weights conserves energy perfectly when it is switched off and
dissipates the wrong amount when it is on, and only a balance sees it. The two
gates check different matrices.

## What limits the residual

The damping half-step is integrated **exactly** — ``v <- v exp(-(C/M) dt)`` is
the closed-form solution of ``M v' = -C v`` — so the residual is not a damping
error. What remains is the commutator between the conservative and dissipative
parts of the splitting, which is ``O(dt^2)``, plus the trapezoid quadrature of
the dissipation trace. Both fall with ``dt``, and the gate checks that they do:
a residual that sits at a constant floor would mean the two sides agree on
something other than the physics.
"""

from __future__ import annotations

import numpy as np
import pytest

from coclea import assembly, dynamics, modal, profiles

GATE = "A06"
SPEC = "2.4"

N = 200
N_EXCITED = 5
TOLERANCE = 1e-4
#: Long enough that a visible fraction of the energy is actually gone. A balance
#: over a window in which nothing was dissipated is satisfied by zero equals zero.
N_PERIODS = 20


def _damped_membrane(zeta0: float):
    prof = profiles.BMProfile(alpha_mu=0.0, alpha_K=0.0, coupling=0.0, zeta0=zeta0)
    sys = assembly.assemble(prof, N)
    modes = modal.eigenmodes(sys, N_EXCITED)
    amps = np.array([1.0 / (n**3) for n in range(1, N_EXCITED + 1)])
    u0 = modes.phi[:, :N_EXCITED] @ amps
    return sys, modes, u0


def _run(zeta0: float, dt: float):
    sys, modes, u0 = _damped_membrane(zeta0)
    period = 2.0 * np.pi / float(modes.omega[0])
    n_steps = int(round(N_PERIODS * period / dt))
    traj = dynamics.integrate(sys, u0, np.zeros_like(u0), dt, n_steps,
                              damped=True, sample_every=1)
    return traj, dynamics.energy_balance_residual(traj)


@pytest.mark.parametrize("zeta0", [0.01, 0.05, 0.2])
def test_the_energy_balance_closes(zeta0, report):
    dt = 5e-4
    traj, bal = _run(zeta0, dt)

    report(zeta0=zeta0, N=N, dt=dt, n_periods=N_PERIODS,
           tolerance=TOLERANCE, **bal)

    # The run has to actually dissipate something, or the balance is trivial.
    assert bal["fraction_of_initial_energy_lost"] > 0.05, (
        f"only {bal['fraction_of_initial_energy_lost']:.2%} of the energy was lost; "
        "this window cannot distinguish a correct balance from a silent one"
    )
    assert bal["relative_residual"] < TOLERANCE, (
        f"balance residual {bal['relative_residual']:.3e} at zeta0={zeta0}"
    )


def test_the_residual_falls_with_the_step(report):
    """A residual that holds at a fixed tolerance could be holding by luck.

    It is a discretisation error, so it must shrink as ``dt`` refines. A flat
    residual would mean the two sides agree on something other than the physics.
    """
    steps = (2e-3, 1e-3, 5e-4, 2.5e-4)
    res = []
    for dt in steps:
        _, bal = _run(0.05, dt)
        res.append(bal["relative_residual"])

    # Fitted against dt, and the sign is NOT the one GATE-A12 uses.
    #
    # A12 fits error against the grid count N, where the error falls as N^-p and
    # the reported order is the *negated* slope. Here the independent variable is
    # dt itself, and an error falling as dt^q has slope +q. Negating it as well —
    # which the first version did, by copying A12 — asserted that the residual
    # must GROW under refinement, and the measured -2.000 read as a failure of
    # the very behaviour it was confirming. An order of exactly 2.000 is a strong
    # hint that the code is right and the assertion is not.
    order = float(np.polyfit(np.log(steps), np.log(res), 1)[0])

    report(steps=list(steps), residuals=res, observed_order_in_dt=order,
           convention="slope of log(residual) against log(dt); positive means falling")
    assert order > 1.0, f"the residual does not fall with dt (order {order:.3f})"


def test_undamped_dissipates_nothing(report):
    """The control arm. With ``gamma = 0`` both sides of the balance are zero, and
    a scheme that leaked energy through the damping path would show it here as a
    loss with nothing to account for it."""
    sys = assembly.assemble(profiles.uniform(), N)
    modes = modal.eigenmodes(sys, N_EXCITED)
    amps = np.array([1.0 / (n**3) for n in range(1, N_EXCITED + 1)])
    u0 = modes.phi[:, :N_EXCITED] @ amps

    period = 2.0 * np.pi / float(modes.omega[0])
    traj = dynamics.integrate(sys, u0, np.zeros_like(u0), 5e-4,
                              int(round(N_PERIODS * period / 5e-4)),
                              damped=False, sample_every=1)
    bal = dynamics.energy_balance_residual(traj)

    report(**bal)
    assert abs(bal["fraction_of_initial_energy_lost"]) < 1e-6
    assert bal["energy_dissipated"] == 0.0


def test_more_damping_dissipates_more(report):
    """The direction of the physics.

    Unlike the transmission line — where the stapes delivers what the input
    impedance accepts and more damping does *not* dissipate more (GATE-C3) —
    here the energy is fixed at ``t = 0`` by the initial condition, so raising
    ``zeta0`` must remove more of it. Stated because the two situations look
    alike and behave oppositely.
    """
    lost = {}
    for zeta0 in (0.01, 0.05, 0.2):
        _, bal = _run(zeta0, 5e-4)
        lost[zeta0] = bal["fraction_of_initial_energy_lost"]

    report(fraction_lost_by_zeta={str(k): v for k, v in lost.items()})
    vals = [lost[z] for z in (0.01, 0.05, 0.2)]
    assert all(b > a for a, b in zip(vals, vals[1:])), f"not monotone: {lost}"
