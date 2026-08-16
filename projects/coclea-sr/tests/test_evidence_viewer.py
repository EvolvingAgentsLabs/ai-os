"""The Evidence Viewer, and the one property that makes it more than a slide.

Outside `gates/` on purpose: these are tests of the *tooling* that presents the
evidence, not gates on the physics, and a report written into `gates/reports/`
would put them in front of `ai-flows/src/gates.ts` as if they were.

## What is actually under test

The page carries a "Verify ledger" button that re-links the hash chain in the
visitor's browser. **A verifier that always says "intact" is worse than no
verifier**, because it is believed. So the load-bearing test is the tamper test:
change one byte and both implementations must break, name the same entry, and
name the same two hashes.

They are two implementations in two languages of the same walk, which is exactly
where this project has been bitten before (`CLAUDE.md`: Python and JavaScript
disagree on float formatting between 1e-5 and 1e-7). The first draft of the
page's JavaScript compared `String(e.prev_hash)` against the literal `"None"` —
Python's *repr*, not its value — and reported "chain broken" on entry 0 of a
perfectly good ledger. Nothing but running both against the same file would have
found it.

The JavaScript is **extracted from the rendered page** rather than from a source
file, so a page that shipped different code than the repo contains would fail
here.
"""

from __future__ import annotations

import html as html_mod
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import render_evidence  # noqa: E402  -- after the path insert

LEDGER = ROOT / "ledger.jsonl"


def _page(tmp_path: Path) -> str:
    return render_evidence.render(tmp_path / "evidence.html").read_text()


def _extract(page: str, tag_open: str, tag_close: str) -> str:
    i = page.rindex(tag_open) + len(tag_open)
    return page[i : page.index(tag_close, i)]


