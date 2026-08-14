"""GATE-A2 -- orthogonality of the modes under the weight ``mu``.

Spec §2.3 property 2: ``int mu phi_m phi_n dx = delta_mn N_n``, off-diagonal
below ``1e-8`` relative.

**Read this before trusting the number.** The obvious implementation of this gate
is ``phi^T M phi`` against the identity, and it is worth ``0`` as evidence:
`eigh_tridiagonal` returns an orthonormal basis and `modal.eigenmodes` scales it
by ``M^{-1/2}``, so that product is the identity *by construction*. It comes out
at ``3e-15`` and it would come out at ``3e-15`` for a solver that orthogonalised
against the wrong weight, ordered the modes wrongly, or solved a different
membrane entirely. A check that cannot fail while the mechanism is broken is not
a check.

So the gate is the **cross Gram**: numeric modes against *closed-form* modes from
`truth/`, in the same weighted inner product. Off-diagonals there are zero only
if the numeric family is the family the theory predicts. That one can fail, and
it fails for every error the structural version cannot see.

The structural Gram and a Simpson-quadrature Gram are both recorded as
diagnostics, labelled for what they are.
"""

from __future__ import annotations

import numpy as np

from coclea import assembly, modal, profiles
from truth import exponential_modes, uniform_modes

GATE = "A02"
SPEC = "2.3 property 2"

N = 2000
N_MODES = 10
TOLERANCE = 1e-8
#: The cross Gram compares a discrete solution against a continuous one, so its
#: off-diagonal carries the grid's own O(dx^2) error and cannot be held to 1e-8.
#: The bar is set from the discretisation order, not from the observed number:
#: at N = 2000, dx^2 = 2.5e-7, and 1e-4 is three orders of slack above it.
CROSS_TOLERANCE = 1e-4


def _cross(profile, analytic_fn):
    sys = assembly.assemble(profile, N)
    modes = modal.eigenmodes(sys, N_MODES)
    analytic = np.column_stack([analytic_fn(n, modes.x) for n in range(1, N_MODES + 1)])
    return sys, modes, modal.cross_gram(modes, analytic)


def test_numeric_modes_are_orthogonal_to_the_closed_form_family(report):
    sys, modes, cg = _cross(
        profiles.uniform(), lambda n, x: uniform_modes.mode_shape(n, x, c=1.0, length=1.0)
    )

    off = cg - np.diag(np.diag(cg))
    diag = np.abs(np.diag(cg))

    report(
        case="uniform",
        N=N,
        n_modes=N_MODES,
        cross_tolerance=CROSS_TOLERANCE,
        max_cross_offdiagonal=float(np.abs(off).max()),
        min_abs_cross_diagonal=float(diag.min()),
        structural_gram_offdiagonal=float(
            np.abs(modal.gram(modes) - np.eye(N_MODES)).max()
        ),
        structural_gram_note=(
            "identity by construction: eigh_tridiagonal returns an orthonormal basis "
            "and eigenmodes scales it by M^-1/2. Diagnostic, not evidence."
        ),
        simpson_gram_offdiagonal=float(
            np.abs(
                modal.simpson_gram(modes)
                - np.diag(np.diag(modal.simpson_gram(modes)))
            ).max()
        ),
        simpson_gram_note=(
            "same continuous integral under a quadrature the solver does not use; "
            "its size is the grid's discretisation error, and it falls with N."
        ),
    )

    assert np.abs(off).max() < CROSS_TOLERANCE, (
        f"numeric and analytic families are not orthogonal: {np.abs(off).max():.3e}"
    )
    # Each numeric mode must ALIGN with its own analytic partner, not merely be
    # orthogonal to the others -- a permuted spectrum is orthogonal too.
    assert diag.min() > 0.99


def test_it_holds_with_a_varying_coefficient(report):
    """The same check on the exponential membrane, where ``mu`` is not constant
    and the weight in the inner product therefore does work."""
    alpha = 3.0
    sys, modes, cg = _cross(
        profiles.exponential(alpha), lambda n, x: exponential_modes.mode_shape(n, x, alpha, 1.0)
    )
    off = cg - np.diag(np.diag(cg))

    report(
        case="exponential",
        alpha=alpha,
        N=N,
        cross_tolerance=CROSS_TOLERANCE,
        max_cross_offdiagonal=float(np.abs(off).max()),
        min_abs_cross_diagonal=float(np.abs(np.diag(cg)).min()),
    )
    assert np.abs(off).max() < CROSS_TOLERANCE
    assert np.abs(np.diag(cg)).min() > 0.99


def test_the_structural_gram_meets_the_spec_bar_and_is_labelled_as_structural(report):
    """Spec §2.3 asks for ``1e-8`` on the Gram matrix, so it is measured and
    recorded. Kept separate from the gate above so nobody reads its four
    leading zeros as evidence the modes are right."""
    sys = assembly.assemble(profiles.uniform(), N)
    modes = modal.eigenmodes(sys, N_MODES)
    g = modal.gram(modes)
    off = float(np.abs(g - np.eye(N_MODES)).max())

    report(structural_gram_offdiagonal=off, tolerance=TOLERANCE, structural=True)
    assert off < TOLERANCE
