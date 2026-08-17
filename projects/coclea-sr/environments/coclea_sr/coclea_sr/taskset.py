"""coclea-sr: a physics-gated environment. Graded tasks, closed-form verifiers.

Every environment on the open hubs verifies with a compiler or an exact-match
string. This one verifies with **conservation laws, Sturm-Liouville theory and a
Lyapunov solution**: the reward is the relative error against a value derived at
scoring time from the boundary-value problem, at 40–50 digits, by modules the
candidate cannot reach.

The tasks are graded in difficulty and every one of them is a real gate from
`projects/coclea-sr` — this environment is an export of a research project, not
a synthetic benchmark:

======================  ==========  ====================================================
task                    gate        what has to be true
======================  ==========  ====================================================
`uniform`               A1          quarter-wave eigenvalues, rel. err < 1e-4
`orthogonality`         A2, A3      Gram matrix diagonal < 1e-8, and n-1 interior zeros
`exponential`           A8          roots of a transcendental equation, rel. err < 1e-5
`stationary_variance`   A9          Lyapunov solution for an OU mode, rel. err < 1e-6
======================  ==========  ====================================================

## Why it resists reward hacking, structurally

Scoring is split across two processes that never coexist with each other's
inputs:

* `run_candidate.py` has numpy and scipy, runs in a directory containing the
  candidate and nothing else, and **knows no truth**. `truth`, `mpmath` and
  `sympy` are blocked in `sys.modules` before the candidate is imported.
* `score.py` has mpmath and sympy, is handed `results.json`, and **never sees
  the candidate's source**.

`tests/test_environment.py` runs a deliberately cheating solution that tries
three routes — import the project's truth module, re-derive with mpmath, read an
expected-answer file out of the working directory — and asserts it scores 0.0 on
all four tasks. It does.

## Every convention is stated, because a convention nobody stated is telepathy

The `stationary_variance` prompt below writes the SDE and the noise
normalisation out in full. The first draft did not, and the reference solution
scored **0.0 with a relative error of exactly 1.0** — the factor of two between
`<xi xi> = 2D delta` and `= D delta`. An environment that rewards guessing the
author's convention is not measuring physics, and this project has already lost a
day to that exact factor once (`decisions/0003`).
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import verifiers.v1 as vf

_HERE = Path(__file__).parent
RUN_CANDIDATE = (_HERE / "run_candidate.py").read_bytes()
SCORE = (_HERE / "score.py").read_bytes()

FORMAT = (
    "Reply with a single Python module in one ```python code block, and nothing "
    "else. You may import numpy and scipy. Do not import sympy or mpmath; they "
    "are not available where your code runs. Do not attempt to look up the "
    "answer — the values you are scored against are computed in a separate "
    "process that never sees your code."
)

PROMPTS: dict[str, str] = {
    "uniform": """A taut string of length L is fixed at x=0 and free at x=L:

    d/dx[ K du/dx ] = -w^2 mu u,     u(0) = 0,   du/dx(L) = 0

with constant mu and K, and wave speed c = sqrt(K/mu).

Define:

    uniform_eigenfrequencies(n_modes, c, length) -> list[float]

returning the first `n_modes` angular eigenfrequencies in increasing order.
You will be called with n_modes=6, c=1.0, length=1.0. Your answer is scored on
relative error against the closed form; better than 1e-4 scores 1.0.

Solve the problem rather than hard-coding a formula: the same function family is
scored on a non-uniform profile in another task, and a solver generalises.

"""
    + FORMAT,
    "exponential": """The same fixed-free string, now with exponentially varying
properties:

    K(x) = K0 exp(-alpha x),    mu(x) = mu0 exp(-alpha x)

so the wave speed c = sqrt(K0/mu0) is constant while the impedance is not.
Define:

    exponential_eigenfrequencies(n_modes, alpha, length, c) -> list[float]

returning the first `n_modes` angular eigenfrequencies in increasing order. You
will be called with n_modes=5, alpha=2.0, length=1.0, c=1.0.

There is no elementary formula: the eigenvalues satisfy a transcendental
condition. Relative error better than 1e-5 scores 1.0, which a second-order
discretisation reaches only on a fine grid or with Richardson extrapolation.

"""
    + FORMAT,
    "orthogonality": """For the uniform fixed-free string of the first task, define:

    uniform_mode_shapes(n_modes, x, c, length) -> array of shape (n_modes, len(x))

giving mode shapes sampled at the positions `x` (a 1-D numpy array over
[0, length]). You will be called with n_modes=5 and 2001 points.

Two things are checked, and they are independent:

  1. the shapes are orthogonal — after normalisation the Gram matrix
     integral(phi_i phi_j dx) must be the identity to better than 1e-8;
  2. the oscillation theorem — mode n must have exactly n-1 interior zeros.

