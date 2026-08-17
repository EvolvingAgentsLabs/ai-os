#!/usr/bin/env python3
"""R0 -- is there anything to route, and *what* would fix each arm? [ADR-0010] phase 0.

    OPENROUTER_API_KEY=... .venv/bin/python experiments/r0_routing_headroom.py --reps 3

[ADR-0010](../../../doc/adr/0010-oracle-routed-model-selection.md) makes phase 0 a
control arm allowed to kill the router. The first version asked one question —
*does the best model differ by task class?* — and answered it with a scalar
reward.

**A scalar was the wrong instrument, and one afternoon of running it showed why.**
Three different failures already appeared and a single number called all three
`0.0`:

* `qwen/qwen3.5-9b` on `uniform` spent **24,000 tokens (20,180 of them reasoning)
  and emitted zero characters**. Not a physics failure — a *termination* failure.
  No amount of context or better logic fixes it.
* E7's forty agent claims were correct because the agents had an `execute` tool.
  The tool did the work; a scalar router would have concluded "this model is good
  at physics" instead of "this model **plus a tool** is".
* `physics-verifiers` found the frontier judge catching 21 of 21 defects — there
  the model genuinely was the variable.

So this version records a **failure mode** per cell, not only a score. The output
stops being *"which arm wins"* and becomes *"what would fix this arm"*, which is
the question whose answer saves money: augmenting a small model is almost always
cheaper than escalating to a large one.

## The taxonomy, and why each boundary is where it is

| mode | what happened | what would fix it |
|---|---|---|
| `no_output` | empty completion | **termination** — a budget, or constrained decoding |
| `no_code` | prose, no parseable module | **format** — a grammar, or few-shot |
| `interface` | ran, did not define the required function | **interface** — a schema |
| `crashed` | the candidate raised | **execution** — a tool, or a repair loop |
| `convention` | numbers, wrong by an `O(1)` factor | **context** — a wiki; it knew the method |
| `method` | numbers, right order of magnitude, short of tolerance | **logic** — symbolic help, or resolution |
| `wrong` | numbers, wrong by orders | **model** — this is the expensive row |
| `correct` | at or inside the gate's tolerance | nothing |

The `convention` / `method` boundary is the one that earns its keep, and it is not
invented for this file: a **convention** error shows up as a factor — this project
lost a run to the factor of two between `<xi xi> = 2D delta` and `= D delta` — and a
**method** error shows up as an order, which is how the `lumped-full-cell` defect
was found. The scorer already reports `max_relative_error`, so the split costs
nothing.

## The falsification, still registered and still able to stop this

    ceiling = mean_over_tasks( max_over_models ) - max_over_models( mean_over_tasks )

An upper bound, not an estimate: it assumes the router already knows the answer,
pays nothing to explore, and never errs. **Below 0.10 we stop.**

But the factored version changes what a *low* ceiling means. It no longer says
"do not route". It says **"the choice of model is not the lever; what you hand the
model is"** — and it names which lever, per arm, from the mode matrix.

## Cost, and why not from the account

E9 measured OpenRouter's account counter lagging **five to six minutes**, longer
than a request takes, so E7's per-flow costs were the previous flow's spend
wearing this flow's label. Every dollar here comes from that request's own
`usage` block, attributable by construction.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))
ENV = ROOT / "environments" / "coclea_sr" / "coclea_sr"

from coclea import attest  # noqa: E402

RUN_ID = "r0-routing-headroom"

#: Three arms spanning 67x in output price. Prices read from OpenRouter on
#: 2026-08-17 and recorded so the economics can be recomputed without re-running.
ARMS = [
    ("cheap", "qwen/qwen3.5-9b", 0.10, 0.15),
    ("mid", "qwen/qwen3.8-27b", 0.45, 3.20),
    ("frontier", "anthropic/claude-sonnet-5", 2.00, 10.00),
]

CEILING_TO_CONTINUE = 0.10

#: Uniform across arms, so a `length` finish is the arm's property and not the
#: cap's. Measured rather than guessed: `qwen3.5-9b` was still at `length` with
#: 20,180 reasoning tokens at a cap of 24,000, so this is generous by a wide
#: margin for every arm that terminates at all.
MAX_TOKENS = 24_000
REQUEST_TIMEOUT = 300

#: Polite, and enough to turn 36 sequential requests into about six waves.
CONCURRENCY = 6

CODE_BLOCK = re.compile(r"```(?:python)?\s*\n(.*?)```", re.DOTALL)

MODES = (
    "correct", "method", "convention", "wrong",
    "crashed", "interface", "no_code", "no_output",
)
#: What each mode says to do, printed with the matrix so the table is readable
#: without this file.
FIX = {
    "no_output": "termination — budget or constrained decoding",
    "no_code": "format — grammar or few-shot",
    "interface": "interface — a schema",
    "crashed": "execution — a tool or repair loop",
    "convention": "context — a wiki",
    "method": "logic — symbolic help or resolution",
    "wrong": "model — the expensive row",
    "correct": "nothing",
}

_print_lock = threading.Lock()


def prompts() -> dict[str, str]:
    """The taskset's own prompts, read from its source rather than paraphrased.

    `taskset.py` imports `verifiers` at module scope, which is not installed in
    this project's venv and is not needed for the strings. So the two constants
    are executed out of the source instead of importing the module.
    """
    src = (ENV / "taskset.py").read_text()
    ns: dict = {"Path": Path, "__file__": str(ENV / "taskset.py")}
    for block, start_pat, end_pat in (
        ("FORMAT", "FORMAT = ", "\n\nPROMPTS"),
        ("PROMPTS", "PROMPTS: dict[str, str] = ", "\nTASK_IDS"),
    ):
        start = src.index(start_pat)
        exec(compile(src[start : src.index(end_pat, start)], "taskset", "exec"), ns)  # noqa: S102
    return {k: f"{v}\n\n{ns['FORMAT']}" for k, v in ns["PROMPTS"].items()}


def ask(model: str, prompt: str, key: str) -> tuple[str, dict, float, str]:
    """One completion: text, usage, wall clock, and `finish_reason`.

    `finish_reason` is carried because it is the only thing separating *ran dry*
    from *answered badly*, and those are different measurements.
    """
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.0,
            "max_tokens": MAX_TOKENS,
            "usage": {"include": True},
        }
    ).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {key}", "content-type": "application/json"},
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:  # noqa: S310
        data = json.load(resp)
    choice = data["choices"][0]
    return (
        choice["message"].get("content") or "",
        data.get("usage") or {},
        time.time() - t0,
        str(choice.get("finish_reason") or ""),
    )


def cost_of(usage: dict, in_per_m: float, out_per_m: float) -> float:
    """Dollars for this request from its own usage block; prices as fallback."""
    if usage.get("cost") is not None:
        return float(usage["cost"])
    return (
        float(usage.get("prompt_tokens", 0)) * in_per_m / 1e6
        + float(usage.get("completion_tokens", 0)) * out_per_m / 1e6
    )


def run_and_score(task: str, code: str) -> dict:
    """Through the environment's own two halves, which never share a process.

    `run_candidate.py` has numpy and scipy and knows no truth; `score.py` has
    mpmath and sympy and never sees the source. The cheater fixture scores 0.0 on
    all four tasks by three separate routes, which is why this reward is worth
    building an experiment on.
    """
    work = Path(tempfile.mkdtemp(prefix="r0-"))
    try:
        (work / "candidate.py").write_text(code)
        shutil.copy(ENV / "run_candidate.py", work / "run_candidate.py")
        run = subprocess.run(  # noqa: S603
            [sys.executable, "run_candidate.py", task, "candidate.py", "results.json"],
            cwd=work, capture_output=True, text=True, timeout=300,
        )
        results = work / "results.json"
        if not results.exists():
            return {"reward": 0.0, "reason": f"no results.json: {run.stderr.strip()[-160:]}", "ran": False}
        raw = json.loads(results.read_text())
        scored = subprocess.run(  # noqa: S603
            [sys.executable, str(ENV / "score.py"), str(results)],
            capture_output=True, text=True, timeout=300,
        )
        lines = [ln for ln in scored.stdout.splitlines() if ln.strip()]
        if not lines:
            return {"reward": 0.0, "reason": f"scorer silent: {scored.stderr.strip()[-160:]}", "ran": False}
        payload = json.loads(lines[0])
        payload["ran"] = bool(raw.get("ok"))
        payload["candidate_error"] = raw.get("error")
        return payload
    except subprocess.TimeoutExpired:
        return {"reward": 0.0, "reason": "timed out", "ran": False}
    except Exception as exc:  # noqa: BLE001
        return {"reward": 0.0, "reason": f"{type(exc).__name__}: {exc}", "ran": False}
    finally:
        shutil.rmtree(work, ignore_errors=True)


def classify(text: str, had_block: bool, finish: str, scored: dict | None) -> str:
    """One cell to one failure mode. See the taxonomy in the module docstring."""
    if not text.strip():
        return "no_output"
    if scored is None:
        return "no_code"
    reason = str(scored.get("reason", ""))
    if not scored.get("ran", False):
        if "must define" in reason or "AttributeError" in reason:
            return "interface"
        if not had_block:
            return "no_code"
        return "crashed"

    reward = float(scored.get("reward", 0.0))
    if reward >= 0.99:
        return "correct"
    if reward > 0.0:
        # Inside the graded band: the method is right and the accuracy is not.
        return "method"

    err = scored.get("max_relative_error")
    if err is None:
        err = max(
            float(scored.get("max_off_diagonal") or 0.0),
            float(scored.get("max_diagonal_defect") or 0.0),
        ) or None
    if err is None or not math.isfinite(float(err)):
        return "wrong"
    # An O(1) factor is a convention — this project lost a run to the factor of
    # two between `<xi xi> = 2D delta` and `= D delta`. Orders out is a different
    # method, not a different convention.
    return "convention" if 0.05 <= float(err) <= 20.0 else "wrong"


def cell(task: str, label: str, model: str, pin: float, pout: float, rep: int,
         prompt: str, key: str) -> dict:
    """One (task, arm, rep). Retries only an empty completion, and once."""
    text, usage, elapsed, finish = "", {}, 0.0, ""
    transport: str | None = None
    for _ in range(2):
        try:
            text, usage, elapsed, finish = ask(model, prompt, key)
        except Exception as exc:  # noqa: BLE001
            transport = f"{type(exc).__name__}"
            continue
        transport = None
        if text.strip():
            break

    row = {"task": task, "arm": label, "model": model, "rep": rep,
           "elapsed_s": elapsed, "finish_reason": finish,
           "cost_usd": cost_of(usage, pin, pout) if usage else 0.0,
           "usage": usage}

    if transport is not None:
        # A transport failure is not a result. It is excluded from every mean and
        # counted where the exclusion is visible.
        row |= {"reward": None, "mode": None, "reason": f"transport: {transport}"}
    else:
        m = CODE_BLOCK.search(text)
        code = m.group(1) if m else text
        scored = run_and_score(task, code) if text.strip() else None
        row |= {
            "reward": None if scored is None else float(scored.get("reward", 0.0)),
            "mode": classify(text, bool(m), finish, scored),
            "reason": "" if scored is None else str(scored.get("reason", ""))[:160],
            "max_relative_error": None if scored is None else scored.get("max_relative_error"),
            "had_code_block": bool(m),
        }
        if row["reward"] is None:
            row["reward"] = 0.0  # an empty completion scores zero and is *labelled*

    with _print_lock:
        r = "  --" if row["reward"] is None else f"{row['reward']:.3f}"
        print(f"{task:<21}{label:<10}{rep:>3}{r:>8}{row['cost_usd']:>9.5f}"
              f"{row['elapsed_s']:>6.0f}  {row['mode'] or 'transport'}", flush=True)
    return row


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--tasks", nargs="*", default=None)
    args = ap.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit("set OPENROUTER_API_KEY")

    all_prompts = prompts()
    tasks = args.tasks or list(all_prompts)
    print(f"R0 factored — {len(tasks)} tasks x {len(ARMS)} arms x {args.reps} reps, "
          f"{CONCURRENCY} at a time")
    print(f"stop unless the routing ceiling clears {CEILING_TO_CONTINUE:.2f}\n")
    print(f"{'task':<21}{'arm':<10}{'rep':>3}{'reward':>8}{'$':>9}{'s':>6}  mode")

    work = [
        (t, label, model, pin, pout, rep, all_prompts[t], key)
        for t in tasks
        for label, model, pin, pout in ARMS
        for rep in range(1, args.reps + 1)
    ]
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        rows = list(pool.map(lambda a: cell(*a), work))

    # ---- the ceiling -------------------------------------------------------
    usable = [r for r in rows if r["reward"] is not None]
    by: dict[tuple[str, str], list[float]] = {}
    for r in usable:
        by.setdefault((r["task"], r["arm"]), []).append(r["reward"])
    mean = {k: sum(v) / len(v) for k, v in by.items()}
    arms = [a[0] for a in ARMS]
    seen = sorted({t for t, _ in mean})

    per_task_best = {t: max(arms, key=lambda a: mean.get((t, a), 0.0)) for t in seen}
    oracle = sum(max(mean.get((t, a), 0.0) for a in arms) for t in seen) / len(seen)
    best_single = max(sum(mean.get((t, a), 0.0) for t in seen) / len(seen) for a in arms)
    ceiling = oracle - best_single

    print("\n" + "=" * 76)
    print(f"{'task':<21}" + "".join(f"{a:>13}" for a in arms) + f"{'best':>13}")
    for t in seen:
        print(f"{t:<21}" + "".join(f"{mean.get((t, a), 0.0):>13.3f}" for a in arms)
              + f"{per_task_best[t]:>13}")
    print("-" * 76)
    print(f"{'mean':<21}" + "".join(
        f"{sum(mean.get((t, a), 0.0) for t in seen) / len(seen):>13.3f}" for a in arms))

    # ---- the matrix that makes this the factored version -------------------
    counts: dict[tuple[str, str], int] = {}
    for r in rows:
        if r["mode"]:
            counts[(r["arm"], r["mode"])] = counts.get((r["arm"], r["mode"]), 0) + 1
    present = [m for m in MODES if any((a, m) in counts for a in arms)]

    print("\n" + "=" * 76)
    print("failure modes — what would fix each arm, not which arm wins\n")
    print(f"{'mode':<12}" + "".join(f"{a:>11}" for a in arms) + "   fix")
    for m in present:
        print(f"{m:<12}" + "".join(f"{counts.get((a, m), 0):>11}" for a in arms)
              + f"   {FIX[m]}")

    distinct = len(set(per_task_best.values()))
    print("\n" + "=" * 76)
    print(f"  perfect oracle router : {oracle:.3f}")
    print(f"  best single model     : {best_single:.3f}")
    print(f"  ROUTING CEILING       : {ceiling:.3f}   (registered floor {CEILING_TO_CONTINUE:.2f})")
    print(f"  distinct winners      : {distinct} of {len(seen)} task classes")
    print(f"\n  {'CONTINUE to phase 1' if ceiling >= CEILING_TO_CONTINUE else 'STOP on model routing — read the mode matrix for the real lever'}")
    print("=" * 76)

    spend = sum(r["cost_usd"] or 0.0 for r in rows)
    dropped = [r for r in rows if r["reward"] is None]
    print(f"  spent {spend:.4f} USD across {len(rows)} requests")
    if dropped:
        per_arm: dict[str, int] = {}
        for r in dropped:
            per_arm[r["arm"]] = per_arm.get(r["arm"], 0) + 1
        print(f"  {len(dropped)} transport failure(s) excluded: {per_arm}")

    result = {
        "run_id": RUN_ID,
        "arms": [{"label": a, "model": m, "in_per_m": i, "out_per_m": o} for a, m, i, o in ARMS],
        "reps": args.reps, "max_tokens": MAX_TOKENS,
        "ceiling_to_continue": CEILING_TO_CONTINUE,
        "rows": rows,
        "mean_reward": {f"{t}|{a}": v for (t, a), v in mean.items()},
        "mode_counts": {f"{a}|{m}": n for (a, m), n in counts.items()},
        "per_task_best": per_task_best,
        "oracle_router": oracle, "best_single_model": best_single,
        "routing_ceiling": ceiling, "distinct_winners": distinct,
        "continue": bool(ceiling >= CEILING_TO_CONTINUE),
        "total_spend_usd": spend,
    }
    payload = attest.canonical(attest.json_safe(result))
    digest = attest.sha256_bytes(payload)
    d = ROOT / "runs" / f"{RUN_ID}-{digest[:12]}"
    d.mkdir(parents=True, exist_ok=True)
    (d / "result.json").write_bytes(payload)
    (d / "manifest.json").write_text(json.dumps(
        {"run_id": RUN_ID, "at": time.time(), "git_commit": attest.git_commit(),
         "environment": attest.environment(), "result_sha256": digest},
        indent=2, sort_keys=True))
    print(f"  written to {d.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
