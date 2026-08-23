#!/usr/bin/env python3
"""COCLEA-SR's headline results, checked against the runs that produced them.

The fourth checker, and the one the pattern was pointing at all along. The test
count drifted three times; the gate count sat at 26/125 for six days after it
became 28/135; HEMO-VERIFIED's oracle table had two wrong cells. Each time the
producer was sitting in the repository and nothing compared it to the sentence.

These are the numbers the project is quoted for -- 11.6%, 24 of 24, -1.22 dB with
its confidence interval, Q 2.2-2.7, and a crossover at about 1 kHz -- and they
appear across doc 16, doc 18, `doc/PLAN.md`, the project README and both Spanish
mirrors. Until now the distance between `runs/<id>-<hash>/result.json` and those
sentences was a person copying a number.

## Which run counts

Not "the newest directory". `ledger.jsonl` is the authority: entries carry a
`state`, a later entry can mark an artifact `superseded`, and the chain is
verified by `verify_ledger.py`. So the current artifact for an experiment is the
**last non-superseded `result.json` entry for that prefix, in ledger order**, and
this script derives that rather than guessing it. Two artifacts are superseded
today and both happen to be the malformed ones below, which is a coincidence
worth not relying on.

## The F8 trap, which this file has to walk into deliberately

Two of the twenty run artifacts are *intact but not valid JSON*: they carry a
bare `NaN` and a bare `-Infinity` (FRICTION F8). **Python's `json.load` accepts
both**, so the obvious implementation would read a malformed artifact and report
cheerful agreement. `parse_constant` is passed a function that raises, which is
F8's own lesson applied to the instrument that would enforce it.

## Is this the per-claim table the plan warned about?

[NEXT.md] said to stop if mapping artifact fields to published sentences needed a
hand-maintained table per claim, "because the instrument is a second thing to
keep in sync, which is the disease rather than the cure". It **is** a table per
claim -- six of them, below. The distinction that makes it worth having:

* it does **not** need touching when a number changes. Re-run E3, get 11.4%, and
  the check fails and the document gets edited. The table is untouched.
* it needs touching only when a **new claim** is published or an experiment is
  restructured -- the same cost as `CLAIMANTS` in the other three checkers.

A table that must be edited whenever the thing it describes moves is the disease.
A table that must be edited when somebody adds a claim is just the list of
claims.

SPDX-License-Identifier: Apache-2.0
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROJECT = ROOT / "projects" / "coclea-sr"
LEDGER = PROJECT / "ledger.jsonl"

#: Documents that quote these numbers. A file that quotes one and is not here
#: fails, for the same reason it does in `check-gate-count.py`.
CLAIMANTS = [
    "NEXT.md",
    "doc/16-a-workload-with-an-oracle.md",
    "doc/es/16-a-workload-with-an-oracle.md",
    "doc/18-from-a-hypothesis-to-a-therapeutic-surface.md",
    "doc/es/18-from-a-hypothesis-to-a-therapeutic-surface.md",
    "doc/19-what-would-make-this-matter.md",
    "doc/es/19-what-would-make-this-matter.md",
    "doc/PLAN.md",
    "projects/coclea-sr/README.md",
    "projects/coclea-sr/literature/comparison.md",
    # The verification page quotes six of these sentences in order to resolve
    # them; quoting them is publishing them.
    "scripts/verify-page/page.html",
]

#: Minus signs. The documents use U+2212 and the keyboard hyphen
#: interchangeably, so the sign is captured with the number and normalised
#: before comparison rather than consumed by the pattern -- consuming it was
#: this script's first bug, and it reported every signed claim as wrong.
MINUS = "[-−]"
DASH = "[-–—]"


def as_float(token: str) -> float:
    return float(token.replace("−", "-"))


def refuse_non_finite(literal):
    raise ValueError(f"non-finite JSON literal {literal!r}")


def load_result(path: Path) -> dict:
    try:
        return json.loads(path.read_text(), parse_constant=refuse_non_finite)
    except ValueError as exc:
        sys.exit(
            f"FAIL  {path.relative_to(ROOT)} is not valid JSON ({exc}).\n"
            f"      FRICTION F8: intact is not valid, and json.load would have "
            f"accepted this."
        )


def current_runs() -> dict[str, dict]:
    """The live `result.json` per experiment prefix, decided by the ledger."""
    if not LEDGER.exists():
        sys.exit(f"FAIL  no ledger at {LEDGER}")
    superseded: set[str] = set()
    order: list[str] = []
    for line in LEDGER.read_text().splitlines():
        if not line.strip():
            continue
        entry = json.loads(line)
        artifact = entry.get("artifact") or ""
        if not artifact.endswith("result.json"):
            continue
        if entry.get("state") == "superseded":
            superseded.add(artifact)
        else:
            order.append(artifact)

    live: dict[str, str] = {}
    for artifact in order:
        if artifact in superseded:
            continue
        # runs/<experiment>-<hash>/result.json  ->  <experiment>
        name = artifact.split("/")[1]
        prefix = name.rsplit("-", 1)[0]
        live[prefix] = artifact  # later entries win

    out = {}
    for prefix, artifact in live.items():
        out[prefix] = load_result(PROJECT / artifact)
        out[prefix]["_artifact"] = artifact
    return out


def q_range(runs):
    qs = [c["q10db"] for c in runs["e2-tonotopy"]["q10db"] if c.get("bracketed")]
    return (round(min(qs), 1), round(max(qs), 1))


#: (label, expected value(s) from the artifacts, pattern whose groups are those
#: values in the same order). Every match in every scanned document must agree.
CLAIMS = [
    (
        "B2 · the measured optimum, % of the parameter-free prediction",
        lambda r: (round(r["e3-sr-curve"]["prediction_check"]["max_relative_error"] * 100, 1),),
        re.compile(r"(?:optimum|óptimo)[^.\n]{0,40}?(\d+\.\d)\s?%"),
    ),
    (
        "B2 · curves with a significant interior maximum",
        lambda r: (
            r["e3-sr-curve"]["gate_B2"]["n_with_significant_interior_maximum"],
            r["e3-sr-curve"]["gate_B2"]["n_curves"],
        ),
        # "24 of 24 curves", "24 curvas de 24", "24 de 24 combinaciones".
        # Anchored on the noun, because a bare "N of N" also matches an ADR
        # counting nine flows -- which is exactly what it did first.
        re.compile(
            r"(\d+)\s+(?:curvas\s+)?(?:of|de)\s+(\d+)\s*"
            r"(?:\*\*)?\s*(?:curves|curvas|probe-and-frequency|combinaciones)",
        ),
    ),
    (
        "B3 · the interaction, dB",
        lambda r: (round(r["b3-interactions"]["gate_B3"]["effect_db"], 2),),
        re.compile(rf"(?:sub-additive|sub-aditiva)[^.\n]{{0,30}}?({MINUS}\d+\.\d\d)\s*`?\s*dB"),
    ),
    (
        "B3 · the confidence interval, dB",
        lambda r: tuple(round(x, 2) for x in r["b3-interactions"]["gate_B3"]["ci"]),
        re.compile(rf"\[\s*({MINUS}\d+\.\d\d)\s*,\s*({MINUS}\d+\.\d\d)\s*\]"),
    ),
    (
        "B1 · the passive Q range",
        q_range,
        re.compile(rf"\bQ\b[^.\n]{{0,20}}?(\d\.\d){DASH}(\d\.\d)"),
    ),
    (
        "E4 · the crossover characteristic frequency, kHz",
        lambda r: (r["e4-physiological"]["verdict"]["crossover_cf_hz"] / 1000.0,),
        re.compile(
            r"(?:characteristic frequency|frecuencia característica)"
            r"[^.\n]{0,20}?(\d+(?:\.\d+)?)\s*kHz"
        ),
    ),
]


def same(published: str, actual) -> bool:
    """Equal once the actual value is rounded to the published precision."""
    published = published.replace("−", "-")
    if isinstance(actual, int) and "." not in published:
        return published == str(actual)
    decimals = len(published.split(".")[1]) if "." in published else 0
    return f"{as_float(str(actual)):.{decimals}f}" == published


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

    runs = current_runs()
    print("runs     " + ", ".join(
        f"{k} → {v['_artifact'].split('/')[1]}" for k, v in sorted(runs.items())
    ))

    listed = {ROOT / name for name in CLAIMANTS}
    failed = False
    seen: dict[str, set[Path]] = {label: set() for label, _, _ in CLAIMS}

    # `.html` too, and across every root given: these numbers are also printed on
    # the website, which is a separate repository CI cannot see.
    for root in [ROOT] + extra:
      for pattern in ("**/*.md", "**/*.html"):
        for path in sorted(root.glob(pattern)):
            if "node_modules" in path.parts or ".git" in path.parts:
                continue
            text = re.sub(r"\n>[ \t]*", " ", path.read_text(encoding="utf-8", errors="replace"))
            rel = path.relative_to(root)
            for label, expected_of, pattern in CLAIMS:
                expected = expected_of(runs)
                for match in pattern.finditer(text):
                    groups = match.groups()
                    if len(groups) != len(expected):
                        continue
                    seen[label].add(path)
                    # CLAIMANTS is this repository's list. An extra root passed
                    # with --also is somebody else's checkout, and its numbers
                    # are checked without being told where they may live.
                    if root is ROOT and path not in listed:
                        print(f"FAIL  {rel} quotes “{label}” and is not in CLAIMANTS")
                        failed = True
                    bad = [
                        (g, e) for g, e in zip(groups, expected) if not same(g, e)
                    ]
                    if bad:
                        got = ", ".join(g for g in groups)
                        want = ", ".join(str(e) for e in expected)
                        print(f"FAIL  {rel} — {label}: says {got}; the run says {want}")
                        failed = True
                    else:
                        print(f"ok    {rel} — {label}: {', '.join(groups)}")

    for label, _, _ in CLAIMS:
        if not seen[label]:
            print(f"FAIL  no document states “{label}”, so nothing is being checked")
            failed = True

    if failed:
        print()
        print("Re-run the experiment and copy the number, or fix the document.")
        print("`make reproduce` in projects/coclea-sr says whether the run still holds.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
