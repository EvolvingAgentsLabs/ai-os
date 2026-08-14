"""GATE-A8 -- the exponential profile, against a closed form.

Spec §2.6, and the gate that carries the passive layer. A1 validates a matrix
whose bands are one repeated number; **A8 is the first gate a solver that
mishandles ``K(x)`` can fail.** The truth value is the root of the transcendental
relation ``tan(bL) = -2b/a`` computed in mpmath at 50 digits, in a module that
imports nothing from `src/` (spec §6.4 rule 4).

Tolerance is the spec's ``1e-5``. The spec does not fix ``N`` for this gate, and
the choice is stated rather than tuned: ``N = 4000``, the largest grid GATE-A12
already uses, giving ``2.3e-6`` against a ``1e-5`` bar. At the ``N = 2000`` of
GATE-A1 the same run measures ``9.2e-6`` -- inside the tolerance, but by 8%, and
a gate whose margin is 8% is a gate that will go red on an unrelated day for an
unrelated reason. Both numbers are recorded below so the choice is visible
instead of implied.
"""

from __future__ import annotations

import numpy as np
import pytest

from coclea import assembly, modal, profiles
from truth import exponential_modes

GATE = "A08"
SPEC = "2.6 / 2.11"

ALPHA = 3.0
N = 4000
N_MODES = 10
TOLERANCE = 1e-5


def test_eigenvalues_match_the_transcendental_roots(report):
    sys = assembly.assemble(profiles.exponential(ALPHA), N)
    modes = modal.eigenmodes(sys, N_MODES)

    truth = np.array(exponential_modes.omegas(N_MODES, ALPHA, length=1.0, c=1.0))
    rel = np.abs(modes.omega - truth) / truth

    coarse = modal.eigenmodes(assembly.assemble(profiles.exponential(ALPHA), 2000), N_MODES)
    rel_coarse = np.abs(coarse.omega - truth) / truth

    report(
        alpha=ALPHA,
        N=N,
        n_modes=N_MODES,
        tolerance=TOLERANCE,
        max_relative_error=float(rel.max()),
        margin=float(TOLERANCE / rel.max()),
        max_relative_error_at_N2000=float(rel_coarse.max()),
        omega_numeric=modes.omega.tolist(),
        omega_truth=truth.tolist(),
        relative_error=rel.tolist(),
        root_residuals=[exponential_modes.residual(n, ALPHA, 1.0) for n in range(1, N_MODES + 1)],
    )

    assert rel.max() < TOLERANCE, (
        f"worst mode {int(rel.argmax()) + 1} off by {rel.max():.3e}, tolerance {TOLERANCE:.0e}"
    )


def test_the_roots_actually_solve_the_relation(report):
    """A root finder that gives up and returns the bracket midpoint looks
    identical to one that converged, unless the function is evaluated there."""
    res = [exponential_modes.residual(n, ALPHA, 1.0) for n in range(1, N_MODES + 1)]
    report(residuals=res, worst=max(res))
    assert max(res) < 1e-25


def test_the_bracketing_misses_no_mode(report):
    """The two ends of the completeness argument in `truth/exponential_modes.py`.

    Both are checked because either failure produces the same symptom -- a truth
    list offset by one -- and that symptom reads as a broken solver.
    """
    # Below the first bracket, f is strictly positive: no root hides under mode 1.
    bs = np.linspace(1e-9, np.pi / 2 - 1e-9, 4001)
    f = (ALPHA / 2) * np.sin(bs) + bs * np.cos(bs)
    report(min_f_below_first_bracket=float(f.min()))
    assert f.min() > 0.0

    # And the solver agrees: its first frequency is the first transcendental root,
    # not something below it. This is the check that closes the non-oscillatory
    # branch empirically as well as on paper.
    sys = assembly.assemble(profiles.exponential(ALPHA), N)
    modes = modal.eigenmodes(sys, 1)
    truth1 = exponential_modes.omega(1, ALPHA, 1.0, 1.0)
    report.data["omega_1_numeric"] = float(modes.omega[0])
    report.data["omega_1_truth"] = truth1
    assert abs(modes.omega[0] - truth1) / truth1 < TOLERANCE


@pytest.mark.parametrize("alpha", [0.5, 1.0, 3.0, 6.0])
def test_it_holds_across_the_profile_family(alpha, report):
    """One value of ``alpha`` is an anecdote.

    The gate is about assembling a *varying* coefficient, so it is run across a
    range of how fast it varies. ``alpha = 6`` is the steep end of spec §3.1's
    exploration range and the one where a midpoint-versus-average face value
    would first show.
    """
    sys = assembly.assemble(profiles.exponential(alpha), N)
    modes = modal.eigenmodes(sys, N_MODES)
    truth = np.array(exponential_modes.omegas(N_MODES, alpha, length=1.0, c=1.0))
    rel = np.abs(modes.omega - truth) / truth

    report(alpha=alpha, N=N, max_relative_error=float(rel.max()), tolerance=TOLERANCE)
    assert rel.max() < TOLERANCE


def test_alpha_to_zero_approaches_the_uniform_string_at_the_derived_rate(report):
    """An independent consistency check between the two truth modules.

    As ``alpha -> 0`` the exponential membrane *is* the uniform one, so
    `exponential_modes` must approach `uniform_modes`. They were derived
    separately -- one in sympy, one in mpmath -- so agreement here is evidence
    about the derivations rather than about the solver.

    **The first version of this test asserted a fixed tolerance and failed**, at
    ``2.0e-8`` for ``alpha = 1e-7``, and the failure was in the assertion rather
    than in either module: the limit is approached at *first order in alpha*, not
    instantly, so no fixed bar is the right one. The asymptotics are short enough
    to derive, which makes the sharper gate available:

        b_n L = (2n-1)pi/2 + d,   tan((2n-1)pi/2 + d) = -cot(d) ~ -1/d = -2b/alpha
        =>  d = alpha / ((2n-1) pi)

    and relative to ``(2n-1)pi/2`` that is

        rel_n  ->  2 alpha / ((2n-1)^2 pi^2)

    So the gate is the *constant*, not a tolerance: ``rel_n / alpha`` must match
    ``2/((2n-1)^2 pi^2)``. That checks the behaviour of the transcendental root
    near the degenerate limit, which a loosened tolerance would not have.
    """
    from truth import uniform_modes

    alpha = 1e-7
    n_check = 5
    small = [exponential_modes.omega(n, alpha, 1.0, 1.0) for n in range(1, n_check + 1)]
    plain = uniform_modes.omegas(n_check, 1.0, 1.0)
    rel = [abs(a - b) / b for a, b in zip(small, plain)]

    predicted = [2.0 * alpha / (((2 * n - 1) ** 2) * np.pi**2) for n in range(1, n_check + 1)]
    ratio = [r / p for r, p in zip(rel, predicted)]

    report(
        alpha=alpha,
        exponential=small,
        uniform=plain,
        relative_difference=rel,
        predicted_first_order=predicted,
        measured_over_predicted=ratio,
    )

    # The limit is approached, and at the rate the asymptotics say.
    assert max(rel) < 1e-6
    assert max(abs(r - 1.0) for r in ratio) < 1e-3, (
        f"first-order constant does not match the derivation: {ratio}"
    )