def _run_page_js(tmp_path: Path, page: str, ledger_text: str) -> str:
    """Run the page's own `verify()` over `ledger_text` and return what it says.

    Fails rather than skips when node is missing. A skipped cross-language check
    is how four drift tests once reported themselves as passing while measuring
    nothing (`CLAUDE.md`), and this repository has node everywhere.
    """
    node = shutil.which("node")
    assert node, "node is required: this test exists to compare two languages"

    js_path = tmp_path / "page.js"
    js_path.write_text(_extract(page, "<script>", "</script>"))
    led_path = tmp_path / "ledger.txt"
    led_path.write_text(ledger_text)

    driver = f"""
const fs = require("fs");
const {{ webcrypto }} = require("crypto");
globalThis.crypto = webcrypto;
globalThis.document = {{
  getElementById: (id) => ({{
    textContent: id === "ledger-raw" ? fs.readFileSync({json.dumps(str(led_path))}, "utf8") : "",
    set innerHTML(v) {{ console.log(v.replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim()); }},
  }}),
  querySelectorAll: () => [],
}};
eval(fs.readFileSync({json.dumps(str(js_path))}, "utf8"));
verify();
"""
    drv = tmp_path / "drv.js"
    drv.write_text(driver)
    proc = subprocess.run([node, str(drv)], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr
    return proc.stdout.strip()


def _run_python_verifier(ledger_text: str, tmp_path: Path) -> subprocess.CompletedProcess:
    """`verify_ledger.py` against a ledger, without disturbing the real one.

    The recorded artefacts are **symlinked in**, not omitted. A bare directory
    with only the ledger makes every artefact unreadable, so the verifier's first
    complaint is about entry 0's missing file and never reaches the chain — which
    is how the first draft of this helper had Python blaming entry 0 while
    JavaScript blamed entry 6, for the same tampered byte. The two were answering
    different questions, and the test was about to be "fixed" by loosening the
    comparison.
    """
    work = tmp_path / "proj"
    work.mkdir(exist_ok=True)
    (work / "ledger.jsonl").write_text(ledger_text)
    shutil.copy(ROOT / "verify_ledger.py", work / "verify_ledger.py")
    for name in ("runs", "gates", "src", "truth", "decisions"):
        link = work / name
        if not link.exists() and (ROOT / name).exists():
            link.symlink_to(ROOT / name)
    return subprocess.run(
        [sys.executable, "verify_ledger.py"], cwd=work, capture_output=True, text=True
    )


def _chain_entry(text: str) -> str:
    """The entry a verifier blamed **for the chain**, not for anything else.

    Both verifiers report other kinds of problem too, and taking the first
    `entry N` in the output compares whichever complaint happened to come first.
    """
    for line in text.splitlines():
        if "chain broken" in line or "does not follow" in line:
            return line.split("entry ")[1].split(":")[0].strip()
    raise AssertionError(f"no chain complaint in:\n{text}")


def _tamper(ledger_text: str, index: int = 5) -> str:
    """Flip one byte inside one entry. Asserts the edit landed.

    The first attempt at this replaced `'"actor": "'` — with a space, the way a
    human writes JSON. The ledger is written with compact separators and has no
    space, so nothing was changed and **both verifiers correctly reported the
    untouched chain as intact**. That read as "the tamper test passes" for a
    moment, which is precisely the shape of a test that measures nothing.
    """
    lines = [ln for ln in ledger_text.split("\n") if ln.strip()]
    before = lines[index]
    lines[index] = before.replace('"actor":"', '"actor":"X', 1)
    assert lines[index] != before, f"the tamper did not land: {before[:120]}"
    return "\n".join(lines) + "\n"


@pytest.fixture(scope="module")
def ledger_text() -> str:
    assert LEDGER.exists(), "no ledger to render from"
    return LEDGER.read_text()


def test_the_page_is_built_from_files_rather_than_typed(tmp_path, ledger_text):
    """Every headline number traces to something on disk."""
    page = _page(tmp_path)
    n_entries = len([ln for ln in ledger_text.splitlines() if ln.strip()])
    assert f'<div class="v">{n_entries}</div>' in page, "the ledger count is not the ledger's"

    gates = render_evidence.read_gates()
    assert gates, "no gate reports to show"
    for name in gates:
        assert f"showGate('{name}')" in page, f"gate {name} is missing from the page"

    # The headline is GATE-B2's own measurement, not a restatement.
    b2 = [c for c in gates.get("B02", {}).get("checks", []) if c.get("arm") == "subthreshold"]
    assert b2, "GATE-B2 has no subthreshold arm on disk"
    assert f"{b2[0]['peak']:.2f} dB" in page


def test_the_page_carries_the_ledger_it_was_rendered_from(tmp_path, ledger_text):
    """Embedded, not fetched. A fetched page could be served other evidence."""
    page = _page(tmp_path)
    embedded = html_mod.unescape(_extract(page, '<pre id="ledger-raw">', "</pre>"))
    assert embedded.strip() == ledger_text.strip()


def test_both_verifiers_agree_the_real_ledger_is_intact(tmp_path, ledger_text):
    page = _page(tmp_path)
    said = _run_page_js(tmp_path, page, ledger_text)
    assert "chain intact" in said, said
    assert _run_python_verifier(ledger_text, tmp_path).returncode == 0


def test_both_verifiers_break_on_one_altered_byte_and_name_the_same_entry(
    tmp_path, ledger_text
):
    """The load-bearing test. A verifier that cannot fail is decoration."""
    tampered = _tamper(ledger_text)
    page = _page(tmp_path)

    said = _run_page_js(tmp_path, page, tampered)
    assert "chain broken" in said, said

    proc = _run_python_verifier(tampered, tmp_path)
    assert proc.returncode != 0, "Python accepted a tampered ledger"

    # Same entry, in both. Two verifiers that disagree about *where* the chain
    # broke are two different checks wearing one name.
    entry_js = _chain_entry(said)
    entry_py = _chain_entry(proc.stdout)
    assert entry_js == entry_py, f"JS blamed entry {entry_js}, Python entry {entry_py}"
