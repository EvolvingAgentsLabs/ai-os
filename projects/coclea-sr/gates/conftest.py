"""Shared fixtures for the gates, and the report each one leaves behind.

Spec §6.2 wants ``gates/report_A*.json`` from the verifier, and §6.4 rule 3 wants
every number in a figure traceable to a run. So a gate does not merely assert:
it records what it measured, pass or fail, and the file it writes is the thing
`attest.py` hashes into the ledger.

Writing the report from a fixture finaliser rather than at the end of the test
body is deliberate -- **a failing gate must still leave its number behind.** A
report written only on the success path means the one run somebody needs to read
is the one that produced nothing.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT))

REPORTS = ROOT / "gates" / "reports"

# BLAS threading is pinned for the same reason spec §8.3 pins it in attested
# runs: a multithreaded reduction is not bit-reproducible, and a gate whose last
# digit moves between machines cannot be the thing a freeze depends on.
for _var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_var, "1")


def _json_safe(value):
    """Replace non-finite numbers with ``None``, recursively.

    **JSON has no representation for infinity or NaN**, and Python's
    `json.dumps` writes `Infinity` / `-Infinity` / `NaN` anyway — producing a
    file that Python reads back happily and that every other language rejects.

    Found on 2026-08-14 by `ai-flows/test/gates.test.ts`, which reads these
    files in TypeScript: two GATE-A10 reports carried an SNR of `-inf` at the
    noise level where the detector never fires, and `JSON.parse` failed with
    "No number after minus sign". The TypeScript seam silently saw **zero**
    gate reports and skipped four drift tests rather than failing — an
    interchange break that presented as a quiet loss of coverage.

    `null` is the right target and not `0` or a sentinel: an SNR of minus
    infinity means *no signal was detectable*, which is JSON's absent value, and
    coercing it to a number would put a fabricated measurement into a report.
    Whether it was infinite is preserved alongside in `non_finite_fields`.
    """
    import math

    if isinstance(value, float):
        return None if not math.isfinite(value) else value
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


def _non_finite_paths(value, prefix=""):
    """Where the non-finite values were, so the loss is recorded and not silent."""
    import math

    out = []
    if isinstance(value, float):
        if not math.isfinite(value):
            out.append(prefix or "(root)")
    elif isinstance(value, dict):
        for k, v in value.items():
            out.extend(_non_finite_paths(v, f"{prefix}.{k}" if prefix else str(k)))
    elif isinstance(value, (list, tuple)):
        for i, v in enumerate(value):
            out.extend(_non_finite_paths(v, f"{prefix}[{i}]"))
    return out


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Stash each phase's outcome on the item so the fixture finaliser can read it.

    Needed because a fixture teardown has no other way to find out whether the
    test it is tearing down passed. Without this the report file records the
    measurement and not the verdict, and `attest.gate_state` cannot tell "ran and
    failed" from "ran and passed" -- which is the one distinction the freeze gate
    is made of.
    """
    outcome = yield
    rep = outcome.get_result()
    setattr(item, f"_outcome_{rep.when}", rep)


# Field names that are unambiguously "smaller is better". `spread`, `shift`,
# `ratio`, `order` and `span` are deliberately absent: A14 asserts `shift <
# TOLERANCE_DB` in one test and `shift > TOLERANCE_DB` in another, so guessing
# the direction from the name would invert the slack for half of them. A test
# with an ambiguous quantity, or a lower-bound assertion, says so with
# `slack_basis=` and `bound=`.
_CLOSENESS = ("error", "defect", "residual", "drift", "difference")


def _slack(payload):
    """How much room is left between what was measured and what is allowed.

    A gate is only evidence in proportion to how tightly it binds, and until
    2026-08-22 that number existed in two reports out of 135 while the rest
    carried the ingredients and never divided them. Recomputing it by hand
    across the directory found C03 passing with a relative residual 760,000x
    below its tolerance -- green against a power balance free to degrade five
    orders of magnitude -- and A08 sitting 8% from red, one refactor away from
    a failure that would mean nothing.

    Neither number was chosen. Both were whatever made the test pass the day it
    was written. This does not fix that; it makes it visible, which is the part
    that was missing.

    -> (slack, note). `slack` is None when it cannot be computed, and the note
    says why rather than leaving a silent absence.
    """
    tol = payload.get("tolerance")
    if not isinstance(tol, (int, float)) or isinstance(tol, bool):
        return None, None
    if tol <= 0 or tol != tol or tol in (float("inf"), float("-inf")):
        return None, "tolerance is not a positive finite number"

    basis = payload.get("slack_basis")
    if isinstance(basis, str):
        observed = payload.get(basis)
        if not isinstance(observed, (int, float)) or isinstance(observed, bool):
            return None, f"slack_basis={basis!r} is not a number in this report"
    else:
        cand = {
            k: v for k, v in payload.items()
            if isinstance(v, (int, float)) and not isinstance(v, bool)
            and any(w in k.lower() for w in _CLOSENESS)
        }
        if not cand:
            return None, "no unambiguous observed quantity; pass slack_basis="
        # the binding one is the worst one, not the first one
        observed = max(cand.values())

    if observed != observed or observed in (float("inf"), float("-inf")):
        return None, "observed quantity is not finite"
    if payload.get("bound") == "lower":
        return (observed / tol, None) if tol > 0 else (None, "bad lower bound")
    if observed == 0:
        # An exact identity leaves undefined slack, not infinite slack. Ten A11
        # reports measure a symmetry defect of exactly zero; calling those the
        # loosest gates in the suite would be an artifact of the division.
        return None, "observed quantity is exactly zero; slack is undefined"
    return tol / abs(observed), None


@pytest.fixture
def report(request):
    """Collect measurements, then write them whatever the test's outcome."""
    payload: dict[str, object] = {}

    def record(**kw):
        payload.update(kw)

    record.data = payload  # type: ignore[attr-defined]
    yield record

    call_rep = getattr(request.node, "_outcome_call", None)
    setup_rep = getattr(request.node, "_outcome_setup", None)
    passed = bool(
        setup_rep is not None
        and setup_rep.passed
        and call_rep is not None
        and call_rep.passed
    )

    REPORTS.mkdir(parents=True, exist_ok=True)
    name = request.node.name.replace("[", "_").replace("]", "").replace("/", "_")
    out = {
        "gate": request.node.module.GATE,
        "test": name,
        "spec": request.node.module.SPEC,
        "passed": passed,
        # Recorded rather than reconstructed later: the failure text is the only
        # part of a red gate that says *why*, and it is gone once the process is.
        "failure": None if passed or call_rep is None else str(call_rep.longrepr)[-2000:],
        **payload,
    }
    slack, slack_note = _slack(payload)
    if slack is not None:
        out["slack"] = slack
    elif slack_note is not None:
        out["slack_note"] = slack_note

    non_finite = _non_finite_paths(out)
    if non_finite:
        out["non_finite_fields"] = sorted(non_finite)
    # `allow_nan=False` so a value this sanitiser missed raises at write time
    # rather than producing a file only Python can read.
    (REPORTS / f"report_{request.node.module.GATE}_{name}.json").write_text(
        json.dumps(_json_safe(out), indent=2, sort_keys=True, allow_nan=False) + "\n"
    )
