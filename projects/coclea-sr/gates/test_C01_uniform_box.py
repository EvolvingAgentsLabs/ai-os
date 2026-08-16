"""GATE-C1 -- the transmission line against a closed form.

ADR-0002 introduced a new operator, and a new operator needs a truth value
before it is allowed to produce results. With ``S``, ``M`` and ``R`` constant the
impedance is constant, ``k`` is constant, and the boundary-value problem has the
elementary solution ``P(x) = sin(k(1-x)) / sin(k)`` — for complex ``k``, so the
damped case is not a separate branch.

**This gate is deliberately about the discretisation and not about the physics.**
The physics check is GATE-C2, and it is a statement about a *sign*: a solver with
the right signs and a wrong stencil passes it. Only a comparison against an exact
solution catches an error of a constant factor, and this is that comparison.
"""

from __future__ import annotations

import numpy as np
import pytest

from coclea import profiles, transmission
from truth import uniform_box

GATE = "C01"
SPEC = "ADR-0002"

GRIDS = (500, 1000, 2000, 4000)
BETA = 8.0
TOLERANCE = 1e-5
ORDER_BAND = (1.9, 2.1)


def _flat(zeta0=0.05):
    return profiles.BMProfile(alpha_mu=0.0, alpha_K=0.0, coupling=0.0, zeta0=zeta0)


def test_the_closed_form_solves_the_equation(report):
    """Verified in sympy, not asserted. A wrong truth and a wrong solver agree."""
    ok = uniform_box.verify_solution()
    report(symbolically_verified=bool(ok))
    assert ok


@pytest.mark.parametrize("omega", [0.3, 0.7, 1.4])
def test_the_solver_matches_the_closed_form(omega, report):
    prof = _flat()
    Z = complex(transmission.partition_impedance(prof, np.array([0.5]), omega)[0])
    k = uniform_box.wavenumber(BETA, omega, Z)

    resp = transmission.respond(prof, 4000, omega, BETA)
    exact = uniform_box.pressure(resp.x, k)
    err = float(np.max(np.abs(resp.P - exact)) / np.max(np.abs(exact)))

    report(
        omega=omega, N=4000, beta=BETA, impedance=[Z.real, Z.imag],
        wavenumber=[k.real, k.imag], max_relative_error=err, tolerance=TOLERANCE,
    )
    assert err < TOLERANCE


def test_it_converges_at_second_order(report):
    """A tridiagonal three-point stencil with Dirichlet at both ends is second
    order, and a run that is merely *close* at one grid does not show that."""
    prof = _flat()
    omega = 0.7
    Z = complex(transmission.partition_impedance(prof, np.array([0.5]), omega)[0])
    k = uniform_box.wavenumber(BETA, omega, Z)

    errs = []
    for N in GRIDS:
        resp = transmission.respond(prof, N, omega, BETA)
        exact = uniform_box.pressure(resp.x, k)
        errs.append(float(np.max(np.abs(resp.P - exact)) / np.max(np.abs(exact))))
    order = float(-np.polyfit(np.log(GRIDS), np.log(errs), 1)[0])

    report(grids=list(GRIDS), relative_errors=errs, observed_order=order,
           order_band=list(ORDER_BAND))
    assert ORDER_BAND[0] <= order <= ORDER_BAND[1], f"observed order {order:.4f}"


def test_the_branch_of_the_square_root_is_the_physical_one(report):
    """Both roots solve the equation; only one describes a driven passive line.

    Picking the other gives a wave that *grows* toward the apex and still
    satisfies every residual check — which is why the choice is made in
    `truth/uniform_box.wavenumber` explicitly rather than left to numpy.
    """
    prof = _flat()
    omega = 0.7
    Z = complex(transmission.partition_impedance(prof, np.array([0.5]), omega)[0])
    k = uniform_box.wavenumber(BETA, omega, Z)
    resp = transmission.respond(prof, 2000, omega, BETA)

    envelope = np.abs(resp.P)
    report(
        wavenumber_imag=k.imag,
        pressure_at_first_node=float(envelope[0]),
        pressure_at_last_node=float(envelope[-1]),
        decays_toward_apex=bool(envelope[-1] < envelope[0]),
    )
    assert k.imag <= 0.0
    assert envelope[-1] < envelope[0], "the solution grows toward the apex"
