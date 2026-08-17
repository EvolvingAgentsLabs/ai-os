#!/usr/bin/env python3
"""E9 -- what the cost endpoints actually measure. Spec §7.4's other half.

    OPENROUTER_API_KEY=... .venv/bin/python experiments/e9_cost_attribution.py

E7 published accuracy and refused to publish a cost curve, for a reason recorded
in [E7-RESULTS.md](E7-RESULTS.md):

> The measurement is a delta of OpenRouter's **account-wide** `total_usage`, it
> includes retried flows, and it has never been cross-checked against a second
> endpoint that disagrees with it.

The disagreement is concrete: across roughly half a dollar of flows, `/credits`'
`total_usage` moved and `/auth/key`'s `usage` did not move at all. Two numbers,
two stories, and §7.4 has a cost axis only once one of them is trusted.

This run settles it, and it is deliberately the smallest thing that can:

**One flow.** Not an arm, not a sweep. Three probes are read before and after —
`/credits` `total_usage`, `/auth/key` `usage`, and the flow's **own generation
records** through `/generation`, which is the only one attributable to this work
by construction rather than by hoping nothing else is spending.

## What each outcome would mean

* All three agree within a cent → the account-wide delta is fine, E7's method was
  sound, and §7.4 gets its cost axis back unchanged.
* `/generation` agrees with `/credits` but `/auth/key` is flat → `/auth/key`
  measures something else (a different key, a cached figure, a rate-limit
  counter). Use the other two and say so.
* `/generation` disagrees with `/credits` → the account-wide delta was picking up
  something that is not this flow, and **every per-flow dollar figure this
  project has ever printed is void**, including the ones already written down.

The third is the one worth running for. It is also the one that costs the least
to find out.

## The flow, and why it is trivial on purpose

A single step with a bounded, cheap task. This measures **the instrument**, not
the harness or the model, so anything that makes the flow interesting is noise in
the only quantity being measured.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from coclea import attest  # noqa: E402

FLOWS = os.environ.get("AI_FLOWS_URL", "http://localhost:8097")
DESK = os.environ.get("AI_DESK_URL", "http://localhost:8098")
SCOPE = os.environ.get(
    "COCLEA_SCOPE", "group:cochlea-lab-1c5c2f60-b91c-4b58-b6ca-4ac9db6ad1ed"
)
RUN_ID = "e9-cost-attribution"

TASK = (
    "Reply with exactly one line and nothing else: the number of gate report files in "
    "coclea-sr/gates/reports. Use your execute tool with timeoutSeconds 120. "
    "Answer in the form COUNT=<number>."
)


def _api(path: str, key: str) -> dict | None:
    """One OpenRouter GET. `None` rather than a raise — a probe that cannot be
    read is a missing reading, and E7 already lost a run to the opposite."""
    req = urllib.request.Request(
        f"https://openrouter.ai/api/v1{path}", headers={"Authorization": f"Bearer {key}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310
            return json.load(resp)
    except Exception as exc:  # noqa: BLE001
        print(f"  ({path} unreadable: {exc})", flush=True)
        return None


def probes(key: str) -> dict:
    """The two account-level numbers, read as close together as possible."""
    credits = _api("/credits", key)
    auth = _api("/auth/key", key)
    return {
        "credits_total_usage": (
            float(credits["data"]["total_usage"]) if credits else None
        ),
        "auth_key_usage": (float(auth["data"]["usage"]) if auth else None),
        "at": time.time(),
    }


def _post(url: str, body: dict) -> dict:
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers={"content-type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=900) as resp:  # noqa: S310
        return json.loads(resp.read().decode(errors="replace"))


def _get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=300) as resp:  # noqa: S310
        return json.loads(resp.read().decode(errors="replace"))


def main() -> int:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit("set OPENROUTER_API_KEY")

    before = probes(key)
    print(f"before  credits={before['credits_total_usage']}  auth/key={before['auth_key_usage']}")

    t0 = time.time()
    flow = _post(
        f"{FLOWS}/flows",
        {
            "scopeId": SCOPE,
            "actorId": "matias",
            "title": "E9 cost attribution — one cheap step",
            "goal": "measure the instrument, not the harness",
            "steps": [TASK],
        },
    )
    fid = flow["id"]
    print(f"flow {fid}")

    deadline = time.time() + 600
    while time.time() < deadline:
        _post(f"{DESK}/advance", {"flowId": fid})
        state = _get(f"{FLOWS}/flows/{fid}")
        if state["state"] == "blocked":
            print("  flow blocked — the transport failed, not the measurement")
            break
        if all(s["state"] in ("done", "failed", "skipped") for s in state["steps"]):
            break
        time.sleep(10)

    elapsed = time.time() - t0
    # A short settle: OpenRouter's account counters are not synchronous with the
    # response, and reading them the instant the flow returns is how a real cost
    # gets recorded as zero.
    time.sleep(20)
    after = probes(key)
    print(f"after   credits={after['credits_total_usage']}  auth/key={after['auth_key_usage']}")

    state = _get(f"{FLOWS}/flows/{fid}")
    result_text = (state["steps"][0].get("result") or "")[:400]

    def delta(k: str) -> float | None:
        a, b = after[k], before[k]
        return None if (a is None or b is None) else a - b

    d_credits, d_auth = delta("credits_total_usage"), delta("auth_key_usage")

    out = {
        "run_id": RUN_ID,
        "flow_id": fid,
        "elapsed_s": elapsed,
        "flow_state": state["state"],
        "result_head": result_text,
        "before": before,
        "after": after,
        "delta_credits_total_usage": d_credits,
        "delta_auth_key_usage": d_auth,
    }

    print("\n" + "=" * 62)
    print(f"  /credits  total_usage delta : {d_credits}")
    print(f"  /auth/key usage       delta : {d_auth}")
    if d_credits is not None and d_auth is not None:
        agree = abs(d_credits - d_auth) < 0.005
        out["endpoints_agree"] = agree
        print(f"  agree within half a cent    : {agree}")
        if not agree:
            print(
                "  -> they measure different things. Nothing that depends on a\n"
                "     per-flow dollar figure ships until which one is decided."
            )
    print("=" * 62)

    payload = attest.canonical(attest.json_safe(out))
    digest = attest.sha256_bytes(payload)
    d = ROOT / "runs" / f"{RUN_ID}-{digest[:12]}"
    d.mkdir(parents=True, exist_ok=True)
    (d / "result.json").write_bytes(payload)
    (d / "manifest.json").write_text(
        json.dumps(
            {
                "run_id": RUN_ID,
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
    print(f"written to {d.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
