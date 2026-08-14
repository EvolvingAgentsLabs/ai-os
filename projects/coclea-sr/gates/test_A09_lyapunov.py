"""GATE-A9 -- the stationary variance of the stochastic field.

Spec §4.1: the semidiscretised system is linear, so the field is Gaussian and its
stationary covariance solves the Lyapunov equation exactly. This gate is what
makes every downstream result interpretable: if the field's variance is right and
the SR curve is still wrong, the fault is in the forty lines of `detector.py` and
nowhere else. Without it, "the resonance did not appear" has two dozen possible
causes.

The truth value is the symbolic solution of ``A P + P A^T + Sigma Sigma^T = 0``
in `truth/lyapunov_variance.py`, which imports nothing from `src/`.

**With the exact Van Loan transition this gate is an identity up to sampling
error**, and that is the point of choosing that scheme: what remains is a
finite-sample question, not a discretisation question. The tolerance below is
therefore set from the sampling error of a variance estimate — ``sqrt(2/n_eff)``
— and not from what the run happened to produce.
"""

from __future__ import annotations

import numpy as np
import pytest

from coclea import assembly, modal, profiles, stochastic
from truth import lyapunov_variance

GATE = "A09"
SPEC = "4.1"


def test_the_lyapunov_solution_is_derived_not_asserted(report):
    """The truth module solves the equation in sympy. Run it and check the shape.

    Without this, a sign error in the drift matrix would give a self-consistent
    gate: wrong truth, wrong solver, green.
    """
    import sympy as sp

    sol = lyapunov_variance.lyapunov_solution()
    w, G, D = sp.symbols("omega Gamma D", positive=True)

    report(
        var_q=str(sol["var_q"]),
        cov=str(sol["cov"]),
        var_qdot=str(sol["var_qdot"]),
    )
    assert sp.simplify(sol["var_q"] - D / (2 * G * w**2)) == 0
    assert sp.simplify(sol["var_qdot"] - D / (2 * G)) == 0
    # The vanishing cross-covariance is what makes sigma_qdot/sigma_q exactly w,
    # which is the ratio Rice's formula needs in GATE-A10.
    assert sp.simplify(sol["cov"]) == 0


@pytest.mark.parametrize("omega,gamma,D", [(1.0, 0.05, 0.02), (3.0, 0.2, 0.5), (0.5, 0.01, 0.001)])
def test_the_sampled_variance_matches_the_closed_form(omega, gamma, D, report):
    """One mode, sampled exactly, against the Lyapunov value."""
    ms = stochastic.toy_modal_system(omega, gamma, D)
    dt = 0.05 / max(omega, 1.0)
    T = 4000.0 / gamma  # many correlation times, so n_eff is large
    rng = np.random.default_rng(7)
    ps = stochastic.simulate_ou_modal(ms, None, T, dt, rng, n_paths=8)

    q = ps.disp[:, :, 0]
    v = ps.vel[:, :, 0]
    var_q = float(np.var(q))
    var_v = float(np.var(v))

    truth_q = lyapunov_variance.variance(omega, gamma, D)
    truth_v = lyapunov_variance.velocity_variance(omega, gamma, D)

    # Independent samples, not time steps: consecutive samples of a damped mode
    # are correlated over ~1/gamma, so counting steps would claim a precision the
    # data does not have and the tolerance would be far too tight.
    n_eff = q.size * dt * gamma / 2.0
    tol = 6.0 * np.sqrt(2.0 / n_eff)

    report(
        omega=omega,
        gamma=gamma,
        D=D,
        dt=dt,
        T=T,
        n_paths=8,
        n_effective=float(n_eff),
        tolerance=float(tol),
        var_q_sampled=var_q,
        var_q_truth=truth_q,
        var_q_relative_error=abs(var_q - truth_q) / truth_q,
        var_qdot_sampled=var_v,
        var_qdot_truth=truth_v,
        var_qdot_relative_error=abs(var_v - truth_v) / truth_v,
    )

    assert abs(var_q - truth_q) / truth_q < tol
    assert abs(var_v - truth_v) / truth_v < tol


def test_the_ratio_that_rice_needs_is_exact(report):
    """``sigma_qdot / sigma_q = w``, independent of ``D`` and ``gamma``.

    This cancellation is why GATE-A10's prediction ``sigma_opt = theta/2`` has no
    free parameters left in it. Checked across three decades of noise so a
    coincidence at one setting cannot pass for an identity.
    """
    omega, gamma = 2.0, 0.1
    ratios = []
    for D in (1e-3, 1e-2, 1e-1):
        vq = lyapunov_variance.variance(omega, gamma, D)
        vv = lyapunov_variance.velocity_variance(omega, gamma, D)
        ratios.append(np.sqrt(vv / vq))
    report(ratios=ratios, expected=omega)
    assert np.allclose(ratios, omega, rtol=1e-12)


def test_the_membrane_reduces_to_modes_with_the_expected_variance(report):
    """The same check on a real membrane rather than one hand-made mode.

    This is the version that can fail for a reason the toy cannot: it exercises
    `modal_system`'s damping projection and its noise scaling, and either being
    wrong shows up here as a variance that is off by a factor rather than by a
    sampling error.
    """
    prof = profiles.BMProfile(alpha_mu=1.0, alpha_K=2.0, coupling=0.0, zeta0=0.08)
    modes = modal.eigenmodes(assembly.assemble(prof, 400), 6)
    ms = stochastic.modal_system(modes, np.array([0.5]), noise_intensity=0.01, scaling="mass")

    dt = 0.02 / ms.omega.max()
    T = 3000.0 / ms.gamma.min()
    rng = np.random.default_rng(19)
    ps = stochastic.simulate_ou_modal(ms, None, T, dt, rng, n_paths=4)

    # Variance of the probe series is the sum over modes of phi^2 * Var(q_n),
    # because the modes are independent.
    predicted = float(np.sum((ms.phi_probe[0] ** 2) * stochastic.stationary_variance(ms)))
    sampled = float(np.var(ps.disp[:, :, 0]))

    n_eff = ps.disp[:, :, 0].size * dt * ms.gamma.min() / 2.0
    tol = 6.0 * np.sqrt(2.0 / n_eff)

    report(
        n_modes=int(ms.n_modes),
        gamma=ms.gamma.tolist(),
        modal_noise=ms.noise.tolist(),
        predicted_variance=predicted,
        sampled_variance=sampled,
        relative_error=abs(sampled - predicted) / predicted,
        tolerance=float(tol),
    )
    assert abs(sampled - predicted) / predicted < tol
