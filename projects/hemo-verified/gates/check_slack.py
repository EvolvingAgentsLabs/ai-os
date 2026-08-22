#!/usr/bin/env python3
"""Report how tightly each gate actually binds, and flag both extremes.

A gate is evidence in proportion to its slack -- the ratio between what it
allows and what it measured. Until 2026-08-22 that ratio was computed in two
reports out of 135; the rest carried a `tolerance` and an observed error and
never divided them. Doing it by hand across the directory found:

    C03  relative_residual  1.31e-09 against a tolerance of 1e-03
         -> green with room for the power balance to degrade 760,000x
    A08  max_relative_error 9.22e-06 against a tolerance of 1e-05
         -> 8% of drift from red, on a number nobody chose

Neither end is a bug on its own. A tolerance far above an exact identity is
legitimate when it only covers numerical noise, and a tight one is right where
the quantity is genuinely bounded. The problem is that **today nobody can tell
which is which**, because the number is not recorded, not compared, and not
looked at.

## Why this does not touch the freeze verdict

`ai-flows/src/gates.ts` turns a red report into a blocker on every gated flow.
Slack is not redness: a loose gate is passing, and a tight one may be perfectly
calibrated. Wiring this into the freeze would convert a question about
calibration into an outage, and would do it on thresholds that are themselves
unchosen -- the exact mistake this file exists to surface. It reports; a human
decides. `--strict` is there for a CI job that someone deliberately opts into.

Usage::

    python3 gates/check_slack.py             # table + distribution, exit 0
    python3 gates/check_slack.py --strict     # exit 1 if any gate is at either end
    python3 gates/check_slack.py --loose 1e4 --tight 1.5

Stdlib only, like `verify_ledger.py` and `check_reports.py`: a tool that audits
the evidence should not need the environment that produced it.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

REPORTS = pathlib.Path(__file__).resolve().parent / "reports"
LOOSE = 1e3       # above this the gate tolerates almost any degradation
TIGHT = 2.0       # below this it will go red on drift that means nothing


def load(directory: pathlib.Path):
    """-> (with_slack, without_slack, unreadable)"""
    with_slack, without, bad = [], [], []
    for f in sorted(directory.glob("*.json")):
        try:
            d = json.loads(f.read_text())
        except (OSError, json.JSONDecodeError) as e:
            bad.append((f.name, str(e)[:80]))
            continue
        if not isinstance(d, dict):
            bad.append((f.name, "not an object"))
            continue
        if isinstance(d.get("slack"), (int, float)):
            with_slack.append(d)
        elif "tolerance" in d:
            without.append(d)
    return with_slack, without, bad


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(REPORTS))
    ap.add_argument("--loose", type=float, default=LOOSE)
    ap.add_argument("--tight", type=float, default=TIGHT)
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 if any gate sits at either end")
    a = ap.parse_args(argv)
    directory = pathlib.Path(a.dir)
    if not directory.is_dir():
        print(f"no report directory at {directory}", file=sys.stderr)
        return 2

    with_slack, without, bad = load(directory)
    for name, why in bad:
        print(f"UNREADABLE {name}: {why}")
    if not with_slack and not without:
        print("no reports carry a tolerance; nothing to audit")
        return 0

    loose = sorted([d for d in with_slack if d["slack"] > a.loose],
                   key=lambda d: -d["slack"])
    tight = sorted([d for d in with_slack if d["slack"] < a.tight],
                   key=lambda d: d["slack"])

    if loose:
        print(f"\nLOOSE — passing on a tolerance more than {a.loose:g}x the "
              f"measurement ({len(loose)}):")
        for d in loose:
            print(f"  {d['gate']:5} slack={d['slack']:>12,.0f}x  {d['test'][:56]}")
    if tight:
        print(f"\nTIGHT — less than {a.tight:g}x from red ({len(tight)}):")
        for d in tight:
            print(f"  {d['gate']:5} slack={d['slack']:>12,.2f}x  {d['test'][:56]}")

    if with_slack:
        vals = sorted(d["slack"] for d in with_slack)
        mid = vals[len(vals) // 2]
        print(f"\n{len(with_slack)} gates with slack: "
              f"min={vals[0]:,.2f}x  median={mid:,.1f}x  max={vals[-1]:,.0f}x")
    if without:
        print(f"\n{len(without)} carry a tolerance but no slack:")
        seen = {}
        for d in without:
            seen.setdefault(d.get("slack_note", "no note"), []).append(d["gate"])
        for note, gates in sorted(seen.items()):
            print(f"  {len(gates):>3}  {note}  ({', '.join(sorted(set(gates)))})")

    if a.strict and (loose or tight):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
