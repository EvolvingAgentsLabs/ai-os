"""GATE-A4 -- completeness, as a round trip.

Spec §2.3 property 4 and (2.6): project a smooth initial condition onto the
modes, sum the series back, and require an ``L2`` error below ``1e-6`` with 200
modes in the uniform case.

**The trap this gate has to avoid.** The natural test function for a fixed-free
membrane is something like ``sin(pi x / 2)`` or ``sin^3(pi x / 2)``, and both are
*exact finite combinations of the basis* -- the first is mode 1, the second is
modes 1 and 2. Reconstructing them to machine precision demonstrates nothing
about completeness, because no tail was ever truncated. The gate would be green
for a basis missing every mode above the second.

So the test functions here are chosen to be smooth, to satisfy both boundary
conditions, and to be **non-modal**: their expansions are infinite, the sum is
truncated at 200 of 2000 available modes, and what is measured is the tail.
"""

from __future__ import annotations

import numpy as np

from coclea import assembly, modal, profiles

GATE = "A04"
SPEC = "2.3 property 4 / 2.6"

N = 2000
N_MODES = 200
TOLERANCE = 1e-6


def _cases(x):
    """Each satisfies ``u(0) = 0`` and ``u'(1) = 0``, and none is a finite sum of modes."""
    return {
        # A bump away from both ends. C-infinity; its boundary derivative is
        # ~1e-9, so the expansion is smooth to well past the truncation.
        "gaussian_bump": x * np.exp(-(((x - 0.3) / 0.15) ** 2)),
        # The cubic smoothstep: exactly satisfies both conditions, polynomial,
        # and not in the span of any finite set of the sine family.
        "smoothstep": x**2 * (3.0 - 2.0 * x),
        # A modal envelope times a bump -- the shape a localised excitation has.
        "localised": np.sin(np.pi * x / 2.0) * np.exp(-(((x - 0.4) / 0.2) ** 2)),
    }


def test_projection_and_reconstruction_round_trip(report):
    sys = assembly.assemble(profiles.uniform(), N)
    modes = modal.eigenmodes(sys, N_MODES)

    errors = {}
    for name, u0 in _cases(sys.x).items():
        coeffs = modal.project(modes, u0)
        back = modal.reconstruct(modes, coeffs)
        errors[name] = modal.mass_norm(sys, u0 - back) / modal.mass_norm(sys, u0)

    report(
        N=N,
        n_modes=N_MODES,
        tolerance=TOLERANCE,
        relative_L2_error=errors,
        worst=max(errors.values()),
    )
    for name, err in errors.items():
        assert err < TOLERANCE, f"{name} reconstructed with relative L2 error {err:.3e}"


def test_the_test_functions_are_not_finite_modal_sums(report):
    """The guard on the trap above, made mechanical.

    If a test function were a combination of the first few modes, almost all its
    energy would sit in those few coefficients. Requiring that a meaningful share
    of the energy lives beyond mode 5 is what makes the round trip a statement
    about the tail.
    """
    sys = assembly.assemble(profiles.uniform(), N)
    modes = modal.eigenmodes(sys, N_MODES)

    shares = {}
    for name, u0 in _cases(sys.x).items():
        c = modal.project(modes, u0)
        total = float(np.sum(c**2))
        shares[name] = float(np.sum(c[5:] ** 2) / total)

    report(energy_share_beyond_mode_5=shares)
    for name, share in shares.items():
        assert share > 1e-6, f"{name} is effectively a 5-mode function; it tests nothing"


def test_more_modes_reconstruct_better(report):
    """Completeness is a limit statement, so the gate checks the limit is being
    approached rather than one point on the way. A basis with a missing mode
    stalls here while passing the single-truncation check above."""
    sys = assembly.assemble(profiles.uniform(), N)
    u0 = _cases(sys.x)["gaussian_bump"]

    curve = {}
    for n_modes in (25, 50, 100, 200):
        modes = modal.eigenmodes(sys, n_modes)
        back = modal.reconstruct(modes, modal.project(modes, u0))
        curve[n_modes] = modal.mass_norm(sys, u0 - back) / modal.mass_norm(sys, u0)

    report(truncation_curve=curve)
    values = [curve[k] for k in (25, 50, 100, 200)]
    assert all(b < a for a, b in zip(values, values[1:])), f"not monotone: {curve}"
