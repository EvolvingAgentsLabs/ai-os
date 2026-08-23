#!/usr/bin/env python3
"""HEMO-VERIFIED's published numbers, checked against `h0.json`.

The third instance of the same failure in one repository, and the reason this
file exists rather than a habit:

* the **test count** drifted three times in a week -> `check-test-count.sh`
* the **gate count** sat at 26/125 for six days after it became 28/135
  -> `check-gate-count.py`
* and the **per-oracle table** in `projects/hemo-verified/README.md` disagreed
  with the artifact it was copied from in two rows at once.

The two rows, found 2026-08-23:

| row | README said | `h0.json` said |
|---|---|---|
| A4 | 0.706 | 0.652 on a clean environment, 0.706 on the author's |
| A5 / A6 | 0.522 / 0.521 | 0.521 / 0.522 — transposed |

A5/A6 is a plain transposition and is now corrected. A4 is not a typo: it is
environment-dependent, and `eval/reproduce.py` is what explains it. This script
does not attempt to judge that; it only refuses to let the table and the
artifact say different things, whichever machine produced the artifact.

## What it checks

Every `| A<n> ... | <number> |` row of the README's oracle table against
`auc_per_oracle` in `gates/reports/h0.json`, to the precision the README
prints, plus the headline figures the prose quotes: the composite AUC, the
Spearman coefficient, the false-accept rate, and the decision counts. Both the
English README and its Spanish article carry those, so both are scanned.

It reads the artifact and does not re-run the experiment — `make h0` is the
producer, `make reproduce` is what says the producer still produces it, and
this is only the third thing: that what got published is what was produced.

SPDX-License-Identifier: Apache-2.0
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROJECT = ROOT / "projects" / "hemo-verified"
REPORT = PROJECT / "gates" / "reports" / "h0.json"

#: Files that quote H0's numbers. A file that quotes them and is not here is a
#: failure, for the same reason it is in `check-gate-count.py`.
CLAIMANTS = ["projects/hemo-verified/README.md"]

TABLE_ROW = re.compile(r"^\|\s*(A\d+)[^|]*\|\s*([0-9.]+)\s*\|", re.M)
HEADLINE = {
    "auc_composite": re.compile(r"AUC \(composite\)\s+([0-9.]+)"),
    "spearman_composite": re.compile(r"Spearman rho\s+([0-9.]+)"),
}
DECISIONS = re.compile(r"ACCEPT (\d+)\s+ESCALATE (\d+)\s+REJECT (\d+)")
FALSE_ACCEPT = re.compile(r"false-accept\s+([0-9.]+)%")


def close(published: str, actual: float) -> bool:
    """Equal once the actual value is rounded to the published precision."""
    decimals = len(published.split(".")[1]) if "." in published else 0
    return f"{actual:.{decimals}f}" == published


def main() -> int:
    if not REPORT.exists():
        sys.exit(f"FAIL  no report at {REPORT}; run `make h0` in {PROJECT.name}")
    report = json.loads(REPORT.read_text())
    per = report["auc_per_oracle"]
    env = report.get("environment")
    print(f"report   composite {report['auc_composite']:.3f}, "
          f"{len(per)} oracles, environment "
          f"{'recorded' if env else 'NOT RECORDED'}")
    if not env:
        print("FAIL     the artifact records no environment, so nothing can say "
              "which machine\n         these numbers belong to. Regenerate it "
              "with the current eval/h0.py.")
        return 1

    failed = False
    seen = set()
    for name in CLAIMANTS:
        path = ROOT / name
        text = path.read_text(encoding="utf-8")
        seen.add(path)
        rows = TABLE_ROW.findall(text)
        if not rows:
            print(f"FAIL  {name} states no oracle table")
            failed = True
        for oracle, published in rows:
            if oracle not in per:
                print(f"FAIL  {name} publishes {oracle}, which the report does not have")
                failed = True
            elif not close(published, per[oracle]):
                print(f"FAIL  {name} says {oracle} = {published}; "
                      f"the report says {per[oracle]:.6f}")
                failed = True
            else:
                print(f"ok    {name} — {oracle} {published}")

        for key, pattern in HEADLINE.items():
            m = pattern.search(text)
            if not m:
                print(f"FAIL  {name} does not quote {key}")
                failed = True
            elif not close(m.group(1), report[key]):
                print(f"FAIL  {name} says {key} = {m.group(1)}; "
                      f"the report says {report[key]:.6f}")
                failed = True
            else:
                print(f"ok    {name} — {key} {m.group(1)}")

        m = DECISIONS.search(text)
        if m:
            want = (report["accepted"], report["escalated"], report["rejected"])
            got = tuple(int(x) for x in m.groups())
            if got != want:
                print(f"FAIL  {name} says decisions {got}; the report says {want}")
                failed = True
            else:
                print(f"ok    {name} — decisions {got}")

        m = FALSE_ACCEPT.search(text)
        if m and not close(m.group(1), report["false_accept_rate"] * 100):
            print(f"FAIL  {name} says false-accept {m.group(1)}%; "
                  f"the report says {report['false_accept_rate'] * 100:.3f}%")
            failed = True
        elif m:
            print(f"ok    {name} — false-accept {m.group(1)}%")

    # A file that quotes the table and nobody listed.
    for path in sorted(PROJECT.glob("*.md")):
        if path in seen:
            continue
        if TABLE_ROW.search(path.read_text(encoding="utf-8", errors="replace")):
            print(f"FAIL  {path.relative_to(ROOT)} publishes an oracle table "
                  f"and is not in CLAIMANTS")
            failed = True

    if failed:
        print("\nRegenerate with `make h0` and copy the numbers, or fix the table.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
