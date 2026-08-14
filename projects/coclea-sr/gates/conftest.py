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
    (REPORTS / f"report_{request.node.module.GATE}_{name}.json").write_text(
        json.dumps(out, indent=2, sort_keys=True) + "\n"
    )
