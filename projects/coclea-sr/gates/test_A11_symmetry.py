"""GATE-A11 -- the assembled stiffness operator is symmetric.

Spec §5.1: ``||Sm - Sm^T||_inf < 1e-12`` after assembly.

**This gate has already done its work, and it did it against the spec.** §5.1
prescribes a second-order Neumann condition via the ghost node
``u_{N+1} = u_{N-1}``. Substituting that into the interior stencil gives an apex
row coupling to its neighbour with ``-(K_{N+1/2} + K_{N-1/2})/dx^2`` while the
row above still couples back with ``-K_{N-1/2}/dx^2``. The matrix is not
symmetric, and this gate -- also demanded by §5.1 -- fails on the assembly §5.1
prescribes.

The two requirements are inconsistent as written, and the finite-volume form in
`assembly.py` is what satisfies both. See that module's docstring; the divergence
from the spec is recorded there rather than silently taken.

Symmetry is not cosmetic here. It is what guarantees the real, simple spectrum
and the ``mu``-orthogonality that §2.3 hands to every other gate -- and what
lets the eigensolve be a tridiagonal ``O(N)`` routine instead of a general one.
"""

from __future__ import annotations

import numpy as np
import pytest

from coclea import assembly, profiles

GATE = "A11"
SPEC = "5.1"

TOLERANCE = 1e-12


@pytest.mark.parametrize(
    "name,profile",
    [
        ("uniform", profiles.uniform()),
        ("exponential-3", profiles.exponential(3.0)),
        ("reference", profiles.REFERENCE),
        ("reference-no-ground", profiles.REFERENCE_NO_GROUND),
        ("steep", profiles.BMProfile(alpha_mu=4.0, alpha_K=10.0, coupling=0.02)),
    ],
)
@pytest.mark.parametrize("N", [250, 2000])
def test_stiffness_is_symmetric(name, profile, N, report):
    sys = assembly.assemble(profile, N)
    defect = assembly.symmetry_defect(sys)
    report(case=name, N=N, symmetry_defect=defect, tolerance=TOLERANCE)
    assert defect < TOLERANCE


@pytest.mark.parametrize("N", [250, 2000])
def test_mass_is_positive_definite(N, report):
    """Not in the spec's list, and it belongs with A11.

    Every downstream guarantee -- real spectrum, ``mu``-orthogonality, the
    ``M^{-1/2}`` symmetrisation in `modal.py` -- needs ``M > 0``, and the
    failure mode if it is not is a complex frequency or a silent NaN rather
    than an exception. One line, checked at assembly, next to the symmetry it
    travels with.
    """
    sys = assembly.assemble(profiles.REFERENCE, N)
    report(N=N, min_mass=float(sys.Md.min()), min_volume=float(sys.volume.min()))
    assert sys.Md.min() > 0.0


def test_the_deliberate_defect_is_still_symmetric(report):
    """The defect in `assembly.py` was chosen so this gate cannot see it.

    A wrong boundary mass leaves the stiffness untouched, so ``Sm`` is exactly as
    symmetric as before and ``M`` is exactly as positive. Recorded so the suite
    states which of its gates discriminate against which failure.
    """
    sys = assembly.assemble(profiles.uniform(), 2000, scheme="lumped-full-cell")
    defect = assembly.symmetry_defect(sys)
    report(
        scheme="lumped-full-cell",
        symmetry_defect=defect,
        discriminates=False,
        note="the defect is in M, not Sm. GATE-A12 is what sees it.",
    )
    assert defect < TOLERANCE


def test_the_apex_owns_half_a_cell(report):
    """The one structural fact the finite-volume argument rests on.

    Asserted directly because it is the thing the defect changes, and because a
    reader checking the module docstring's claim should find it enforced rather
    than described.
    """
    N = 400
    sys = assembly.assemble(profiles.uniform(), N)
    broken = assembly.assemble(profiles.uniform(), N, scheme="lumped-full-cell")

    report(
        apex_volume=float(sys.volume[-1]),
        interior_volume=float(sys.volume[-2]),
        total_mass=float(sys.Md.sum()),
        total_mass_defect_scheme=float(broken.Md.sum()),
        continuum_mass=1.0,
        expected_total_mass=1.0 - 0.5 / N,
    )
    assert np.isclose(sys.volume[-1], sys.volume[-2] / 2.0)

    # For the uniform membrane int mu dx = 1 over [0, 1]. The assembled mass is
    # `1 - dx/2`, not 1: the Dirichlet node at the base owns a half cell too, and
    # it is eliminated along with its unknown because u(0) = 0. Its mass is not
    # missing, it is not a degree of freedom.
    assert np.isclose(sys.Md.sum(), 1.0 - 0.5 / N)

    # And the defect's total mass is **exactly 1.0** -- the base half cell it
    # never had, cancelled by the apex half cell it should not have. This is
    # worth stating rather than passing over: the obvious sanity check on a
    # mass matrix, "does it integrate to the continuum mass", prefers the wrong
    # solver. It is the reason GATE-A12 measures a slope instead of a residual.
    assert np.isclose(broken.Md.sum(), 1.0)
