# /// script
# dependencies = ["numpy", "scipy"]
# ///
"""Run a candidate solver and print what it produced. **Knows no truth.**

This is half of the verifier, and the half separation makes unhackable. It has
numpy and scipy — everything needed to *solve* the problem — and it has no
mpmath, no sympy, and no access to `truth/`. It cannot check anything, so a
candidate that tries to read the answer out of its environment finds nothing to
read.

`score.py` is the other half: it has the truth and never sees the candidate's
source. Between them there is one channel, `results.json`, carrying numbers.

## Why this is the design and not an implementation detail

A verifier for a coding task is a compiler: free, universal, and impossible to
argue with. A verifier for computational science is somebody knowing that the
stationary variance of a mode must equal the Lyapunov solution. That knowledge
has to live *somewhere*, and if it lives in the same process as the candidate,
the candidate can import it. Every reward-hacking story in RLVR is a variation
of that sentence.

So the split is enforced by the filesystem: this script runs in a directory
containing the candidate and nothing else.

Usage::

    uv run run_candidate.py <task_id> <candidate.py> <results.json>

The candidate is imported and must expose the function the task names. Anything
it prints is discarded; only its return value is carried.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import traceback
from pathlib import Path

import numpy as np


def _load(path: Path):
    spec = importlib.util.spec_from_file_location("candidate", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    # Deliberately NOT inserted into sys.modules under a guessable name: a
    # candidate that re-imported itself could otherwise memoise across tasks.
    spec.loader.exec_module(module)
    return module


def _need(module, name: str):
    fn = getattr(module, name, None)
    if not callable(fn):
        raise AttributeError(f"the solution must define {name}(...)")
    return fn


# --- the tasks -------------------------------------------------------------
#
# Each returns plain JSON-able numbers. No task returns anything the scorer
# could not have asked for independently, which is what keeps the channel
# narrow: a wide channel is a place to smuggle a claim.


def task_uniform(module) -> dict:
    """Eigenfrequencies of the fixed-free uniform string. Spec §2.2."""
    fn = _need(module, "uniform_eigenfrequencies")
    out = fn(n_modes=6, c=1.0, length=1.0)
    return {"omegas": [float(v) for v in out]}


def task_exponential(module) -> dict:
    """The exponential profile, whose truth is a transcendental root. Spec §2.6."""
    fn = _need(module, "exponential_eigenfrequencies")
    out = fn(n_modes=5, alpha=2.0, length=1.0, c=1.0)
    return {"omegas": [float(v) for v in out]}


def task_orthogonality(module) -> dict:
    """Mode shapes must be orthogonal under the mass weight. Spec §2.3."""
    fn = _need(module, "uniform_mode_shapes")
    x = np.linspace(0.0, 1.0, 2001)
    phi = np.asarray(fn(n_modes=5, x=x, c=1.0, length=1.0), dtype=float)
    if phi.shape != (5, x.size):
        raise ValueError(f"expected shape (5, {x.size}), got {phi.shape}")
    # Normalise here rather than trusting the candidate's normalisation: the
    # claim under test is orthogonality, and a scale factor is not part of it.
    norms = np.sqrt(np.trapezoid(phi**2, x, axis=1))
    if np.any(norms <= 0):
        raise ValueError("a mode shape is identically zero")
    unit = phi / norms[:, None]
    gram = np.array([[float(np.trapezoid(unit[i] * unit[j], x)) for j in range(5)] for i in range(5)])
    zeros = [int(np.count_nonzero(np.diff(np.signbit(p[1:-1])))) for p in phi]
    return {"gram": gram.tolist(), "interior_zeros": zeros}


def task_stationary_variance(module) -> dict:
    """Stationary variance of a damped mode under white noise. Spec §4.3, A9."""
    fn = _need(module, "stationary_variance")
    cases = [(1.0, 0.1, 1.0), (2.5, 0.4, 0.7), (0.6, 0.05, 2.0)]
    return {
        "cases": [
            {"omega": w, "gamma": g, "noise_intensity": d, "variance": float(fn(omega=w, gamma=g, noise_intensity=d))}
            for w, g, d in cases
        ]
    }


TASKS = {
    "uniform": task_uniform,
    "exponential": task_exponential,
    "orthogonality": task_orthogonality,
    "stationary_variance": task_stationary_variance,
}


def main() -> int:
    task_id, candidate, out_path = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    if task_id not in TASKS:
        raise SystemExit(f"unknown task {task_id!r}; known: {', '.join(sorted(TASKS))}")

    # An import that reaches for the answer must fail here rather than later, so
    # the failure is attributable. `truth` is absent from this directory; this
    # makes it absent from every path.
    for blocked in ("truth", "mpmath", "sympy"):
        sys.modules[blocked] = None  # type: ignore[assignment]

    try:
        module = _load(candidate)
        payload = {"ok": True, "task": task_id, **TASKS[task_id](module)}
    except Exception as exc:  # noqa: BLE001 -- a candidate may fail in any way
        # Recorded, not raised: the scorer must be able to tell "wrong answer"
        # from "did not run", and a crash here would look like infrastructure.
        payload = {
            "ok": False,
            "task": task_id,
            "error": f"{type(exc).__name__}: {exc}",
            "traceback": traceback.format_exc()[-1200:],
        }
    out_path.write_text(json.dumps(payload, allow_nan=False, indent=2))
    print(json.dumps({"ok": payload["ok"], "task": task_id}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
