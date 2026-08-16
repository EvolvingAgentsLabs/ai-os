#!/usr/bin/env python3
"""Analyse E7, with the retraction metric corrected. Spec §7.4.

    python experiments/e7_analyse.py runs/e7-ratio-<hash>/result.json

## The flaw this exists to fix, found before the data landed

`e7_explorer_verifier_ratio.py` records a retraction as *"any explorer-verifier
pair disagrees"*. The number of pairs is not constant across arms:

    5:1  ->  5 x 1 = 5 pairs
    2:1  ->  4 x 2 = 8 pairs
    1:1  ->  3 x 3 = 9 pairs

So the arm with more verifiers gets more chances for **any** pair to trip, and
the metric would have risen with the verifier count whether or not a single
verifier caught anything real. That is a measurement of the design, presented as
a result about the design.

The raw per-verifier claims are stored, so this recomputes an unbiased version
without re-running anything:

* **dissent rate** = verifiers whose number differs from the explorers' median by
  more than the tolerance, divided by the number of verifiers. One roll per
  verifier, whatever the arm.
* **correction rate** = flows where the explorers' median was wrong and the final
  answer was right. This is the only quantity that measures what verification is
  *for*, and it is what §7.4's cost-quality curve should be plotted against.

The `retraction` field from the run is still reported, labelled as the biased
upper bound it is. Deleting it would hide that the first version was wrong.
"""

from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

TOLERANCE = 0.25


def _median(values: list[float | None]) -> float | None:
    got = [v for v in values if v is not None]
    return statistics.median(got) if got else None


def analyse(rows: list[dict], true_order: float) -> dict:
    out: dict[str, dict] = {}
    for row in rows:
        arm = out.setdefault(
            row["arm"],
            {
                "n": 0, "correct": 0, "cost": [], "elapsed": [],
                "verifiers_total": 0, "verifiers_dissenting": 0,
                "explorer_median_wrong": 0, "corrected": 0,
                "biased_any_pair": 0,
            },
        )
        arm["n"] += 1
        arm["cost"].append(row["cost_usd"])
        arm["elapsed"].append(row["elapsed_s"])
        arm["correct"] += bool(row["correct"])
        arm["biased_any_pair"] += bool(row.get("retraction"))

        ex_med = _median(row["explorer_claims"])
        arm["verifiers_total"] += int(row["verifiers"])
        for v in row["verifier_claims"]:
            if v is not None and ex_med is not None and abs(v - ex_med) > TOLERANCE:
                arm["verifiers_dissenting"] += 1

        # Did verification actually change the outcome? Only countable when the
        # explorers were wrong to begin with.
        if ex_med is not None and abs(ex_med - true_order) > TOLERANCE:
            arm["explorer_median_wrong"] += 1
            if row["correct"]:
                arm["corrected"] += 1

    summary = {}
    for label, a in out.items():
        summary[label] = {
            "n": a["n"],
            "accuracy": a["correct"] / a["n"],
            "mean_cost_usd": sum(a["cost"]) / a["n"],
            "mean_elapsed_s": sum(a["elapsed"]) / a["n"],
            "dissent_rate_per_verifier": (
                a["verifiers_dissenting"] / a["verifiers_total"] if a["verifiers_total"] else None
            ),
            "flows_where_explorers_were_wrong": a["explorer_median_wrong"],
            "of_those_corrected": a["corrected"],
            "biased_any_pair_rate": a["biased_any_pair"] / a["n"],
        }
    return summary


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if path is None:
        runs = sorted(Path(__file__).resolve().parent.parent.glob("runs/e7-ratio-*/result.json"))
        if not runs:
            raise SystemExit("no e7 run found; pass the result.json path")
        path = runs[-1]
    data = json.loads(path.read_text())
    summary = analyse(data["rows"], data["true_order"])

    print(f"source: {path}")
    print(f"true order: {data['true_order']}, tolerance +/-{data['tolerance']}\n")
    print(f"{'arm':<6}{'n':>3}{'accuracy':>10}{'dissent/verifier':>18}{'corrected':>12}{'mean $':>9}{'mean s':>8}")
    for label in ("5:1", "2:1", "1:1"):
        s = summary.get(label)
        if not s:
            continue
        d = "-" if s["dissent_rate_per_verifier"] is None else f"{s['dissent_rate_per_verifier']:.0%}"
        corrected = f"{s['of_those_corrected']}/{s['flows_where_explorers_were_wrong']}"
        print(
            f"{label:<6}{s['n']:>3}{s['accuracy']:>10.0%}{d:>18}{corrected:>12}"
            f"{s['mean_cost_usd']:>9.4f}{s['mean_elapsed_s']:>8.0f}"
        )
    print("\n  dissent/verifier is the unbiased retraction rate: one roll per verifier.")
    print("  'corrected' counts only flows where the explorers' median was wrong to")
    print("  begin with — the only place verification can show its worth.")
    print("\n  biased 'any pair disagrees' rate, kept so the correction is visible:")
    for label in ("5:1", "2:1", "1:1"):
        if label in summary:
            print(f"    {label}: {summary[label]['biased_any_pair_rate']:.0%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
