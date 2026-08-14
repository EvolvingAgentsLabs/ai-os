"""GATE-A13 -- what the cheap integrator costs.

Spec §5.3 offers two stochastic schemes and recommends the exact one. This gate
is the evidence for that recommendation rather than a restatement of it.

## The bias is computed, not sampled — and that is a better gate

The first version of this file estimated the Euler-Maruyama bias by running long
paths and taking the sample variance. It does not work, and the reason is
arithmetic: resolving a **1% bias** needs a sampling error far below 1%, so
``n_eff = n_steps dt gamma / 2`` has to reach ~2/(0.01)^2 = 20,000 independent
samples, which at the production step is tens of millions of iterations of a
Python loop. It ran for ten minutes and would still have been measuring its own
seed as much as the scheme.

But the Euler-Maruyama discretisation of a linear SDE **is itself a linear
VAR(1)**::

    z_{k+1} = F z_k + G w_k,   F = [[1, dt], [-w^2 dt, 1 - 2 G dt]],
                               Q = [[0, 0], [0, 2 D dt]]

so its stationary covariance is the exact solution of the *discrete* Lyapunov
equation ``P = F P F^T + Q``. That is the scheme's true asymptotic bias with
**zero sampling error**, available instantly, and it is a stronger statement than
any simulation of it could be.

A short sampled run is kept beside it as a consistency check — the analytic bias
has to be the one a simulation actually shows, or the algebra describes a scheme
nobody is running.

**The exact scheme is the control arm.** Van Loan sampling has no
time-discretisation error at all, so its stationary variance equals the
continuous Lyapunov value for every ``dt``. If it drifted, the Euler measurement
would be the difference between two broken things.

## What the measurement said, and where it contradicts the specification

Spec §5.3 says Euler-Maruyama may be used "SOLO con test de convergencia en dt"
and sets the bar at **1% error at the production step**. Measured, at the
production step of §5.4 (200 samples per cycle), with ``w = 1`` and ``G = 0.05``:

    dt = PD/1   bias 45.8%
    dt = PD/2   bias 18.6%
    dt = PD/4   bias  8.5%
    dt = PD/8   bias  4.1%
    dt = PD/16  bias  2.0%
    dt = PD/32  bias  0.99%

**Euler-Maruyama does not meet the specification's own 1% bar at the
specification's own production step.** It needs a step 32 times finer, because
the relative bias scales like ``dt w^2 / G`` and a lightly damped mode makes that
large: forward Euler is only marginally stable there and the spurious energy it
injects shows up directly in the variance.

This is not a reason to loosen the bar. It is the quantitative argument for the
exact scheme, which §5.3 already recommends and which this project uses in
production — so the gate asserts the *order* of the bias and the step at which
Euler would qualify, and records the 45.8% rather than a number that would have
had to be arranged.
"""

from __future__ import annotations

import numpy as np
import pytest
from scipy.linalg import solve_discrete_lyapunov

from coclea import stochastic
from truth import lyapunov_variance

GATE = "A13"
SPEC = "5.3"

OMEGA = 1.0
GAMMA = 0.05
D = 0.02
#: Spec §5.4's production sampling: 200 points per cycle.
PRODUCTION_DT = (2 * np.pi / OMEGA) / 200


def _euler_stationary_variance(dt: float) -> float:
    """Exact stationary variance of the Euler-Maruyama scheme itself."""
    F = np.array([[1.0, dt], [-(OMEGA**2) * dt, 1.0 - 2.0 * GAMMA * dt]])
    Q = np.array([[0.0, 0.0], [0.0, 2.0 * D * dt]])
    if np.max(np.abs(np.linalg.eigvals(F))) >= 1.0:
        return float("inf")  # the scheme is unstable at this step; say so
    P = solve_discrete_lyapunov(F, Q)
    return float(P[0, 0])


def test_the_exact_scheme_has_no_step_size_bias(report):
    """The control arm. Van Loan must match the continuous Lyapunov at every dt."""
    truth = lyapunov_variance.variance(OMEGA, GAMMA, D)
    errs = {}
    for dt in (PRODUCTION_DT, PRODUCTION_DT / 4):
        ms = stochastic.toy_modal_system(OMEGA, GAMMA, D)
        ps = stochastic.simulate_ou_modal(
            ms, None, T=20_000.0 / GAMMA, dt=dt, rng=np.random.default_rng(5), n_paths=4
        )
        errs[f"dt={dt:.5g}"] = abs(float(np.var(ps.disp[:, :, 0])) - truth) / truth

    report(truth=truth, exact_relative_error=errs, scheme="van-loan")
    for name, e in errs.items():
        assert e < 0.05, f"the exact scheme drifted at {name}: {e:.3%}"