Scale does not matter; the shapes are normalised before the Gram matrix is
formed. Getting one of the two right scores 0.5.

"""
    + FORMAT,
    "stationary_variance": """A single damped mode driven by white noise:

    q'' + 2 G q' + w^2 q = xi(t),     <xi(t) xi(t')> = 2 D delta(t - t')

Note the conventions exactly as written: the damping term carries a factor of 2,
and the noise autocorrelation carries a factor of 2 D. Define:

    stationary_variance(omega, gamma, noise_intensity) -> float

returning the stationary variance of q, with `gamma` being G and
`noise_intensity` being D above. You will be called with three parameter sets.

This has a closed form via the continuous Lyapunov equation
A P + P A^T + Sigma Sigma^T = 0 for the companion form. Relative error better
than 1e-6 scores 1.0. You may derive it or estimate it by simulation, but a
simulation will not reach 1e-6 in reasonable time.

"""
    + FORMAT,
}

TASK_IDS = tuple(PROMPTS)


class CocleaData(vf.TaskData):
    task_id: str
    """Which of the four graded tasks this row is."""


class CocleaTask(vf.Task[CocleaData]):
    async def setup(self, runtime: vf.Runtime) -> None:
        # Both halves' uv environments are provisioned while the runtime still
        # has network: with a restricted allowlist it is cut before the agent
        # runs, and scoring happens after that.
        await runtime.prepare_uv_script(RUN_CANDIDATE)
        await runtime.prepare_uv_script(SCORE)

    @staticmethod
    def _extract(reply: str | None) -> str:
        """The last fenced python block, or the whole reply if there is none.

        The *last* rather than the first: a model that reasons in code before
        giving its answer would otherwise be scored on its scratch work.
        """
        text = reply or ""
        if "```" not in text:
            return text
        blocks = []
        parts = text.split("```")
        for i in range(1, len(parts), 2):
            block = parts[i]
            if block.startswith("python"):
                block = block[len("python") :]
            blocks.append(block.lstrip("\n"))
        return blocks[-1] if blocks else text

    async def _run_and_score(self, runtime: vf.Runtime, source: str) -> tuple[float, str]:
        """Isolate, run, then score. The two never share a directory."""
        work = f"/tmp/coclea-{self.data.idx}"
        await runtime.run(f"rm -rf {work} && mkdir -p {work}")
        await runtime.write(f"{work}/candidate.py", source.encode())

        run = await runtime.run_uv_script(
            RUN_CANDIDATE,
            args=[self.data.task_id, "candidate.py", "results.json"],
            cwd=work,
        )
        if run.exit_code != 0:
            # Infrastructure failure, not a wrong answer. Raised rather than
            # scored zero: a zero here would train against our own bug.
            raise RuntimeError(f"run_candidate failed: {run.stderr.strip()[-500:]}")

        # The candidate's source is deliberately NOT passed on. Only
        # `results.json` crosses, and the scorer runs elsewhere.
        score = await runtime.run_uv_script(SCORE, args=[f"{work}/results.json"])
        if score.exit_code != 0:
            raise RuntimeError(f"score failed: {score.stderr.strip()[-500:]}")
        lines = score.stdout.strip().splitlines()
        return (float(lines[-1]) if lines else 0.0), (lines[0] if lines else "")

    @vf.reward(weight=1.0)
    async def gate(self, trace: vf.Trace, runtime: vf.Runtime) -> float:
        reward, _ = await self._run_and_score(runtime, self._extract(trace.last_reply))
        return reward

    async def validate(self, runtime: vf.Runtime) -> bool:
        """Valid iff the reference solution scores 1.0 on this task.

        The model-free counterpart of the reward, and the check that catches a
        task whose scorer disagrees with its own prompt — which is how the
        `stationary_variance` factor of two was found, and how the exponential
        scorer's bad root bracket was found before that.
        """
        reference = (_HERE.parent / "tests" / "fixtures" / "reference.py").read_text()
        reward, _ = await self._run_and_score(runtime, reference)
        return reward >= 1.0


class CocleaConfig(vf.TasksetConfig):
    tasks: Literal["all", "analytic", "stochastic"] = "all"


class CocleaTaskset(vf.Taskset[CocleaTask, CocleaConfig]):
    def load(self) -> list[CocleaTask]:
        chosen = {
            "all": TASK_IDS,
            "analytic": ("uniform", "orthogonality", "exponential"),
            "stochastic": ("stationary_variance",),
        }[self.config.tasks]
        return [
            CocleaTask(
                CocleaData(idx=i, prompt=PROMPTS[task_id], task_id=task_id),
                self.config.task,
            )
            for i, task_id in enumerate(chosen)
        ]
