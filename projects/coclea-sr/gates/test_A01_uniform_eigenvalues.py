"""GATE-A1 -- the uniform fixed-free string.

Spec §2.2: with ``mu``, ``K`` constant the eigenvalues are
``w_n = (2n-1) pi c / (2L)``, only the odd quarter-wave harmonics. The gate:
relative error below ``1e-4`` for the first 10 modes at ``N = 2000``.

**What this gate is worth on its own: very little**, and saying so is the point
of having it separate from A8. The stiffness matrix of a uniform membrane has one
value repeated along each band, so a solver that ignored ``K(x)`` entirely --
read it once, or never -- passes here. A1 checks the boundary conditions, the
mode ordering and the eigensolve. It does not check the assembly of a variable
coefficient. That is A8's job, and it is why both exist.
"""

from __future__ import annotations

import numpy as np

from coclea import assembly, modal, profiles
from truth import uniform_modes

GATE = "A01"
SPEC = "2.2 / 2.4"

N = 2000
N_MODES = 10
TOLERANCE = 1e-4


def test_eigenvalues_match_the_closed_form(report):
    sys = assembly.assemble(profiles.uniform(), N)
    modes = modal.eigenmodes(sys, N_MODES)

    truth = np.array(uniform_modes.omegas(N_MODES, c=1.0, length=1.0))
    rel = np.abs(modes.omega - truth) / truth

    report(
        N=N,
        n_modes=N_MODES,
        tolerance=TOLERANCE,
        max_relative_error=float(rel.max()),
        margin=float(TOLERANCE / rel.max()),
        omega_numeric=modes.omega.tolist(),
        omega_truth=truth.tolist(),
        relative_error=rel.tolist(),
    )

    assert rel.max() < TOLERANCE, (
        f"worst mode {int(rel.argmax()) + 1} off by {rel.max():.3e}, tolerance {TOLERANCE:.0e}"
    )


def test_the_derivation_behind_the_truth_value_still_holds(report):
    """The symbolic route, run rather than trusted.

    `truth.uniform_modes.omega` returns a formula. This checks that the formula
    is the one the boundary conditions actually force, by solving the ODE in
    sympy and confirming the surviving condition is ``cos(w L / c) = 0``. Without
    it, a transposed boundary condition would give a self-consistent gate: wrong
    truth, wrong solver, green.
    """
    import sympy as sp

    relation = uniform_modes.eigenvalue_relation()
    w, c, L = sp.symbols("omega c L", positive=True)

    report(relation=str(relation))
    assert relation == sp.Eq(sp.cos(L * w / c), 0)

    # And every returned frequency satisfies it.
    residuals = [
        abs(float(sp.cos(uniform_modes.omega(n, c=1.0, length=1.0) * 1.0 / 1.0)))
        for n in range(1, N_MODES + 1)
    ]
    report.data["max_relation_residual"] = max(residuals)
    assert max(residuals) < 1e-12


def test_only_odd_harmonics_appear(report):
    """The physical content of the fixed-free condition, checked as a ratio.

    ``w_n / w_1 = 2n - 1``: no even harmonic exists. A solver that quietly
    imposed Dirichlet at both ends would produce a perfectly ordered, perfectly
    orthogonal spectrum with ratios ``1, 2, 3, ...`` and would pass an
    eigenvalue comparison only if somebody had also written the wrong truth.
    """
    sys = assembly.assemble(profiles.uniform(), N)
    modes = modal.eigenmodes(sys, N_MODES)
    ratios = modes.omega / modes.omega[0]
    expected = np.arange(1, N_MODES + 1) * 2 - 1

    report(ratios=ratios.tolist(), expected_ratios=expected.tolist())
    assert np.max(np.abs(ratios - expected)) < 1e-3
