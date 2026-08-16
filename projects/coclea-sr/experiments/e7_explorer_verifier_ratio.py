#!/usr/bin/env python3
"""§7.4 — the cost-quality curve of the explorer:verifier ratio.

    OPENROUTER_API_KEY=... python experiments/e7_explorer_verifier_ratio.py --reps 3

Spec §7.4 calls this *"el dato que ningún paper de los labs publicó"*: how the
mix of exploring and verifying agents trades cost against correctness on a
problem with **partial analytic truth**. Anthropic and OpenAI published the
topology; neither published the curve.

This runs against a live `ai-os`, not against the model directly. That is the
point — the subject is the harness.

## The task, and why this one

*"What is the observed order of convergence of the `lumped-full-cell` assembly
scheme?"*

Ground truth, measured before the experiment was designed:

    flux               order 2.000
    lumped-full-cell   order 1.016

It is error-prone in a specific and documented way. `lumped-full-cell` is second
order **in the interior** and first order at the free end, where it gives the
apex node a full cell of mass instead of half. Every docstring in `assembly.py`
says "second order" about the interior stencil. An explorer that reasons from the
code, or measures on a grid too coarse to separate the two, answers **2**. An
explorer that measures properly answers **1**.

So a wrong answer is the *plausible* one, which is what makes verification worth
paying for and is exactly the regime §7.4 is about.

## What is recorded

* **Cost in dollars**, read from OpenRouter's `total_usage` before and after each
  flow. Real spend, not a token estimate — and it is what §7.4 asks for.
* **Wall clock**, per flow.
* **Correct**: the final answer is within 0.25 of 1.016.
* **Retraction**: a verifier step contradicted an earlier explorer claim. This is
  the mechanism the ratio is supposed to buy, so it is measured rather than
  assumed.

Everything lands in `runs/e7-ratio-<hash>/` with a manifest, like every other
run in this project.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from coclea import attest  # noqa: E402

FLOWS = os.environ.get("AI_FLOWS_URL", "http://localhost:8097")
DESK = os.environ.get("AI_DESK_URL", "http://localhost:8098")
SCOPE = os.environ.get(
    "COCLEA_SCOPE", "group:cochlea-lab-1c5c2f60-b91c-4b58-b6ca-4ac9db6ad1ed"
)

#: Total agents held fixed at six, so a difference between arms is the **mix**
#: and not the size. The ratios are therefore 5:1, 2:1 and 1:1.
ARMS = [("5:1", 5, 1), ("2:1", 4, 2), ("1:1", 3, 3)]

TRUE_ORDER = 1.016
TOLERANCE = 0.25

EXPLORER = (
    "Use your execute tool with timeoutSeconds 600. In coclea-sr, measure the observed "
    "order of convergence of the `lumped-full-cell` assembly scheme against the exact "
    "eigenvalues in truth/exponential_modes.py, for the exponential profile with alpha=2, "
    "L=1, c=1, the first 4 modes. Choose your own grid sizes. Report the order as a single "
    "number on the last line, in the form ORDER=<value>, and say in one sentence how you "
    "measured it."
)

VERIFIER = (
    "A previous step reported an observed order of convergence for the `lumped-full-cell` "
    "scheme. Re-derive it INDEPENDENTLY: use your execute tool with timeoutSeconds 600, "
    "choose grid sizes different from the ones the previous step used, and compare against "
    "truth/exponential_modes.py. Then state whether the previous claim is CONFIRMED or "
    "WRONG, and give your own number as ORDER=<value> on the last line. If the previous "
    "claim is wrong, say so plainly — that is what you are for."
)

FINAL = (
    "State the final answer for the observed order of convergence of the `lumped-full-cell` "
    "scheme, taking the verification steps into account. Reply with exactly one line: "
    "ORDER=<value>"
)


def _post(url: str, body: dict) -> dict:
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers={"content-type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=900) as resp:  # noqa: S310
        return json.loads(resp.read().decode(errors="replace"))


def _get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=300) as resp:  # noqa: S310
        return json.loads(resp.read().decode(errors="replace"))


def spend_so_far(key: str) -> float:
    """Cumulative dollars, from OpenRouter. Real spend, not an estimate."""
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/credits", headers={"Authorization": f"Bearer {key}"}
    )
    with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310
        return float(json.load(resp)["data"]["total_usage"])


def parse_order(text: str) -> float | None:
    """The last `ORDER=` in the reply. Last, because a model restates itself."""
    hits = re.findall(r"ORDER\s*=\s*([-+]?\d*\.?\d+)", text or "")
    return float(hits[-1]) if hits else None


def run_flow(label: str, explorers: int, verifiers: int, rep: int, key: str) -> dict:
    steps: list[str] = []
    for _ in range(explorers):
        steps.append(EXPLORER)
    for _ in range(verifiers):
        steps.append(VERIFIER)
    steps.append(FINAL)

    before = spend_so_far(key)
    t0 = time.time()
    flow = _post(
        f"{FLOWS}/flows",
        {
            "scopeId": SCOPE,
            "actorId": "matias",
            "title": f"E7 ratio {label} rep {rep}",
            "goal": "measure the observed order, with verification proportional to the arm",
            "steps": steps,
        },
    )
    fid = flow["id"]

    deadline = time.time() + 3600
    while time.time() < deadline:
        _post(f"{DESK}/advance", {"flowId": fid})
        state = _get(f"{FLOWS}/flows/{fid}")
        if all(s["state"] in ("done", "failed", "skipped") for s in state["steps"]):
            break
        time.sleep(15)

    elapsed = time.time() - t0
    cost = spend_so_far(key) - before
    state = _get(f"{FLOWS}/flows/{fid}")
    results = [s.get("result") or "" for s in state["steps"]]

    explorer_claims = [parse_order(r) for r in results[:explorers]]
    verifier_claims = [parse_order(r) for r in results[explorers : explorers + verifiers]]
    final = parse_order(results[-1])

    # A retraction is a verifier saying WRONG, or disagreeing with the explorers
    # by more than the tolerance. Both, because a model may do one without the
    # other and either is the mechanism the ratio buys.
    said_wrong = any("WRONG" in (r or "").upper() for r in results[explorers : explorers + verifiers])
    numeric_disagreement = any(
        v is not None and e is not None and abs(v - e) > TOLERANCE
        for v in verifier_claims
        for e in explorer_claims
    )

    return {
        "arm": label,
        "explorers": explorers,
        "verifiers": verifiers,
        "rep": rep,
        "flow_id": fid,
        "cost_usd": cost,
        "elapsed_s": elapsed,
        "explorer_claims": explorer_claims,
        "verifier_claims": verifier_claims,
        "final": final,
        "correct": final is not None and abs(final - TRUE_ORDER) <= TOLERANCE,
        "retraction": bool(said_wrong or numeric_disagreement),
        "failed_steps": sum(1 for s in state["steps"] if s["state"] == "failed"),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--arms", nargs="*", default=None, help="subset of 5:1 2:1 1:1")
    args = ap.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit("set OPENROUTER_API_KEY — the cost is read from OpenRouter")

    arms = [a for a in ARMS if args.arms is None or a[0] in args.arms]
    rows: list[dict] = []
    out_dir = Path(__file__).resolve().parent.parent / "runs"

    print(f"ground truth: order = {TRUE_ORDER} (lumped-full-cell), tolerance +/-{TOLERANCE}")
    print(f"{'arm':<6}{'rep':>4}{'final':>8}{'ok':>4}{'retract':>9}{'cost $':>9}{'secs':>7}")
    for label, ex, ve in arms:
        for rep in range(1, args.reps + 1):
            row = run_flow(label, ex, ve, rep, key)
            rows.append(row)
            final_txt = "-" if row["final"] is None else f"{row['final']:.3f}"
            print(
                f"{label:<6}{rep:>4}{final_txt:>8}"
                f"{'Y' if row['correct'] else 'n':>4}{'Y' if row['retraction'] else 'n':>9}"
                f"{row['cost_usd']:>9.4f}{row['elapsed_s']:>7.0f}",
                flush=True,
            )
            (out_dir / "e7-partial.json").write_text(json.dumps(rows, indent=2))

    summary: dict[str, dict] = {}
    for label, _, _ in arms:
        sel = [r for r in rows if r["arm"] == label]
        if not sel:
            continue
        summary[label] = {
            "n": len(sel),
            "accuracy": sum(r["correct"] for r in sel) / len(sel),
            "mean_cost_usd": sum(r["cost_usd"] for r in sel) / len(sel),
            "mean_elapsed_s": sum(r["elapsed_s"] for r in sel) / len(sel),
            "retraction_rate": sum(r["retraction"] for r in sel) / len(sel),
        }

    print("\n" + "=" * 62)
    print(f"{'arm':<6}{'n':>3}{'accuracy':>10}{'retractions':>13}{'mean $':>9}{'mean s':>9}")
    for label, s in summary.items():
        print(
            f"{label:<6}{s['n']:>3}{s['accuracy']:>10.0%}{s['retraction_rate']:>13.0%}"
            f"{s['mean_cost_usd']:>9.4f}{s['mean_elapsed_s']:>9.0f}"
        )
    print("=" * 62)

    result = {"true_order": TRUE_ORDER, "tolerance": TOLERANCE, "rows": rows, "summary": summary}
    # Content-addressed, like every other run here: the directory name is the
    # hash of what is in it, so a re-run with different numbers cannot overwrite
    # an attested one.
    payload = attest.canonical(attest.json_safe(result))
    digest = attest.sha256_bytes(payload)
    d = out_dir / f"e7-ratio-{digest[:12]}"
    d.mkdir(parents=True, exist_ok=True)
    (d / "result.json").write_bytes(payload)
    (d / "manifest.json").write_text(
        json.dumps(
            {
                "run_id": "e7-ratio",
                "at": time.time(),
                "git_commit": attest.git_commit(),
                "environment": attest.environment(),
                "result_sha256": digest,
                "model": os.environ.get("PI_MODEL", "(from ai-base/.env)"),
            },
            indent=2,
            sort_keys=True,
        )
    )
    print(f"\nwritten to {d.relative_to(Path(__file__).resolve().parent.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
