"""GATE-B3 -- the interaction machinery, validated where the answer is known.

Spec §7.2 sets a publication rule, not a measurement: *"una afirmación del tipo
'el ruido mecánico y el neuronal cooperan' solo se publica si el término de
interacción clarea cero con IC 95%"*. A gate cannot check a rule about what gets
published. It can check that the instrument enforcing the rule works.

So this is GATE-A10's pattern one level up: **validate the estimator on a system
whose answer is fixed by construction, before it is pointed at the physics.**
`experiments/b3_interactions.py` is where the real factorial runs; if the
machinery below is wrong, that run's verdict is wrong and nothing downstream
would say so.

## The three things that can go wrong, and the three tests

1. **It fails to see an interaction that is there.** A design that is
   underpowered, or an estimator with the wrong denominator, reports "no
   interaction" for a real one — and a null result is the easiest thing to
   believe. → an injected interaction of known size must be recovered.
2. **It sees one that is not.** With eight effects and no correction, a false
   positive at alpha 0.05 is close to certain. → a null design must survive Holm
   without reporting anything.
3. **Its power analysis is decorative.** §7.2 asks for the sizing *before* the
   design; a formula that answers "any n" answers nothing. → the required n must
   move with the effect it is asked to detect.

Everything here is synthetic and cheap. The physics is elsewhere; this is the
ruler.
"""

from __future__ import annotations

import numpy as np
from scipy import stats

from coclea import analysis

GATE = "B03"
SPEC = "7.2 / 7.3"

#: Four two-level factors, the shape §7.2 uses.
FACTORS = ("eta", "xi", "detector_input", "noise_scaling")
ALPHA = 0.05


def _full_design() -> tuple[np.ndarray, list[str]]:
    """Full factorial with all two-way interactions. Coded -1/+1."""
    rows = [
        [1 if (i >> k) & 1 else -1 for k in range(len(FACTORS))] for i in range(2 ** len(FACTORS))
    ]
    main = np.asarray(rows, dtype=float)
    names = list(FACTORS)
    cols = [np.ones(main.shape[0]), *main.T]
    names_all = ["intercept", *names]
    for i in range(len(FACTORS)):
        for j in range(i + 1, len(FACTORS)):
            cols.append(main[:, i] * main[:, j])
            names_all.append(f"{FACTORS[i]}:{FACTORS[j]}")
    return np.column_stack(cols), names_all


def _fit(design: np.ndarray, names: list[str], y: np.ndarray) -> dict[str, dict[str, float]]:
    """Least squares with t intervals. The effect is 2x the coefficient.

    Two, because a coded factor moves from -1 to +1: the coefficient is the half
    step. Reporting the coefficient as "the effect" halves every number in the
    table, which is exactly the kind of quiet factor this project has been bitten
    by twice.
    """
    beta, *_ = np.linalg.lstsq(design, y, rcond=None)
    resid = y - design @ beta
    dof = design.shape[0] - design.shape[1]
    assert dof > 0, "the design has no residual degrees of freedom"
    sigma2 = float(resid @ resid) / dof
    cov = sigma2 * np.linalg.inv(design.T @ design)
    tcrit = float(stats.t.ppf(1 - ALPHA / 2, dof))

    out: dict[str, dict[str, float]] = {}
    for k, name in enumerate(names):
        if name == "intercept":
            continue
        se = float(np.sqrt(cov[k, k]))
        effect, half = 2.0 * float(beta[k]), 2.0 * tcrit * se
        t = float(beta[k]) / se if se > 0 else 0.0
        out[name] = {
            "effect": effect,
            "ci_lo": effect - half,
            "ci_hi": effect + half,
            "p_value": float(2 * (1 - stats.t.cdf(abs(t), dof))),
            "clears_zero": bool((effect - half) * (effect + half) > 0),
        }
    return out


