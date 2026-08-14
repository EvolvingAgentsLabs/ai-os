#!/usr/bin/env python3
"""Re-derive the ledger's hash chain from the files on disk. Spec §8.2.

Standard library only, no import of `src/`, and short enough to read in one
sitting -- those three properties are the point. A verifier that shares code with
the thing it verifies checks that the code is self-consistent, not that the
record is true.

    python3 verify_ledger.py            # verify
    python3 verify_ledger.py --json     # machine-readable, for the ai-flows seam

Exit code 0 if the chain and every hash hold, 1 otherwise.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(obj: object) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()


def verify() -> dict:
    ledger = ROOT / "ledger.jsonl"
    problems: list[str] = []
    if not ledger.exists():
        return {"ok": False, "entries": 0, "problems": ["ledger.jsonl does not exist"]}

    lines = [ln for ln in ledger.read_text().splitlines() if ln.strip()]
    prev: str | None = None

    for i, line in enumerate(lines):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as exc:
            problems.append(f"entry {i}: not JSON ({exc})")
            prev = sha256(line.encode())
            continue

        # 1. The chain. Each entry names the hash of the line before it, so
        #    altering entry k invalidates every entry after k.
        if entry.get("prev_hash") != prev:
            problems.append(
                f"entry {i}: prev_hash {entry.get('prev_hash')!r} != {prev!r} -- chain broken"
            )

        # 2. Canonical form. The line must be exactly what hashing it produces,
        #    or the chain is over bytes nobody can reproduce.
        if canonical(entry).decode() != line:
            problems.append(f"entry {i}: line is not the canonical encoding of its own content")

        # 3. The artefact. A ledger entry naming a file whose bytes have changed
        #    is the failure this whole mechanism exists to make loud.
        artifact = entry.get("artifact")
        if artifact:
            path = ROOT / artifact
            if not path.exists():
                problems.append(f"entry {i}: {artifact} is recorded and missing")
            elif sha256(path.read_bytes()) != entry.get("sha256"):
                problems.append(f"entry {i}: {artifact} does not match its recorded sha256")

        prev = sha256(line.encode())

    return {
        "ok": not problems,
        "entries": len(lines),
        "head": prev,
        "problems": problems,
    }


def main(argv: list[str]) -> int:
    result = verify()
    if "--json" in argv:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(f"{result['entries']} entries, head {str(result['head'])[:16]}")
        for p in result["problems"]:
            print(f"  FAIL {p}")
        print("ok" if result["ok"] else f"{len(result['problems'])} problem(s)")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
