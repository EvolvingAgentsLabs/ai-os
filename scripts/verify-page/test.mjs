/* The verification page's logic, checked against a second implementation.
 *
 *   node scripts/verify-page/test.mjs
 *
 * `app.js` reimplements sha256 and Python's canonical JSON form in the language
 * the page runs in. Both are the kind of thing that is nearly right for a long
 * time, so neither is trusted here: the hash is compared against node's own
 * crypto over every embedded artifact, and the chain's verdict against the
 * answer `verify_ledger.py` gives for the same files.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { sha256, canonical, hashText, verifyChain, verifyAddressing, verifyReadable, countGates }
  from "./app.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COCLEA = join(ROOT, "projects", "coclea-sr");

let failures = 0;
const ok = (cond, what) => {
  if (cond) console.log(`ok    ${what}`);
  else { console.log(`FAIL  ${what}`); failures += 1; }
};

/* --- sha256 against node's own --------------------------------------------- */
const files = {};
for (const dir of readdirSync(join(COCLEA, "runs"))) {
  for (const name of ["result.json", "manifest.json"]) {
    const rel = `runs/${dir}/${name}`;
    try { files[rel] = new Uint8Array(readFileSync(join(COCLEA, rel))); } catch { /* absent */ }
  }
}
let mismatched = 0;
for (const [rel, bytes] of Object.entries(files)) {
  const node = createHash("sha256").update(bytes).digest("hex");
  if (sha256(bytes) !== node) { mismatched += 1; console.log(`   ${rel}: ${sha256(bytes)} != ${node}`); }
}
ok(mismatched === 0, `sha256 agrees with node:crypto on ${Object.keys(files).length} artifacts`);
ok(sha256(new TextEncoder().encode("")) ===
   "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
   "sha256 of the empty string is the published constant");

/* --- the canonical form against Python's ----------------------------------- */
const ledgerText = readFileSync(join(COCLEA, "ledger.jsonl"), "utf8");
const lines = ledgerText.split("\n").filter((l) => l.trim());
let canonBad = 0;
for (const line of lines) if (canonical(JSON.parse(line)) !== line) canonBad += 1;
ok(canonBad === 0, `canonical() reproduces all ${lines.length} ledger lines byte for byte`);

/* --- the chain, against verify_ledger.py ----------------------------------- */
const chain = verifyChain(ledgerText, files);
const broken = chain.rows.filter((r) => !r.linked || !r.canonical).length;
const changed = chain.rows.filter((r) => r.artifactStatus === "CHANGED").length;

const python = JSON.parse(
  execFileSync("python3", [join(COCLEA, "verify_ledger.py"), "--json"], { cwd: COCLEA }).toString(),
);
ok(chain.entries === python.entries, `entry count agrees with verify_ledger.py (${chain.entries})`);
ok(broken === 0 && changed === 0, "no broken link, no non-canonical line, no changed artifact");
ok(python.ok === (broken === 0 && changed === 0),
   `verdict agrees with verify_ledger.py (${python.ok ? "ok" : "problems"})`);

/* --- tampering: the two shapes, and they are not the same ------------------
 *
 * Edit an entry and leave the rest alone: exactly one link breaks -- the next
 * one, whose prev_hash still names the old bytes -- and the head does not move,
 * because the head is the hash of the *last* line and nothing downstream
 * changed. Edit it and re-chain everything after it: no link breaks at all, and
 * the head moves. That is why the head is worth publishing and why a check that
 * only compares heads is not a check.
 */
const victim = JSON.parse(lines[3]);
victim.gates_passed = [...(victim.gates_passed ?? []), "A99"];

const edited = lines.slice();
edited[3] = canonical(victim);
const afterEdit = verifyChain(edited.join("\n"), files);
const brokenLinks = afterEdit.rows
  .map((r, i) => (r.linked ? null : i))
  .filter((i) => i !== null);
ok(brokenLinks.length === 1 && brokenLinks[0] === 4,
   `editing entry 3 breaks exactly one link, at entry ${brokenLinks[0]}`);
ok(afterEdit.head === chain.head,
   "and leaves the head where it was — the head alone is not the check");

const rechained = edited.slice();
let prevHash = hashText(rechained[3]);
for (let i = 4; i < rechained.length; i++) {
  const e = JSON.parse(rechained[i]);
  e.prev_hash = prevHash;
  rechained[i] = canonical(e);
  prevHash = hashText(rechained[i]);
}
const afterRechain = verifyChain(rechained.join("\n"), files);
ok(afterRechain.rows.every((r) => r.linked && r.canonical),
   "re-chaining the tail hides every broken link");
ok(afterRechain.head !== chain.head,
   "and moves the head, which is the thing a published head would catch");

/* --- content addressing ---------------------------------------------------- */
const addr = verifyAddressing(files);
ok(addr.length > 0 && addr.every((a) => a.ok),
   `every run directory is the first 12 hex digits of its own result (${addr.length})`);

/* --- F8: intact and unreadable --------------------------------------------- */
const readable = verifyReadable(files);
const unreadable = readable.filter((r) => !r.ok);
ok(unreadable.length === 2,
   `JSON.parse refuses ${unreadable.length} attested artifacts (expected 2 — FRICTION F8)`);
for (const u of unreadable) console.log(`      ${u.path}: bare ${u.literal}`);

/* --- the gate count -------------------------------------------------------- */
const reports = readdirSync(join(COCLEA, "gates", "reports"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(COCLEA, "gates", "reports", f), "utf8")));
const count = countGates(reports);
ok(count.gates === 28 && count.checks === 135 && count.red === 0,
   `the reports hold ${count.gates} gates / ${count.checks} checks, ${count.red} red`);

console.log(failures === 0 ? "\nall green" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
