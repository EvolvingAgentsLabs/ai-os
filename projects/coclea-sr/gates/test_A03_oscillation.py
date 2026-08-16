"""GATE-A3 -- the Sturm oscillation theorem.

Spec §2.3 property 3: ``phi_n`` has exactly ``n-1`` interior zeros. Counted for
the first 10 modes.

This is a *topological* check and that is its whole value: it does not compare
numbers against numbers, it compares the shape of the solution against a theorem.
A solver whose eigenvalues are off by a constant factor still passes. A solver
that returned the modes in the wrong order, or skipped one, or returned the same
mode twice, cannot -- and none of those failures moves the eigenvalue comparison
by enough to trip A1.

It is also the gate the deliberate defect in `assembly.py` **passes**, which is
recorded here because a gate suite is only informative if it is known which gates
discriminate and which do not.
"""

from __future__ import annotations

import numpy as np

from coclea import assembly, modal, profiles
from truth import uniform_modes

GATE = "A03"
SPEC = "2.3 property 3"

N = 2000
N_MODES = 10


def _counts(profile, scheme="flux"):
    sys = assembly.assemble(profile, N, scheme)
    return modal.interior_zeros(modal.eigenmodes(sys, N_MODES))


def test_mode_n_has_n_minus_one_interior_zeros(report):
    expected = np.array([uniform_modes.interior_zeros(n) for n in range(1, N_MODES + 1)])
    counts = _counts(profiles.uniform())

    report(case="uniform", N=N, counts=counts.tolist(), expected=expected.tolist())
    assert np.array_equal(counts, expected)


def test_it_holds_on_the_exponential_membrane(report):
    expected = np.arange(N_MODES)
    counts = _counts(profiles.exponential(3.0))
    report(case="exponential", alpha=3.0, counts=counts.tolist(), expected=expected.tolist())
    assert np.array_equal(counts, expected)


def test_it_holds_with_the_ground_term(report):
    """ADR-0001 adds ``S(x) u`` to the operator. Sturm-Liouville theory covers it
    -- ``-(K phi')' + S phi = w^2 mu phi`` is the general form, not a variant --
    and this is the cheapest confirmation that the added term did not break the
    structure the rest of §2.3 rests on."""
    expected = np.arange(N_MODES)
    counts = _counts(profiles.REFERENCE)
    report(case="reference-with-ground-term", coupling=profiles.REFERENCE.coupling,
           counts=counts.tolist(), expected=expected.tolist())
    assert np.array_equal(counts, expected)


def test_the_deliberate_defect_passes_this_gate(report):
    """Recorded, not celebrated.

    `assembly.py`'s ``lumped-full-cell`` scheme is wrong by ``O(dx)`` in every
    eigenvalue and produces a perfectly well-ordered spectrum with exactly the
    right number of zeros in every mode. Knowing *which* gates a known defect
    slips past is what stops a green suite from being read as a proof, and it is
    why GATE-A12 exists.
    """
    counts = _counts(profiles.uniform(), scheme="lumped-full-cell")
    expected = np.arange(N_MODES)
    report(
        case="deliberate-defect",
        scheme="lumped-full-cell",
        counts=counts.tolist(),
        expected=expected.tolist(),
        discriminates=False,
        note="A3 cannot see an O(dx) boundary mass error. GATE-A12 can.",
    )
    assert np.array_equal(counts, expected)
