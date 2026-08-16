#!/usr/bin/env python3
"""Find gate reports with no test behind them, and refuse to guess about them.

`gates/reports/` is written by a fixture finaliser and **never cleaned**. Rename
a test and its old report stays, red, forever. `ai-flows/src/gates.ts` reads this
directory to compute the freeze verdict, so an orphan report is not clutter: it
is a permanent blocker on every gated flow, attributed to a check nobody can run.

Found on 2026-08-16 with two of them, and the second is why this compares
**(gate, test) pairs** rather than test names:

    RED H4   test_h4_prescribes_nothing_for_an_ear_at_or_past_the_optimum
    RED C03  test_more_damping_dissipates_more

The first test had been renamed and no longer existed anywhere. The second still
exists — in `test_A06_energy_balance.py`, whose module declares ``GATE = "A06"``.
It had **moved between modules**, and its old report stayed behind attributed to
a gate that no longer contains it. A name-only comparison called it live and
missed it; the pair comparison catches it. C03's own suite re-ran 9/9 green the
same minute the stale red was sitting in the directory.

## Why this reports instead of pruning

The obvious fix — delete any report whose test is missing — has a failure mode
worse than the bug. If a test **file** stops importing (a syntax error, a missing
dependency), pytest collects nothing from it and every one of its reports looks
like an orphan. Auto-pruning would then delete a *genuinely red* gate and the
freeze verdict would go green because the evidence was removed.

So this refuses to act when collection is not trustworthy, and pruning is a
separate, explicit flag.

Usage::

    python3 gates/check_reports.py            # list orphans, exit 1 if any
    python3 gates/check_reports.py --prune    # delete them, after the same checks

Stdlib only, like `verify_ledger.py`: a tool that guards the evidence should not
need the environment the evidence was produced in.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "gates" / "reports"


def _gate_of(module_path: Path) -> str | None:
    """The ``GATE`` a test module declares, read as text rather than imported.

    Importing would run the module, which needs the project's environment — and
    this tool is stdlib-only on purpose, for the same reason `verify_ledger.py`
    is: a guard on the evidence should not need what produced it.
    """
    try:
        for line in module_path.read_text().splitlines():
            stripped = line.strip()
            if stripped.startswith("GATE ="):
                return stripped.split("=", 1)[1].strip().strip("\"'")
    except OSError:
        return None
    return None


def collected_tests() -> tuple[set[tuple[str, str]], str | None]:
    """``(gate, test)`` pairs pytest can currently collect, or why not to trust it.

    Pairs and not names. A test that **moves between modules** keeps its name and
    changes its gate, and its old report stays behind under the old gate — which
    is exactly how `C03` kept a red for a test that was passing in `A06`.

    ``problem`` is non-None when the collection is not safe to compare against —
    an import error, a non-zero exit, or an implausibly empty result — and every
    caller must treat that as "do not act".
    """
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", str(ROOT / "gates"), "-q", "--collect-only"],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    if proc.returncode != 0:
        return set(), f"pytest --collect-only exited {proc.returncode}"
    if "error" in proc.stdout.lower() and "errors" in proc.stdout.lower():
        return set(), "collection reported errors"

    pairs: set[tuple[str, str]] = set()
    unlabelled: list[str] = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if "::" not in line:
            continue
        file_part, node = line.split("::", 1)
        gate = _gate_of(ROOT / file_part)
        if gate is None:
            unlabelled.append(file_part)
            continue
        # The report filename normalises parametrisation the same way conftest
        # does, so compare in that normalised form rather than re-deriving it.
        pairs.add((gate, node.replace("[", "_").replace("]", "").replace("/", "_")))
    if unlabelled:
        # A module with no GATE writes reports the conftest cannot label either,
        # so this is a real defect upstream of here rather than something to
        # tolerate quietly.
        return set(), f"no GATE declared in: {', '.join(sorted(set(unlabelled)))}"
    if not pairs:
        return set(), "collected no tests at all"
    return pairs, None


def orphans() -> tuple[list[Path], str | None]:
    live, problem = collected_tests()
    if problem:
        return [], problem
    found: list[Path] = []
    for path in sorted(REPORTS.glob("*.json")):
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            # An unreadable report is its own problem and is NOT an orphan.
            # Deleting it would remove evidence nobody has read.
            print(f"  unreadable  {path.name}: {exc}")
            continue
        test, gate = data.get("test"), data.get("gate")
        if isinstance(test, str) and isinstance(gate, str) and (gate, test) not in live:
            found.append(path)
    return found, None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--prune", action="store_true", help="delete the orphans found")
    args = ap.parse_args()

    found, problem = orphans()
    if problem:
        print(f"refusing to judge the reports: {problem}")
        print("A report whose test file stopped importing looks exactly like an orphan,")
        print("and pruning it would turn a red gate green by deleting the evidence.")
        return 2
    if not found:
        print("every gate report has a test behind it")
        return 0

    print(f"{len(found)} report(s) with no test behind them:")
    for path in found:
        data = json.loads(path.read_text())
        state = "RED" if not data.get("passed") else "green"
        print(f"  {state:5s} {data.get('gate'):4s} {data.get('test')}")
    if not args.prune:
        print("\nrerun with --prune to delete them")
        return 1
    for path in found:
        path.unlink()
    print(f"\ndeleted {len(found)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