def test_the_euler_bias_falls_at_first_order_in_dt(report):
    """The bias is a property of the scheme, so it must shrink with ``dt`` — and
    at the order the scheme's construction implies."""
    truth = lyapunov_variance.variance(OMEGA, GAMMA, D)
    refinements = [1, 2, 4, 8, 16, 32]
    curve = {}
    for r in refinements:
        dt = PRODUCTION_DT / r
        curve[r] = abs(_euler_stationary_variance(dt) - truth) / truth

    errs = [curve[r] for r in refinements]
    order = float(-np.polyfit(np.log(refinements), np.log(errs), 1)[0])

    report(
        production_dt=PRODUCTION_DT,
        truth=truth,
        relative_error_by_refinement={str(k): v for k, v in curve.items()},
        error_at_production_dt=errs[0],
        fitted_order_in_dt=order,
        tolerance_at_production="1% (spec §5.3)",
    )

    # The step at which Euler would meet spec §5.3's 1% bar, by interpolation
    # on the fitted first-order trend. Reported rather than asserted, because it
    # is the finding: the production step is not it.
    qualifying = next((r for r in refinements if curve[r] < 0.01), None)
    report.data["refinement_reaching_1_percent"] = qualifying
    report.data["euler_meets_spec_at_production_step"] = bool(errs[0] < 0.01)
    report.data["note"] = (
        "Euler-Maruyama misses spec §5.3's own 1% bar at spec §5.4's own production "
        "step by a factor of ~46. Production uses the exact Van Loan scheme, which "
        "has no step-size bias at all."
    )

    # What is asserted is the behaviour, not a threshold the scheme does not meet.
    assert order > 0.8, f"the bias does not fall with dt (fitted order {order:.3f})"
    assert order < 1.4, f"a first-order scheme showing order {order:.3f} is not first order"
    assert qualifying is not None, (
        "Euler never reaches 1% on the refinement ladder; either the scheme or the "
        "ladder is wrong and the comparison says nothing"
    )
    assert errs[0] > 0.05, (
        "the Euler bias at the production step came out small; if that is real, the "
        "argument for the exact scheme in this project needs rewriting rather than "
        "this assertion relaxing"
    )


@pytest.mark.parametrize("refine", [1, 4])
def test_a_sampled_run_shows_the_bias_the_algebra_predicts(refine, report):
    """Consistency: the closed form must describe the scheme actually running.

    Short, because it only has to distinguish the predicted bias from zero and
    from twice itself — not to resolve it to three digits, which is what made
    the sampling approach unaffordable in the first place.
    """
    dt = PRODUCTION_DT / refine
    predicted = _euler_stationary_variance(dt)
    truth = lyapunov_variance.variance(OMEGA, GAMMA, D)

    ms = stochastic.toy_modal_system(OMEGA, GAMMA, D)
    rng = np.random.default_rng(13)
    # Steps scale with the refinement so the *simulated duration* is the same at
    # every step size. The first version fixed the step count instead, so the
    # finest run covered a quarter of the time, its burn-in exceeded its length,
    # and it divided by zero samples.
    n_paths = 64
    n_steps = 40_000 * refine
    z = np.empty((n_paths, 1, 2))
    z[:, 0, 0] = rng.normal(0.0, np.sqrt(truth), n_paths)
    z[:, 0, 1] = rng.normal(0.0, np.sqrt(lyapunov_variance.velocity_variance(OMEGA, GAMMA, D)), n_paths)
    burn = min(int(20.0 / (GAMMA * dt)), n_steps // 4)
    acc, cnt = 0.0, 0
    for k in range(n_steps):
        z = stochastic.euler_maruyama_step(ms, z, dt, rng)
        if k >= burn:
            acc += float(np.sum(z[:, 0, 0] ** 2))
            cnt += n_paths
    sampled = acc / cnt

    n_eff = cnt * dt * GAMMA / 2.0
    tol = 6.0 * np.sqrt(2.0 / n_eff)
    report(
        refine=refine,
        dt=dt,
        predicted_variance=predicted,
        sampled_variance=sampled,
        continuous_truth=truth,
        relative_gap=abs(sampled - predicted) / predicted,
        sampling_tolerance=float(tol),
        n_effective=float(n_eff),
    )
    assert abs(sampled - predicted) / predicted < tol
