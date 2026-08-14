"""Manifests, hashes and the hash-chained ledger. Spec §6.3 and §8.

Every artefact transition appends one line to `ledger.jsonl`, and each line
carries the hash of the line before it. That is the whole mechanism: to alter a
past entry you must rewrite every entry after it, so tampering is not prevented
but it is **not silent**, which is the property an audit trail actually needs.

The verifier is deliberately not in this module. `verify_ledger.py` at the
project root re-derives the chain from the files with nothing but the standard
library, so checking the ledger never runs the code that wrote it -- the same
independence rule §6.4 imposes between `truth/` and `src/`.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent
LEDGER = ROOT / "ledger.jsonl"
RUNS = ROOT / "runs"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def canonical(payload: Any) -> bytes:
    """The exact bytes a hash is taken over.

    Sorted keys and a fixed separator, so a dict that round-trips through JSON in
    a different insertion order hashes the same. Without this the chain breaks
    on a reordering that changed nothing, and a ledger that cries wolf is a
    ledger nobody checks.
    """
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def environment() -> dict[str, str]:
    """What the run was produced by. Spec §8.1.

    ``OMP_NUM_THREADS`` is recorded rather than assumed: a multithreaded BLAS
    reduction is not bit-reproducible, so a manifest that does not say how many
    threads were live is a manifest that cannot support §8.3's claim of bit-for-bit
    reproduction.
    """
    import numpy
    import scipy

    return {
        "python": sys.version.split()[0],
        "numpy": numpy.__version__,
        "scipy": scipy.__version__,
        "platform": platform.platform(),
        "machine": platform.machine(),
        "omp_num_threads": os.environ.get("OMP_NUM_THREADS", "(unset)"),
    }


def git_commit() -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return out.stdout.strip() if out.returncode == 0 else "(not a git checkout)"
    except (OSError, subprocess.SubprocessError):
        return "(git unavailable)"


def last_hash() -> str | None:
    """The hash of the final ledger entry, or ``None`` for an empty ledger."""
    if not LEDGER.exists():
        return None
    lines = [ln for ln in LEDGER.read_text().splitlines() if ln.strip()]
    if not lines:
        return None
    return sha256_bytes(lines[-1].encode())


def append(entry: dict[str, Any]) -> str:
    """Append one chained entry and return its own hash."""
    entry = {**entry, "prev_hash": last_hash()}
    line = canonical(entry).decode()
    with LEDGER.open("a") as fh:
        fh.write(line + "\n")
    return sha256_bytes(line.encode())


def record_run(run_id: str, result: dict[str, Any], actor: str = "EXPLORADOR") -> Path:
    """Write a run's manifest and result, then chain both into the ledger.

    **The directory is content-addressed**: ``runs/<run_id>-<first 12 of the
    result hash>``. The first version of this used ``runs/<run_id>`` and the
    ledger verifier caught what that costs within one session -- rerunning an
    experiment overwrites the file that six earlier ledger entries name, so every
    one of them reports a hash mismatch and the whole chain reads as tampered
    when nothing was. Seven simultaneous FAIL lines for an ordinary rerun is an
    alarm nobody will keep listening to.

    Content addressing fixes both directions at once. A **deterministic rerun**
    produces the same bytes, the same directory and the same hash, so the ledger
    does not grow and stays valid -- which is also a live check that the run *is*
    deterministic. A **changed** result gets its own directory, and the old one
    survives with its entry intact, which is what makes a result citable months
    later.
    """
    payload = json.dumps(result, indent=2, sort_keys=True) + "\n"
    digest = sha256_bytes(payload.encode())

    out = RUNS / f"{run_id}-{digest[:12]}"
    out.mkdir(parents=True, exist_ok=True)

    result_path = out / "result.json"
    # Idempotent: identical bytes, so a rerun neither rewrites nor re-chains.
    if result_path.exists() and sha256_file(result_path) == digest:
        return out
    result_path.write_text(payload)

    manifest = {
        "run_id": run_id,
        "at": time.time(),
        "git_commit": git_commit(),
        "environment": environment(),
        "result_sha256": sha256_file(result_path),
        # Which gate reports existed when this run was produced. A result whose
        # manifest lists no gates is a result nobody may cite -- that is the
        # eval-gated part of eval-gated freeze, and it is enforced by
        # `gate_state` below rather than by anyone remembering.
        "gates": gate_state(),
    }
    manifest_path = out / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")

    append(
        {
            "ts": manifest["at"],
            "artifact": str(result_path.relative_to(ROOT)),
            "sha256": manifest["result_sha256"],
            "state": "recorded",
            "gates_passed": sorted(g for g, ok in manifest["gates"].items() if ok),
            "actor": actor,
        }
    )
    append(
        {
            "ts": manifest["at"],
            "artifact": str(manifest_path.relative_to(ROOT)),
            "sha256": sha256_file(manifest_path),
            "state": "recorded",
            "gates_passed": [],
            "actor": actor,
        }
    )
    return out


def gate_state() -> dict[str, bool]:
    """Which gates have a report on disk, and whether each one passed.

    Read from `gates/reports/`, which the pytest fixture writes on **every**
    outcome including failure. A gate with no report is absent from this map
    rather than assumed green: "not run" and "passed" must never collapse into
    the same value, because they differ exactly when it matters.
    """
    reports = ROOT / "gates" / "reports"
    if not reports.exists():
        return {}
    state: dict[str, bool] = {}
    for path in sorted(reports.glob("report_*.json")):
        data = json.loads(path.read_text())
        gate = str(data.get("gate", path.stem))
        # A report exists for every run test; `passed` is recorded by the runner
        # (see `gates/run_gates.py`), and its absence means the outcome is
        # unknown, which is not the same as false.
        ok = bool(data.get("passed", False))
        state[gate] = state.get(gate, True) and ok
    return state


def may_freeze(required: list[str]) -> tuple[bool, list[str]]:
    """Spec §6.1: nothing becomes ``frozen`` while a required gate is not green.

    Returns the verdict and the list of blockers, so the caller can say *which*
    gate stopped it. A boolean alone turns a specific, fixable failure into an
    unexplained refusal.
    """
    state = gate_state()
    blockers = [g for g in required if not state.get(g, False)]
    return (not blockers), blockers
