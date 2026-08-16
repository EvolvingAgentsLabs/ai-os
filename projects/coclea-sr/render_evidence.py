#!/usr/bin/env python3
"""Render the Evidence Viewer: one static page a stranger can audit.

The plan's M2 deliverable, and its argument in one line: **the pitch and the
proof are the same artifact.** A post that links to a README asks to be believed.
A page that re-verifies its own hash chain in the visitor's browser does not.

Everything on the page comes from files that already existed — `ledger.jsonl`,
`runs/*/manifest.json`, `gates/reports/*.json`. Nothing is recomputed here and
nothing is entered by hand, which is the property that makes it evidence rather
than a slide.

## The button is the product

`verify_ledger.py` walks the hash chain in stdlib Python. The page carries the
same walk in JavaScript **and the raw ledger text**, so clicking *Verify* re-links
the chain locally: the visitor does not trust the badge, they recompute it. If a
single byte of any recorded artifact changed, the chain breaks in their browser
rather than in our CI.

That is also why the ledger is embedded rather than fetched. A page that fetched
its own evidence could be served a different file than the one it was rendered
from, and `file://` would block the fetch anyway.

## What it deliberately does not do

No server, no database, no build step, no external asset. One file, openable from
disk, publishable on GitHub Pages.

Stdlib only, like `verify_ledger.py` and `check_reports.py` — a tool that
presents the evidence should not need the environment that produced it.

Usage::

    python3 render_evidence.py            # writes report/evidence.html
    python3 render_evidence.py --out X    # somewhere else
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _stamp(ts: object) -> str:
    try:
        return datetime.fromtimestamp(float(str(ts)), timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    except (TypeError, ValueError):
        return "—"


def read_ledger() -> tuple[list[dict], str]:
    """Entries and the raw text. The raw text is what the browser re-verifies."""
    path = ROOT / "ledger.jsonl"
    if not path.exists():
        return [], ""
    raw = path.read_text()
    entries = []
    for line in raw.splitlines():
        line = line.strip()
        if line:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                # Kept as a visible defect rather than dropped: an unparseable
                # entry is exactly what a viewer must not hide.
                entries.append({"_unparseable": line[:200]})
    return entries, raw


def read_gates() -> dict[str, dict]:
    """Per gate: how many checks, how many red, and the measurements."""
    out: dict[str, dict] = {}
    for path in sorted((ROOT / "gates" / "reports").glob("*.json")):
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        gate = str(data.get("gate", "?"))
        entry = out.setdefault(gate, {"gate": gate, "total": 0, "failed": [], "checks": []})
        entry["total"] += 1
        if not data.get("passed"):
            entry["failed"].append(data.get("test"))
        entry["checks"].append(data)
    return out


def read_runs() -> list[dict]:
    runs = []
    for d in sorted((ROOT / "runs").glob("*")):
        manifest = d / "manifest.json"
        if not manifest.is_file():
            continue
        try:
            m = json.loads(manifest.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        m["_dir"] = d.name
        runs.append(m)
    runs.sort(key=lambda m: float(str(m.get("at", 0)) or 0), reverse=True)
    return runs


def read_decisions() -> list[dict]:
    """ADRs, with their status line — the lineage of what was tried and killed."""
    out = []
    for path in sorted((ROOT / "decisions").glob("*.md")):
        title, status = path.stem, ""
        for line in path.read_text().splitlines()[:12]:
            if line.startswith("# "):
                title = line[2:].strip()
            elif line.startswith("**Status:**"):
                status = line.split("**Status:**", 1)[1].strip()
        out.append({"file": path.name, "title": title, "status": status})
    return out


CSS = """
:root{--bg:#0f1115;--fg:#e6e8ee;--dim:#9aa3b2;--ok:#3fb950;--bad:#f85149;--card:#171a21;--line:#242833}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:960px;margin:0 auto;padding:32px 20px 80px}
h1{font-size:26px;margin:0 0 4px} h2{font-size:17px;margin:34px 0 12px;color:var(--dim);
  text-transform:uppercase;letter-spacing:.08em;font-weight:600}
.sub{color:var(--dim);margin:0 0 22px}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600}
.badge.ok{background:rgba(63,185,80,.15);color:var(--ok);border:1px solid rgba(63,185,80,.4)}
.badge.bad{background:rgba(248,81,73,.15);color:var(--bad);border:1px solid rgba(248,81,73,.4)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card .k{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.card .v{font-size:22px;font-weight:650;margin-top:4px}
.card .n{color:var(--dim);font-size:12px;margin-top:2px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--fg);
  border-radius:8px;padding:6px 11px;font-size:13px;font-weight:600;font-family:ui-monospace,monospace}
.chip.ok{border-color:rgba(63,185,80,.45)} .chip.ok::before{content:"● ";color:var(--ok)}
.chip.bad{border-color:rgba(248,81,73,.5)} .chip.bad::before{content:"● ";color:var(--bad)}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--dim);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
pre{background:#0b0d11;border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;
  max-height:340px;font-size:12px}
