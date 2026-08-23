#!/usr/bin/env python3
"""Write the verification page as one self-contained HTML file.

    python3 scripts/build-verify-page.py --out ../evolvingagentslabs.github.io/verify/index.html

## Why this exists next to the desk demo rather than instead of it

`ai-ui/scripts/build-demo.ts` produces the desk: the **real client** with an
in-page fake backend, generated from source so it cannot drift. That is a good
demo and it stays. But it demonstrates the pillar whose own falsification has
never been run -- the stopwatch, a person, a three-day-old flow -- and every
number on it is invented, because the backend is simulated. For a project whose
front page now says *every number is tied to the artifact that produced it*, a
simulation is an odd first handshake.

This page is the other one. **Nothing on it is simulated.** Every byte it checks
is a real artifact out of `projects/`, embedded verbatim, and the checking runs
in the reader's own browser with no network and no server. It is the argument
made in the only form that cannot be argued with: press the button and watch it
check.

## Generated, for the same reason the desk demo is

A page maintained separately from the artifacts stops being true within a week,
quietly, while continuing to look right. Regenerate it whenever the artifacts
change:

    node scripts/verify-page/test.mjs        # the logic, against node and Python
    python3 scripts/build-verify-page.py --out <site>/verify/index.html

SPDX-License-Identifier: Apache-2.0
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COCLEA = ROOT / "projects" / "coclea-sr"
HEMO = ROOT / "projects" / "hemo-verified"
HERE = ROOT / "scripts" / "verify-page"

#: Which artifacts travel with the page.
#:
#: Not all of them: three `e5-tl-resonance` results and a second `e3` sweep are
#: ~110 KB each of grid data that no published claim reads, and a page is a poor
#: place to carry a megabyte to prove a point that four files already prove. The
#: page says which entries it could not hash rather than quietly reporting a
#: smaller chain -- "did not run" is not "passed", here too.
def artifacts() -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for path in sorted((COCLEA / "runs").glob("*/manifest.json")):
        files[f"runs/{path.parent.name}/manifest.json"] = path.read_bytes()
    wanted = [
        # the four the published claims are read out of
        "e3-sr-curve-6bcecf029e8e",
        "b3-interactions-305a314da5b8",
        "e2-tonotopy-6afa3cc8c386",
        "e4-physiological-14bf748f07be",
        # and one superseded artifact that is intact and not valid JSON (F8)
        "e2-tonotopy-51dd5c3e79dd",
    ]
    for name in wanted:
        p = COCLEA / "runs" / name / "result.json"
        if not p.exists():
            sys.exit(f"FAIL  {p} is missing; the page cannot be built without it")
        files[f"runs/{name}/result.json"] = p.read_bytes()
    return files


def gate_reports() -> list[dict]:
    out = []
    for path in sorted((COCLEA / "gates" / "reports").glob("*.json")):
        out.append(json.loads(path.read_text()))
    return out


def h0_pair() -> tuple[dict, dict | None]:
    """The current H0 report, and the one that was committed before it.

    The second is fetched from git rather than kept as a file, because it is
    superseded evidence and the repository has exactly one place for those: its
    own history. If git is unavailable the page simply drops that section and
    says so.
    """
    import subprocess

    current = json.loads((HEMO / "gates" / "reports" / "h0.json").read_text())
    try:
        blob = subprocess.run(
            ["git", "show", "f3fc73f:projects/hemo-verified/gates/reports/h0.json"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout
        return current, json.loads(blob)
    except Exception:
        return current, None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    files = artifacts()
    reports = gate_reports()
    current_h0, old_h0 = h0_pair()
    ledger = (COCLEA / "ledger.jsonl").read_text()

    payload = {
        "ledger": ledger,
        "files": {k: base64.b64encode(v).decode() for k, v in files.items()},
        "reports": [
            {"gate": r.get("gate"), "test": r.get("test"), "passed": r.get("passed")}
            for r in reports
        ],
        "h0": {
            "current": {
                "auc": current_h0["auc_composite"],
                "per_oracle": current_h0["auc_per_oracle"],
                "environment": current_h0.get("environment"),
            },
            "previous": None if old_h0 is None else {
                "auc": old_h0["auc_composite"],
                "per_oracle": old_h0["auc_per_oracle"],
                "environment": old_h0.get("environment"),
            },
        },
    }

    app = (HERE / "app.js").read_text()
    css = (HERE / "page.css").read_text()
    shell = (HERE / "page.html").read_text()

    html = (shell
            .replace("/*CSS*/", css)
            .replace("/*APP*/", app.replace('export function', 'function')
                                   .replace('export const', 'const'))
            .replace("/*DATA*/", json.dumps(payload, separators=(",", ":"))))

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    size = len(html.encode())
    print(f"wrote {out} — {size // 1024} KB, "
          f"{len(files)} artifacts, {len(reports)} gate reports")
    if size > 1_200_000:
        print("FAIL  over the 1.2 MB budget; drop an artifact rather than shipping it")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