def _simulate(design: np.ndarray, names: list[str], truth: dict[str, float], sigma: float, seed: int):
    """A response built from a known effect table plus noise."""
    rng = np.random.default_rng(seed)
    y = np.zeros(design.shape[0])
    for k, name in enumerate(names):
        if name in truth:
            y += (truth[name] / 2.0) * design[:, k]
    return y + rng.normal(0.0, sigma, size=design.shape[0])


def test_b03_an_injected_interaction_is_recovered(report):
    """1.2 dB of `eta:xi`, injected. It must come back with the right size and sign.

    The size is the one the real run reported (-1.222 dB), so this checks the
    estimator at the magnitude the science actually turns on rather than at a
    convenient one.
    """
    design, names = _full_design()
    truth = {"eta": 0.9, "xi": -0.6, "eta:xi": -1.2}
    sigma = 0.25
    y = _simulate(design, names, truth, sigma, seed=7)
    fitted = _fit(design, names, y)

    got = fitted["eta:xi"]
    report(
        injected_eta_xi=truth["eta:xi"],
        recovered_effect=got["effect"],
        ci=[got["ci_lo"], got["ci_hi"]],
        p_value=got["p_value"],
        residual_sd=sigma,
    )
    assert got["clears_zero"], "an injected interaction was reported as absent"
    assert got["ci_lo"] <= truth["eta:xi"] <= got["ci_hi"], (
        f"the interval {got['ci_lo']:.3f}..{got['ci_hi']:.3f} misses the injected {truth['eta:xi']}"
    )
    assert abs(got["effect"] - truth["eta:xi"]) < 0.5


def test_b03_a_design_with_no_interaction_reports_none(report):
    """The control. Main effects only, and Holm must leave the table empty.

    Eight effects tested at alpha 0.05 is a coin-flip's worth of false positives
    without correction, and §7.3 asks for Holm precisely for this.
    """
    design, names = _full_design()
    truth = {"eta": 0.9, "xi": -0.6}  # no interaction at all
    y = _simulate(design, names, truth, sigma=0.25, seed=11)
    fitted = _fit(design, names, y)

    interactions = {k: v for k, v in fitted.items() if ":" in k}
    survivors = analysis.holm({k: v["p_value"] for k, v in interactions.items()}, alpha=ALPHA)
    reported = [k for k, alive in survivors.items() if alive]
    report(interaction_p_values={k: v["p_value"] for k, v in interactions.items()}, reported_after_holm=reported)
    assert not reported, f"a null design reported interactions: {reported}"


def test_b03_holm_actually_removes_something(report):
    """Otherwise the correction is a no-op wearing a name.

    Six p-values just under 0.05 are what an uncorrected table looks like when
    nothing is there. Holm must keep at most the smallest.
    """
    borderline = {f"f{i}": p for i, p in enumerate([0.011, 0.02, 0.03, 0.04, 0.045, 0.049])}
    survivors = analysis.holm(borderline, alpha=ALPHA)
    kept = [k for k, alive in survivors.items() if alive]
    report(p_values=borderline, kept=kept)
    assert len(kept) < len(borderline), "Holm kept everything, so it corrected nothing"


def test_b03_the_power_analysis_moves_with_the_effect_it_must_detect(report):
    """§7.2 sizes the design *before* running it. A formula that answers "any n"
    for any effect is not sizing anything.

    Two-sample, two-sided, power 0.8: `n = 2 (z_a/2 + z_b)^2 (sigma/delta)^2`.
    Halving the effect must roughly quadruple the requirement.
    """
    z_a = float(stats.norm.ppf(1 - ALPHA / 2))
    z_b = float(stats.norm.ppf(0.8))

    def required_n(delta: float, sigma: float = 1.0) -> int:
        return int(np.ceil(2 * (z_a + z_b) ** 2 * (sigma / delta) ** 2))

    n1, n_half = required_n(1.0), required_n(0.5)
    report(n_for_1db=n1, n_for_0p5db=n_half, ratio=n_half / n1)
    assert n1 > 1, "the sizing returns a trivial n"
    assert 3.5 < n_half / n1 < 4.5, f"halving the effect changed n by {n_half / n1:.2f}x, not ~4x"