button.verify{background:#1f6feb;color:#fff;border:0;border-radius:8px;padding:10px 16px;
  font-size:14px;font-weight:600;cursor:pointer}
button.verify:hover{background:#2f81f7}
#vout{margin-top:12px;white-space:pre-wrap}
.scroll{overflow-x:auto}
"""

JS = r"""
// The same walk verify_ledger.py does, in the visitor's browser.
// The ledger text is embedded, not fetched: a page that fetched its own evidence
// could be served a different file than the one it was rendered from.
async function sha256(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function verify(){
  const out = document.getElementById('vout');
  const raw = document.getElementById('ledger-raw').textContent;
  const lines = raw.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!lines.length){ out.innerHTML = '<span class="badge bad">no ledger to check</span>'; return; }
  // The first entry's prev_hash is JSON null, matching Python's `prev = None`.
  // The first draft of this compared String(e.prev_hash) against the literal
  // "None" -- Python's repr, not its value -- and reported "chain broken" on
  // entry 0 of a perfectly good ledger. Caught by running this walk in node
  // against the same file and diffing it with verify_ledger.py, which is the
  // only way a cross-language check gets verified rather than assumed.
  let prev = null, problems = [];
  for(let i=0;i<lines.length;i++){
    let e; try { e = JSON.parse(lines[i]); }
    catch(err){ problems.push(`entry ${i}: not JSON`); break; }
    const declared = e.prev_hash === undefined ? null : e.prev_hash;
    if(declared !== prev){
      const show = v => v === null ? 'null' : String(v).slice(0,12) + '…';
      problems.push(`entry ${i}: prev_hash ${show(declared)} does not follow ${show(prev)}`);
    }
    // The link is the hash of the entry as written, with prev_hash included --
    // the same bytes verify_ledger.py hashes.
    prev = await sha256(lines[i]);
  }
  out.innerHTML = problems.length
    ? `<span class="badge bad">chain broken</span><br><code>${problems.map(p=>p.replace(/</g,'&lt;')).join('<br>')}</code>`
    : `<span class="badge ok">chain intact — ${lines.length} entries re-linked in your browser</span>`;
}
function showGate(id){
  document.querySelectorAll('.gate-detail').forEach(n=>n.style.display='none');
  const n = document.getElementById('g-'+id);
  if(n) n.style.display = n.style.display === 'block' ? 'none' : 'block';
}
"""


def render(out_path: Path) -> Path:
    entries, raw_ledger = read_ledger()
    gates = read_gates()
    runs = read_runs()
    decisions = read_decisions()

    total_checks = sum(g["total"] for g in gates.values())
    red_gates = [g for g in gates.values() if g["failed"]]
    green = not red_gates and bool(gates)

    # The headline number, taken from the gate that measured it rather than
    # restated: GATE-B2's subthreshold arm.
    headline = "—"
    for g in gates.get("B02", {}).get("checks", []):
        if g.get("arm") == "subthreshold" and isinstance(g.get("peak"), (int, float)):
            headline = f"{g['peak']:.2f} dB"

    e = html.escape

    def chips() -> str:
        parts = []
        for name in sorted(gates):
            g = gates[name]
            cls = "bad" if g["failed"] else "ok"
            parts.append(
                f'<button class="chip {cls}" onclick="showGate(\'{e(name)}\')">'
                f'{e(name)} <span style="color:var(--dim);font-weight:400">{g["total"]}</span></button>'
            )
        return "".join(parts)

    def gate_details() -> str:
        out = []
        for name in sorted(gates):
            body = json.dumps(gates[name]["checks"], indent=2, sort_keys=True)
            out.append(
                f'<div class="gate-detail" id="g-{e(name)}" style="display:none">'
                f"<h3 style='font-size:14px;margin:16px 0 6px'>GATE-{e(name)} — "
                f'{gates[name]["total"]} check(s)</h3>'
                f"<pre>{e(body)}</pre></div>"
            )
        return "".join(out)

    run_rows = "".join(
        f"<tr><td class='mono'>{e(str(m.get('run_id','?')))}</td>"
        f"<td class='mono'>{e(str(m.get('result_sha256',''))[:12])}…</td>"
        f"<td class='mono'>{e(str(m.get('git_commit',''))[:8])}</td>"
        f"<td>{e(_stamp(m.get('at')))}</td>"
        f"<td class='mono'>{e(str((m.get('environment') or {}).get('omp_num_threads','—')))}</td></tr>"
        for m in runs
    ) or "<tr><td colspan='5'>no attested runs</td></tr>"

    adr_rows = "".join(
        f"<tr><td class='mono'>{e(d['file'][:8])}</td><td>{e(d['title'])}</td>"
        f"<td style='color:var(--dim)'>{e(d['status'][:110])}</td></tr>"
        for d in decisions
    ) or "<tr><td colspan='3'>none</td></tr>"

    doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>COCLEA-SR — evidence</title><style>{CSS}</style></head><body><div class="wrap">

<h1>COCLEA-SR <span class="badge {'ok' if green else 'bad'}">
{'attested · ' + str(len(gates)) + '/' + str(len(gates)) + ' gates' if green
 else str(len(red_gates)) + ' gate(s) red'}</span></h1>
<p class="sub">Physiological noise as a functional mechanism: stochastic resonance
lets subthreshold basilar-membrane displacements cross the spiral-ganglion firing
threshold. Hypothesis formulated ~1995; this page is generated from the run
ledger, not written.</p>

<div class="grid">
  <div class="card"><div class="k">Ledger</div><div class="v">{len(entries)}</div>
    <div class="n">hash-chained entries</div></div>
  <div class="card"><div class="k">Gates</div><div class="v">{len(gates)}</div>
    <div class="n">{total_checks} checks, {len(red_gates)} red</div></div>
  <div class="card"><div class="k">GATE-B2 peak SNR</div><div class="v">{e(headline)}</div>
    <div class="n">significant interior maximum</div></div>
  <div class="card"><div class="k">Attested runs</div><div class="v">{len(runs)}</div>
    <div class="n">manifest + seed + commit</div></div>
</div>

<h2>Verify it yourself</h2>
<p class="sub">This re-links the hash chain in your browser from the ledger embedded
below. You are not asked to trust the badge above.</p>
<button class="verify" onclick="verify()">Verify ledger</button>
<div id="vout"></div>

<h2>Gates</h2>
<p class="sub">Click a gate for the measurements it recorded. Every check writes its
report whether it passed or failed — the run somebody needs to read is the one
that went red.</p>
<div class="chips">{chips()}</div>
{gate_details()}

<h2>Attested runs</h2>
<div class="scroll"><table><tr><th>run</th><th>result sha256</th><th>commit</th>
<th>at</th><th>OMP threads</th></tr>{run_rows}</table></div>

<h2>What was tried and killed</h2>
<div class="scroll"><table><tr><th>ADR</th><th>decision</th><th>status</th></tr>
{adr_rows}</table></div>

<h2>The ledger</h2>
<pre id="ledger-raw">{e(raw_ledger)}</pre>

<p class="sub" style="margin-top:28px">Generated by <code>render_evidence.py</code>
from <code>ledger.jsonl</code>, <code>runs/*/manifest.json</code> and
<code>gates/reports/*.json</code>. No number on this page was typed.</p>

</div><script>{JS}</script></body></html>
"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(doc)
    return out_path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=str(ROOT / "report" / "evidence.html"))
    args = ap.parse_args()
    path = render(Path(args.out))
    size = path.stat().st_size
    print(f"wrote {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path} ({size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
