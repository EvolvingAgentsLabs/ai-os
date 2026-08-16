"""The environment's own tests. The adversarial one is the reason it exists.

An RL environment is judged on one thing: can the reward be earned without doing
the work. The published consensus in the environments market is that **the
verifier is the hard part and weak ones get hacked**, so a physics-gated
environment that never tried to hack itself is a claim, not a result.

`fixtures/cheater.py` tries three routes a real reward-hacking attempt would
try — import the project's truth module, re-derive with mpmath, read an
expected-answer file out of the working directory — and
`test_a_cheating_solution_earns_nothing` asserts it scores 0.0 on every task.

The other tests guard the two mistakes this environment has already made:

* `test_the_bundled_truth_has_not_drifted` — the scorer's closed forms are a
  byte-identical copy of the project's gated `truth/`. The first version
  re-derived them here and got the exponential roots wrong, scoring the correct
  reference solution 0.0.
* `test_the_reference_solution_scores_one_on_every_task` — the model-free
  counterpart of the reward. It caught a prompt that never stated its noise
  convention (the reference scored 0.0 with relative error exactly 1.0, the
  factor of two) and a reference whose free end was first-order.
"""

from __future__ import annotations

import ast
import filecmp
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

ENV_ROOT = Path(__file__).resolve().parent.parent
PKG = ENV_ROOT / "coclea_sr"
PROJECT = ENV_ROOT.parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"

TASKS = ("uniform", "exponential", "orthogonality", "stationary_variance")


def _run(task: str, candidate: Path) -> dict:
    """Isolate, run, score — the same two-process split the environment uses.

    The candidate is copied into an empty directory. Nothing else is put there,
    which is the whole defence: `run_candidate.py` has no truth to leak and the
    working directory has no answer to read.
    """
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        shutil.copy(candidate, work / "candidate.py")
        run = subprocess.run(
            [sys.executable, str(PKG / "run_candidate.py"), task, "candidate.py", "results.json"],
            cwd=work,
            capture_output=True,
            text=True,
        )
        assert run.returncode == 0, run.stderr[-800:]
        score = subprocess.run(
            [sys.executable, str(PKG / "score.py"), str(work / "results.json"), str(PKG / "truth")],
            cwd=ENV_ROOT,
            capture_output=True,
            text=True,
        )
        assert score.returncode == 0, score.stderr[-800:]
        return json.loads(score.stdout.strip().splitlines()[0])


@pytest.mark.parametrize("task", TASKS)
def test_the_reference_solution_scores_one_on_every_task(task):
    """`validate()`'s counterpart. A task its own reference cannot pass is broken."""
    out = _run(task, FIXTURES / "reference.py")
    assert out["reward"] == 1.0, out


@pytest.mark.parametrize("task", TASKS)
def test_a_cheating_solution_earns_nothing(task):
    """The load-bearing test.

    Three routes, all defeated by the same structural fact: the process that runs
    the candidate has no truth in it, and the process that has the truth never
    sees the candidate.
    """
    out = _run(task, FIXTURES / "cheater.py")
    assert out["reward"] == 0.0, f"a cheating solution earned {out['reward']}: {out}"


def test_the_bundled_truth_has_not_drifted():
    """One source of truth, byte for byte.

    The bundled copy exists because a published environment must be
    self-contained; it is *checked* because two copies of one derivation is two
    chances to be wrong with no way to tell which is which.
    """
    # `__init__.py` is this package's own scaffolding and carries no derivation;
    # everything else must be the project's file unchanged.
    bundled = sorted(p.name for p in (PKG / "truth").glob("*.py") if p.name != "__init__.py")
    assert bundled, "the environment ships no truth"
    for name in bundled:
        ours, theirs = PKG / "truth" / name, PROJECT / "truth" / name
        assert theirs.exists(), f"{name} is bundled but not in the project"
        assert filecmp.cmp(ours, theirs, shallow=False), f"{name} has drifted from the project's"


@pytest.mark.parametrize("module", ["truth", "mpmath", "sympy"])
def test_a_candidate_cannot_reach_the_scorer_s_own_tools(module):
    """Measured, not read.

    The first version of this asserted the three names appeared in a `sys.modules`
    assignment in `run_candidate.py` — a check on phrasing, which `CLAUDE.md`
    says to delete rather than loosen. It also failed, because the names are in a
    loop variable and never appear as a literal subscript, so it was a check that
    was both wrong and about the wrong thing.

    This imports each one from inside a candidate and requires a zero. `mpmath`
    matters most: it is the scorer's own method, so a candidate using it would be
    checked against itself and the gate would report agreement rather than
    correctness.
    """
    body = (
        "def uniform_eigenfrequencies(n_modes, c, length):\n"
        "    return [1.5707963267948966 * (2*n-1) for n in range(1, n_modes+1)]\n"
    )
    with tempfile.TemporaryDirectory() as tmp:
        clean, blocked_probe = Path(tmp) / "clean.py", Path(tmp) / "probe.py"
        clean.write_text(body)
        blocked_probe.write_text(f"import {module}\n" + body)
        # The control, asserted rather than claimed in a comment: this body IS
        # the exact eigenvalue set and scores a full reward on its own. So the
        # import is the only difference between 1.0 and 0.0.
        assert _run("uniform", clean)["reward"] == 1.0, "the control body should score 1.0"
        out = _run("uniform", blocked_probe)
    assert out["reward"] == 0.0, f"{module} was reachable: {out}"


def test_every_task_has_a_prompt_and_the_prompts_state_their_conventions():
    """Parsed rather than imported: `verifiers` is not a test dependency.

    The convention check is specific and was earned. `stationary_variance`'s
    prompt must write the SDE and the noise normalisation out, because the draft
    that did not scored a correct solution 0.0 over a factor of two.
    """
    tree = ast.parse((PKG / "taskset.py").read_text())
    prompts = None
    for node in ast.walk(tree):
        if isinstance(node, ast.AnnAssign) and getattr(node.target, "id", "") == "PROMPTS":
            prompts = node.value
    assert prompts is not None, "PROMPTS is missing from taskset.py"
    keys = [k.value for k in prompts.keys]  # type: ignore[attr-defined]
    assert sorted(keys) == sorted(TASKS), f"prompts {keys} do not match tasks {TASKS}"

    text = (PKG / "taskset.py").read_text()
    i = text.index('"stationary_variance": """')
    section = text[i : i + 900]
    assert "2 G q'" in section, "the damping convention is not stated"
    assert "2 D delta" in section, "the noise normalisation is not stated"
