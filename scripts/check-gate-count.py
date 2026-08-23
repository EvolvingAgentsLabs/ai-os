#!/usr/bin/env python3
"""The published gate count, checked against the reports that produce it.

`check-test-count.sh` exists because the test count drifted three times in one
week. The gate count then drifted the same way and nothing caught it: on
2026-08-23 thirteen places across seven files said **26 gates / 125 checks** while
`projects/coclea-sr/gates/reports/` held **28 gates / 135 checks**, and
`doc/PLAN.md` — written the same day the count changed — said 28/135 alone.

A rule applied to one number and not to the next one is a habit, not a check.

## What this verifies, and what it does not

It compares the *published claim* against the report artifacts on disk. It does
**not** re-run the suite: `make gates` is nine minutes and needs numpy, scipy
and sympy, so a check that ran it could not be a fast one. That means this
script inherits FRICTION F3 — a stale report is still a report — and
`gates/check_reports.py` is what guards against that. The two are complementary
and neither replaces the other.

It also refuses to answer if any report is unreadable or records a failure,
rather than reporting a smaller number that a broken suite would produce. A
check that degrades quietly is the failure mode `ai-flows/src/gates.ts` calls
out: "did not run" is not "passed".

SPDX-License-Identifier: Apache-2.0
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "projects" / "coclea-sr" / "gates" / "reports"

# Every file that publishes the count. Adding a claim without adding its file
# here is how the count drifted in the first place, so the scan below also
# fails on a claim found in a file nobody listed.
CLAIMANTS = [
    "README.md",
    "NEXT.md",
    "README.es.md",
    "doc/16-a-workload-with-an-oracle.md",
    "doc/es/16-a-workload-with-an-oracle.md",
    "doc/18-from-a-hypothesis-to-a-therapeutic-surface.md",
    "doc/es/18-from-a-hypothesis-to-a-therapeutic-surface.md",
    "doc/PLAN.md",
    "doc/19-what-would-make-this-matter.md",
    "doc/es/19-what-would-make-this-matter.md",
    "projects/coclea-sr/README.md",
]

# A document that records a *former* count — this repository supersedes rather
# than edits — marks it, and the mark is a decision somebody wrote down rather
# than a heuristic this script has to guess at. Invisible when rendered.
SUPERSEDED = "<!-- gate-count: superseded -->"

# Both orders and both languages, because the documents use both:
#   "28 gates / 135 checks"     "28 gates, 135 chequeos"
#   "135 gate checks across 28 gates"     "135 across 28 gates"
CLAIM_PATTERNS = [
    re.compile(r"(\d+)\s+(?:gates|puertas)\s*[/,]\s*\**\s*(\d+)\s+(?:checks|chequeos)"),
    re.compile(
        r"(\d+)\s+(?:(?:gate|de)\s+)?(?:checks|chequeos)?[^.\n]{0,12}?"
        r"(?:across|sobre)\s+(\d+)\s+gates"
    ),
]


def measured() -> tuple[int, int]:
    """(gates, checks) from the reports, refusing on anything unreadable."""
    if not REPORTS.is_dir():
        sys.exit(f"FAIL  {REPORTS} does not exist")

    gates: set[str] = set()
    checks = 0
    for path in sorted(REPORTS.glob("*.json")):
        try:
            report = json.loads(path.read_text())
        except (OSError, ValueError) as exc:
            sys.exit(f"FAIL  {path.name} is not readable JSON ({exc})")
        gate = report.get("gate")
        if not gate:
            sys.exit(f"FAIL  {path.name} names no gate")
        if report.get("passed") is not True:
            sys.exit(f"FAIL  {path.name} is not green; the published count claims all green")
        gates.add(gate)
        checks += 1

    if checks == 0:
        sys.exit(f"FAIL  no reports in {REPORTS}")
    return len(gates), checks


def scanned(roots):
    """Every document that can carry a claim, across every root given.

    `.html` as well as `.md`, because the number this script guards is also
    printed on the website -- a separate repository, which CI cannot see. The
    failure mode that made this necessary is written into the script's own error
    message: it told the reader to "update the copy in the website repository"
    and had no way to tell whether they had.
    """
    for root in roots:
        for pattern in ("**/*.md", "**/*.html"):
            for path in sorted(root.glob(pattern)):
                if "node_modules" in path.parts or ".git" in path.parts:
                    continue
                yield root, path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--also", action="append", default=[], metavar="DIR",
        help="another checkout to scan -- the website, before publishing it",
    )
    args = ap.parse_args()
    extra = [Path(d).resolve() for d in args.also]
    for d in extra:
        if not d.is_dir():
            sys.exit(f"FAIL  --also {d} is not a directory")

    gates, checks = measured()
    print(f"reports  {gates} gates / {checks} checks, all green [read from artifacts]")

    listed = {ROOT / name for name in CLAIMANTS}
    found_in: set[Path] = set()
    failed = False

    for root, path in scanned([ROOT] + extra):
        text = path.read_text(encoding="utf-8", errors="replace")
        # A claim wrapped across two blockquote lines is still a claim. Join
        # the continuation so "26 gates / 125\n> checks" is not invisible to
        # this check — that exact wrap is why README.es.md carried the stale
        # number one revision longer than README.md.
        text = re.sub(r"\n>[ \t]*", " ", text)
        for pattern in CLAIM_PATTERNS:
            for match in pattern.finditer(text):
                window = text[max(0, match.start() - 400) : match.start()]
                if SUPERSEDED in window:
                    continue
                a, b = int(match.group(1)), int(match.group(2))
                # The second pattern reads checks-then-gates.
                claimed = (a, b) if pattern is CLAIM_PATTERNS[0] else (b, a)
                found_in.add(path)
                rel = path.relative_to(root)
                if root is ROOT and path not in listed:
                    print(f"FAIL  {rel} publishes the count and is not in CLAIMANTS")
                    failed = True
                if claimed != (gates, checks):
                    print(
                        f"FAIL  {rel} says {claimed[0]} gates / {claimed[1]} checks; "
                        f"the reports hold {gates} / {checks}"
                    )
                    failed = True
                else:
                    print(f"ok    {rel} — {gates} / {checks}")

    for path in sorted(listed - found_in):
        print(f"FAIL  {path.relative_to(ROOT)} is listed as a claimant and states no count")
        failed = True

    if failed:
        print()
        print("Update the numbers above. The website is a separate repository and")
        print("CI cannot see it, so check it before publishing:")
        print("  python3 scripts/check-gate-count.py --also ../evolvingagentslabs.github.io")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
