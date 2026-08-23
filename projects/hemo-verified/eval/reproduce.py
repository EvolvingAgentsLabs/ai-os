#!/usr/bin/env python3
"""Re-run H0 and compare it against the attested report, field by field.

`coclea-sr` has had `make reproduce` since it existed: content-addressed run
directories, and a re-run that lands in its **existing** directory or does not
reproduce. This project had no equivalent, and the gap is not academic — it is
how the finding below survived a merge.

## What it caught

On 2026-08-23 the suite was built from a clean clone on a machine that was not
the author's, and the report came back with the composite AUC, the Spearman
coefficient, the ACCEPT/ESCALATE/REJECT counts and the false-accept rate
**bit-identical** — and one number moved:

    A4 alone    0.706  ->  0.652

49 of 98 A4 measurements differ, all in the last decimals, which is ordinary
BLAS variation. What is not ordinary is what it does to A4 specifically: 66 of
the 98 values are exactly `0.0`, and one uncorrupted Womersley case sat at
`1.03e-13` on one machine and at exactly `0.0` on the other. The AUC averages
ranks over ties, so one element crossing into a 66-wide tie block moves the
statistic by 0.054. Every other oracle's AUC is unmoved because none of them
has a tie block anywhere near that size.

The composite does not move because A4 is `HARD`: it contributes a pass/fail
against a threshold far above the noise floor, never its score. So the headline
result is intact and one row of the per-oracle table is a property of the
machine it was computed on.

That is FRICTION F1 — *a number that is wrong for a reason nobody can see* —
in its fifth instance, and this file is the instrument that makes the sixth one
cheap.

## Why it does not simply fail

The reproducibility test added in #59 runs the pipeline in two processes and
demands they agree exactly. That is the right test and it cannot see this,
because both processes share one BLAS. Demanding bit-identity across machines
instead would be demanding something the code does not provide and no
floating-point pipeline provides.

So the rule is conditional on what the artifact records about itself:

* **Same environment** → every field outside `runtime` must be bit-identical.
  Anything else is a defect, and this exits non-zero.
* **Different environment** → drift is expected, so it is classified rather
  than judged: `last-bit` (relative difference below 1e-9) is reported and
  passes; anything larger is printed under **MATERIAL** and exits non-zero,
  because a statistic that moves in the second decimal between machines is a
  statistic the paper cannot quote without saying which machine.
* **Reference predates environment capture** → say so, classify, and pass.
  A check cannot demand a field the artifact it is comparing against never had.

SPDX-License-Identifier: Apache-2.0
"""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
REFERENCE = ROOT / "gates" / "reports" / "h0.json"

#: Not part of what a reader is meant to be able to hash.
IGNORED = {"runtime", "environment", "sha256"}

#: Below this relative difference a float is last-bit noise from a different
#: BLAS, not a disagreement. It is deliberately far tighter than anything the
#: paper quotes: the loosest number in the report is given to three decimals.
LAST_BIT = 1e-9

#: A relative test alone calls `1e-13 -> 0.0` a 100% disagreement, which is
#: true and useless: it is one wall speed thirteen orders below `u_ref`
#: landing on zero. What matters is not that measurement, it is the AUC it
#: moves — so an absolute floor keeps the noise quiet and leaves the derived
#: statistic as the only thing shouting.
ABS_FLOOR = 1e-9


def flatten(obj, prefix=""):
    """Every leaf of the payload, addressed by path."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if not prefix and k in IGNORED:
                continue
            yield from flatten(v, f"{prefix}.{k}" if prefix else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from flatten(v, f"{prefix}[{i}]")
    else:
        yield prefix, obj


def relative(a, b):
    """Relative difference, or None where the pair is not two finite numbers."""
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        return None
    if isinstance(a, bool) or isinstance(b, bool):
        return None
    if a != a or b != b:  # NaN on either side; equality below already decided
        return None
    scale = max(abs(a), abs(b))
    return abs(a - b) / scale if scale else 0.0


def run_fresh(out_dir: pathlib.Path) -> dict:
    proc = subprocess.run(
        [sys.executable, str(HERE / "h0.py"), "--out", str(out_dir)],
        cwd=ROOT, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        sys.exit(f"FAIL  the fresh run exited {proc.returncode}\n{proc.stderr}")
    return json.loads((out_dir / "h0.json").read_text())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--reference", default=str(REFERENCE))
    args = ap.parse_args()

    ref_path = pathlib.Path(args.reference)
    if not ref_path.exists():
        sys.exit(f"FAIL  no attested report at {ref_path}")
    reference = json.loads(ref_path.read_text())

    with tempfile.TemporaryDirectory() as tmp:
        fresh = run_fresh(pathlib.Path(tmp))

    ref_env = reference.get("environment")
    new_env = fresh.get("environment")
    if ref_env is None:
        same_env = None
        print("environment  the attested report predates environment capture, "
              "so bit-identity cannot be required of it")
    else:
        same_env = ref_env == new_env
        print(f"environment  {'same as' if same_env else 'DIFFERENT from'} "
              f"the attested report")
        if not same_env:
            for k in sorted(set(ref_env) | set(new_env)):
                if ref_env.get(k) != new_env.get(k):
                    print(f"             {k}: {ref_env.get(k)} -> {new_env.get(k)}")

    a, b = dict(flatten(reference)), dict(flatten(fresh))
    missing = sorted(set(a) - set(b)) + sorted(set(b) - set(a))
    identical, last_bit, material = 0, [], []
    for path in sorted(set(a) & set(b)):
        x, y = a[path], b[path]
        if x == y:
            identical += 1
            continue
        rel = relative(x, y)
        noise = rel is not None and (
            rel < LAST_BIT or abs(float(x) - float(y)) < ABS_FLOOR
        )
        (last_bit if noise else material).append((path, x, y, rel))

    print(f"fields       {identical} bit-identical, {len(last_bit)} within "
          f"{LAST_BIT:g} relative, {len(material)} material")

    for path, x, y, rel in material:
        shown = "" if rel is None else f"  (relative {rel:.3g})"
        print(f"MATERIAL     {path}: {x} -> {y}{shown}")
    if missing:
        for path in missing:
            print(f"MATERIAL     {path}: present on one side only")

    if same_env and (last_bit or material or missing):
        print("\nFAIL  same environment, so every field had to be identical.")
        for path, x, y, _ in last_bit[:10]:
            print(f"      {path}: {x} -> {y}")
        return 1
    if material or missing:
        print("\nFAIL  a field moved by more than last-bit noise across "
              "environments.\n"
              "      That is not something a different BLAS explains, and it "
              "is not something\n"
              "      the report can be quoted without naming a machine. See "
              "this file's header.")
        return 1

    print("\nREPRODUCED" + ("" if same_env else " — within last-bit noise on a "
                            "different environment"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
