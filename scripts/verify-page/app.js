/* The verification page's logic, kept in its own file so it can be tested.
 *
 * `scripts/build-verify-page.py` inlines this into a single self-contained HTML
 * file. Nothing here talks to a network: every byte it checks is embedded in the
 * page, and the checking happens in the reader's own browser.
 *
 * It is a reimplementation of `projects/coclea-sr/verify_ledger.py` in a second
 * language, which is the point rather than an accident. A verifier that shares
 * code with the thing it verifies checks self-consistency; two independent
 * implementations agreeing on the same bytes is a different and better claim.
 * `scripts/verify-page/test.mjs` runs this against node's own crypto and against
 * the Python verifier's answer.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/* ---- sha256, in ~40 lines, because `crypto.subtle` is not available on
 * `file://` in every browser and this page has to work when it is opened from
 * disk with nothing installed. */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256(bytes) {
  const ml = bytes.length;
  const withPad = new Uint8Array((((ml + 8) >> 6) + 1) << 6);
  withPad.set(bytes);
  withPad[ml] = 0x80;
  const view = new DataView(withPad.buffer);
  view.setUint32(withPad.length - 4, (ml << 3) >>> 0);
  view.setUint32(withPad.length - 8, Math.floor(ml / 536870912));

  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const w = new Uint32Array(64);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < withPad.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const next = [a, b, c, d, e, f, g, hh];
    for (let t = 0; t < 8; t++) h[t] = (h[t] + next[t]) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

/* ---- the canonical form Python writes, reproduced exactly.
 *
 * `json.dumps(obj, sort_keys=True, separators=(",", ":"))` with the default
 * `ensure_ascii=True`. The escaping clause is what that default costs: JS leaves
 * non-ASCII alone and Python does not, and a chain over bytes that differ by one
 * escape is a chain over bytes nobody can reproduce. */
export function canonical(v) {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    return JSON.stringify(v).replace(/[-￿]/g,
      (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  }
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort()
    .map((k) => canonical(k) + ":" + canonical(v[k])).join(",") + "}";
}

const utf8 = (s) => new TextEncoder().encode(s);
export const hashText = (s) => sha256(utf8(s));

/* ---- 1. the chain --------------------------------------------------------
 *
 * Three properties per entry, and they are not the same property:
 *   linked   — prev_hash is the sha256 of the previous *line*. Editing an entry
 *              and leaving the rest alone breaks exactly one link, the next one;
 *              re-chaining the tail hides every break and moves the head. The
 *              head is worth publishing for exactly that reason, and comparing
 *              heads alone is not a check
 *   canonical— the line is exactly what re-encoding its own content produces
 *   artifact — the file it names still hashes to what it recorded
 */
export function verifyChain(ledgerText, files) {
  const lines = ledgerText.split("\n").filter((l) => l.trim());
  let prev = null;
  const rows = [];
  for (const line of lines) {
    let entry = null, parseError = null;
    try { entry = JSON.parse(line); } catch (e) { parseError = String(e); }
    const row = {
      artifact: entry?.artifact ?? null,
      state: entry?.state ?? null,
      linked: entry ? (entry.prev_hash ?? null) === prev : false,
      canonical: entry ? canonical(entry) === line : false,
      parseError,
      artifactStatus: "not embedded",
    };
    if (entry?.artifact) {
      const bytes = files[entry.artifact];
      if (bytes) {
        row.artifactStatus = sha256(bytes) === entry.sha256 ? "matches" : "CHANGED";
        row.recorded = entry.sha256;
        row.computed = sha256(bytes);
      }
    }
    rows.push(row);
    prev = hashText(line);
  }
  return { rows, head: prev, entries: lines.length };
}

/* ---- 2. content addressing ----------------------------------------------
 *
 * The directory a run lives in is the first twelve hex digits of the hash of
 * the file inside it. Nothing has to be trusted for this: hash the bytes, read
 * the name.
 */
export function verifyAddressing(files) {
  const out = [];
  for (const [path, bytes] of Object.entries(files)) {
    if (!path.endsWith("/result.json")) continue;
    const dir = path.split("/")[1];
    const suffix = dir.slice(dir.lastIndexOf("-") + 1);
    const digest = sha256(bytes);
    out.push({ path, dir, suffix, digest, ok: digest.startsWith(suffix) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/* ---- 3. readability, which integrity does not imply -----------------------
 *
 * FRICTION F8. Python's `json.dumps` emits bare `NaN` and `-Infinity`, which
 * JSON does not have. Two attested run artifacts carry them: intact, hash
 * correct, and unreadable by anything that is not Python. `JSON.parse` refuses
 * them by default, so this check is free in a browser and needed a deliberate
 * `parse_constant` on the side that produced the files.
 */
export function verifyReadable(files) {
  return Object.entries(files)
    .filter(([p]) => p.endsWith(".json"))
    .map(([path, bytes]) => {
      const text = new TextDecoder().decode(bytes);
      try { JSON.parse(text); return { path, ok: true }; }
      catch (e) {
        const m = text.match(/(-?Infinity|NaN)/);
        return { path, ok: false, why: String(e), literal: m ? m[0] : null };
      }
    })
    .sort((a, b) => Number(a.ok) - Number(b.ok) || a.path.localeCompare(b.path));
}

/* ---- 4. the gate count ---------------------------------------------------- */
export function countGates(reports) {
  const gates = new Set();
  let checks = 0, red = 0;
  for (const r of reports) {
    if (!r.gate) continue;
    gates.add(r.gate);
    checks += 1;
    if (r.passed !== true) red += 1;
  }
  return { gates: gates.size, checks, red };
}

/* ---- 5. a published claim, resolved out of an artifact -------------------- */
export function resolve(obj, path) {
  return path.reduce((o, k) => (o == null ? o : o[k]), obj);
}

export function checkClaims(claims, artifacts) {
  return claims.map((c) => {
    let actual;
    try { actual = c.get(artifacts); } catch (e) { actual = null; }
    const shown = Array.isArray(actual) ? actual.join(", ") : String(actual);
    return { ...c, actual, shown, ok: shown === c.published };
  });
}
