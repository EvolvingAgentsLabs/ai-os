# /// script
# dependencies = ["mpmath", "sympy", "numpy"]
# ///
"""Score a candidate's numbers against closed forms. **Never sees the candidate.**

The other half of the verifier. It has mpmath and sympy — everything needed to
*know* the answer — and it is handed `results.json` and nothing else. There is no
path from here back to the solution's source, so a reward cannot be earned by
what the code looked like, only by what it produced.

## The truth is derived at scoring time, and derived by the module that was gated

Every value below comes from `coclea_sr/truth/`, a **byte-identical copy** of the
project's own `truth/` — the modules `GATE-A1`, `GATE-A8` and `GATE-A9` check the
solver against. `tests/test_environment.py` asserts the copy has not drifted.

The first version of this file re-derived the roots here instead, and got them
wrong: it bracketed `tan(bL) = -2b/a` over a **full period** of the tangent,
`[(n-1)pi/L, n pi/L]`, which puts a pole in the interior. `tan` changes sign
across a pole exactly as it does across a root, so bisection converged to the
pole. (The narrower correction: the poles are *not* inside the bracket this
project actually uses, `[(2n-1)pi/2L, n pi/L]` — they sit exactly at its lower
endpoint. The entire form `(a/2) sin(bL) + b cos(bL)` removes the question by
being finite everywhere.) The reference solution scored **0.0 on a task it answers correctly**,
and the failure was in the scorer. Two derivations of one equation is two chances
to be wrong and no way to tell which — so there is one.

There is still no table of expected outputs to leak, memorise or regenerate from
a training set: the values are computed from the boundary-value problem at
scoring time. That is what makes this *physics-gated* rather than exact-match.

## The reward is graded, and it is graded on a log scale

A binary reward over a numerical task throws away everything: a solver at 1e-3
and one at 1e-12 are both "wrong" against a 1e-4 tolerance, and the gradient that
would have taken the first to the second does not exist. So the reward is a
smooth function of relative error between a floor and the gate's own tolerance,
and **the gate's tolerance is where the reward reaches 1.0** — the spec's numbers
(§2.2 1e-4, §2.6 1e-5, §2.3 1e-8) rather than new ones invented for training.

Usage::

    uv run score.py <results.json> <truth_dir>

`truth_dir` holds the closed-form modules. They are loaded **by file path**, not
imported as a package: this runs as an isolated `uv` script inside the rollout's
runtime, where the environment package does not exist and importing it would drag
in `verifiers` — a dependency the scorer has no business having.

Prints a JSON line with the reward and its parts, then the reward alone on the
last line — the convention `taskset.py` reads.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import mpmath as mp

mp.mp.dps = 40


# --- the closed forms, from the modules the gates already validate ----------

def _load(name: str):
    """Load a truth module from `truth_dir` by path.

    By path rather than by package import. `score.py` runs as a standalone `uv`
    script in the rollout's runtime, where `coclea_sr` is not installed, and an
    import of it would pull `verifiers` in behind `__init__.py`.
    """
    import importlib.util

    directory = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent / "truth"
    spec = importlib.util.spec_from_file_location(f"_truth_{name}", directory / f"{name}.py")
    if spec is None or spec.loader is None:
        raise ImportError(f"no truth module {name} in {directory}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


exponential_modes = _load("exponential_modes")
lyapunov_variance = _load("lyapunov_variance")
uniform_modes = _load("uniform_modes")


def uniform_omegas(n_modes: int, c: float, length: float) -> list[float]:
    """`w_n = (2n-1) pi c / 2L`. Spec (2.4), via `truth/uniform_modes.py`."""
    return uniform_modes.omegas(n_modes, c, length)


def exponential_omegas(n_modes: int, alpha: float, length: float, c: float) -> list[float]:
    """Roots of spec (2.11), via `truth/exponential_modes.py`.

    That module bisects the **entire** form and brackets each root inside
    `[(2n-1)pi/2L, n pi/L]`. Re-deriving it here with `tan` over a full period
    put a pole in the interior of the bracket, and bisection cannot tell a pole
    from a root; see the module docstring.
    """
    return exponential_modes.omegas(n_modes, alpha, length, c)


def lyapunov_variance_of(omega: float, gamma: float, noise_intensity: float) -> float:
    """Stationary variance, via `truth/lyapunov_variance.py` (GATE-A9's truth)."""
    return lyapunov_variance.variance(omega, gamma, noise_intensity)


# --- grading ---------------------------------------------------------------


def graded(rel_err: float, tol: float, floor: float = 1e-1) -> float:
    """1.0 at or below the gate's tolerance, 0.0 at `floor`, log-linear between.

    Graded rather than binary because the gradient is the point: a solver at 1e-3
    and one at 1e-12 are both "fail" under a 1e-4 threshold, and nothing tells
    the first which way to move.
    """
    if not math.isfinite(rel_err):
        return 0.0
    if rel_err <= tol:
        return 1.0
    if rel_err >= floor:
        return 0.0
    return float((math.log10(floor) - math.log10(rel_err)) / (math.log10(floor) - math.log10(tol)))


def rel_errors(got: list[float], want: list[float]) -> list[float]:
    if len(got) != len(want):
        raise ValueError(f"expected {len(want)} values, got {len(got)}")
    return [abs(g - w) / abs(w) for g, w in zip(got, want)]


def score_uniform(r: dict) -> dict:
    want = uniform_omegas(6, 1.0, 1.0)
    errs = rel_errors([float(v) for v in r["omegas"]], want)
    return {"reward": graded(max(errs), 1e-4), "max_relative_error": max(errs), "tolerance": 1e-4}


def score_exponential(r: dict) -> dict:
    want = exponential_omegas(5, 2.0, 1.0, 1.0)
    errs = rel_errors([float(v) for v in r["omegas"]], want)
    return {"reward": graded(max(errs), 1e-5), "max_relative_error": max(errs), "tolerance": 1e-5}


def score_orthogonality(r: dict) -> dict:
    """Two independent claims: the Gram matrix is the identity, and mode `n` has
    `n-1` interior zeros (spec §2.3's oscillation theorem). Averaged, so a
    solution that gets the shapes right and the count wrong scores half rather
    than zero — a wrong zero count is a real defect and a different one."""
    gram = [[float(v) for v in row] for row in r["gram"]]
    n = len(gram)
    off = max(abs(gram[i][j]) for i in range(n) for j in range(n) if i != j)
    diag = max(abs(gram[i][i] - 1.0) for i in range(n))
    zeros_ok = list(r["interior_zeros"]) == list(range(n))
    return {
        "reward": 0.5 * graded(max(off, diag), 1e-8) + 0.5 * (1.0 if zeros_ok else 0.0),
        "max_off_diagonal": off,
        "max_diagonal_defect": diag,
        "interior_zeros_correct": zeros_ok,
        "tolerance": 1e-8,
    }


def score_stationary_variance(r: dict) -> dict:
    errs = []
    for case in r["cases"]:
        want = lyapunov_variance_of(case["omega"], case["gamma"], case["noise_intensity"])
        errs.append(abs(float(case["variance"]) - want) / abs(want))
    return {"reward": graded(max(errs), 1e-6), "max_relative_error": max(errs), "tolerance": 1e-6}


SCORERS = {
    "uniform": score_uniform,
    "exponential": score_exponential,
    "orthogonality": score_orthogonality,
    "stationary_variance": score_stationary_variance,
}


def main() -> int:
    data = json.loads(Path(sys.argv[1]).read_text())
    if not data.get("ok"):
        out = {"reward": 0.0, "reason": data.get("error", "the candidate did not run")}
    else:
        task = data["task"]
        if task not in SCORERS:
            raise SystemExit(f"no scorer for {task!r}")
        try:
            out = SCORERS[task](data)
        except Exception as exc:  # noqa: BLE001
            # A malformed result is a zero, not a crash: an environment that
            # errors on bad output cannot be trained against.
            out = {"reward": 0.0, "reason": f"{type(exc).__name__}: {exc}"}
    print(json.dumps(out, allow_nan=False))
    print(out["reward"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
