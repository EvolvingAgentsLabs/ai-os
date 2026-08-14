import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  freezeVerdict,
  isGateReport,
  nonDiscriminating,
  observationOf,
  parseReports,
  stableStringify,
  summarise,
  type GateReport,
} from "../src/gates.ts";

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const HERE = dirname(fileURLToPath(import.meta.url));
/** The cochlea project's real gate reports, produced by pytest, read from disk. */
const REPORTS_DIR = join(HERE, "..", "..", "projects", "coclea-sr", "gates", "reports");

function realReports(): GateReport[] {
  let names: string[];
  try {
    names = readdirSync(REPORTS_DIR).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  return parseReports(names.map((n) => JSON.parse(readFileSync(join(REPORTS_DIR, n), "utf8"))))
    .reports;
}

const green = (gate: string, test: string, extra: Record<string, unknown> = {}): GateReport => ({
  gate,
  test,
  spec: "2.2",
  passed: true,
  ...extra,
});
const red = (gate: string, test: string, extra: Record<string, unknown> = {}): GateReport => ({
  gate,
  test,
  spec: "5.2",
  passed: false,
  failure: "observed order 0.9996, want [1.9, 2.1]",
  ...extra,
});

describe("gate reports", () => {
  it("rejects anything without the three load-bearing fields", () => {
    assert.equal(isGateReport({ gate: "A01", test: "t", passed: true }), true);
    assert.equal(isGateReport({ gate: "A01", test: "t" }), false, "no verdict is not a report");
    assert.equal(isGateReport({ gate: "A01", passed: true }), false);
    assert.equal(isGateReport(null), false);
    assert.equal(isGateReport("A01"), false);
  });

  it("keeps what it could not parse instead of dropping it", () => {
    const { reports, rejected } = parseReports([green("A01", "a"), { gate: "A02" }, 7]);
    assert.equal(reports.length, 1);
    assert.deepEqual(rejected, [{ gate: "A02" }, 7]);
  });

  it("a gate is green only if every check under it is", () => {
    const v = summarise([green("A12", "uniform"), red("A12", "exponential")]);
    assert.equal(v.get("A12")?.passed, false);
    assert.equal(v.get("A12")?.checks, 2);
    assert.deepEqual(v.get("A12")?.failed, ["exponential"]);
  });
});

describe("the freeze verdict", () => {
  it("opens when every required gate is green", () => {
    const v = freezeVerdict(["A01", "A12"], [green("A01", "a"), green("A12", "b")]);
    assert.equal(v.mayFreeze, true);
    assert.deepEqual(v.passed, ["A01", "A12"]);
  });

  it("names the gate that went red rather than refusing without a reason", () => {
    const v = freezeVerdict(["A01", "A12"], [green("A01", "a"), red("A12", "b")]);
    assert.equal(v.mayFreeze, false);
    assert.deepEqual(v.blockers, ["A12"]);
    assert.deepEqual(v.unknown, []);
  });

  /**
   * The distinction the module exists for.
   *
   * A missing report is the shape "the verifier crashed before it got there"
   * takes, and it is indistinguishable from "nothing objected" to any check
   * that treats absence as consent. Merging them means the freeze gate opens
   * widest exactly when the suite is most broken.
   */
  it("refuses on a gate that never ran, and says so separately", () => {
    const v = freezeVerdict(["A01", "A08"], [green("A01", "a")]);
    assert.equal(v.mayFreeze, false, "a gate with no report must not be read as passed");
    assert.deepEqual(v.blockers, [], "it did not fail — it did not run");
    assert.deepEqual(v.unknown, ["A08"]);
  });

  it("an empty report set freezes nothing", () => {
    assert.equal(freezeVerdict(["A01"], []).mayFreeze, false);
    // And with nothing required, there is nothing to refuse on.
    assert.equal(freezeVerdict([], []).mayFreeze, true);
  });
});

describe("the observation a gated step produces", () => {
  it("carries a real value — the first metric in this repository that is not null", () => {
    const r = green("A01", "eigenvalues", { max_relative_error: 9.278e-6, N: 2000 });
    const obs = observationOf(r, "max_relative_error", 1000, sha);
    assert.equal(obs.value, 9.278e-6);
    assert.equal(obs.source, "gate.A01.max_relative_error");
    assert.equal(obs.at, 1000);
  });

  /**
   * `null` rather than `0`, and the difference is the whole point of the field.
   * A gate that did not report the named quantity has not measured zero of it,
   * and a coerced zero is a number nobody defined — exactly what `engine.ts`
   * declines to invent for the `open` shape.
   */
  it("returns null when the named metric is absent or not finite", () => {
    const missing = observationOf(green("A03", "zeros"), "max_relative_error", 1, sha);
    assert.equal(missing.value, null);
    const infinite = observationOf(green("A03", "z", { q: Infinity }), "q", 1, sha);
    assert.equal(infinite.value, null);
    const nan = observationOf(green("A03", "z", { q: NaN }), "q", 1, sha);
    assert.equal(nan.value, null);
  });

  it("fingerprints the whole report, so two runs agreeing on the headline still differ", () => {
    const a = observationOf(green("A01", "e", { max_relative_error: 1e-6, N: 2000 }), "max_relative_error", 1, sha);
    const b = observationOf(green("A01", "e", { max_relative_error: 1e-6, N: 4000 }), "max_relative_error", 1, sha);
    assert.equal(a.value, b.value);
    assert.notEqual(a.digest, b.digest);
  });
});

describe("stable stringify", () => {
  /**
   * The producing side hashes with `json.dumps(sort_keys=True,
   * separators=(",", ":"))`. This is the same rule, and the two implementations
   * share no code — which is the only way two languages can agree on what a
   * report *is*.
   */
  it("is insensitive to key order", () => {
    assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
    assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
  });

  it("recurses through arrays and nested objects", () => {
    assert.equal(stableStringify({ z: [{ b: 1, a: 2 }] }), '{"z":[{"a":2,"b":1}]}');
  });

  /**
   * The mismatch this module now documents, pinned so it cannot be forgotten
   * and quietly relied on again.
   *
   * Python renders `9.278e-6` as `9.278e-06`; JavaScript renders it as
   * `0.000009278`. Same value, different bytes, because the two runtimes switch
   * to exponent notation at different magnitudes -- `1e-5` and `1e-7`. Gate
   * measurements live in exactly that band.
   */
  it("does NOT agree with Python's float formatting, which is why digests use raw bytes", () => {
    const js = stableStringify({ gate: "A01", passed: true, max_relative_error: 9.278e-6 });
    assert.equal(js, '{"gate":"A01","max_relative_error":0.000009278,"passed":true}');
    assert.notEqual(
      js,
      '{"gate":"A01","max_relative_error":9.278e-06,"passed":true}',
      "if these ever agree, the note in gates.ts about raw bytes can be revisited",
    );
  });

  it("hashes the original bytes when they are given, so both sides agree", () => {
    const raw = '{"gate":"A01","max_relative_error":9.278e-06,"passed":true,"spec":"2.2","test":"e"}';
    const report = JSON.parse(raw) as GateReport;
    const obs = observationOf(report, "max_relative_error", 0, sha, raw);
    assert.equal(obs.digest, sha(raw));
    assert.notEqual(obs.digest, sha(stableStringify(report)), "the whole point of rawSource");
  });
});

describe("which gates carry weight", () => {
  /**
   * The cochlea solver keeps a deliberate boundary-mass defect precisely so this
   * question has an answer. A02, A03 and A11 pass a solver that is wrong in
   * every eigenvalue; A12 does not.
   */
  it("reports the gates a known-wrong artefact walked past", () => {
    const defectRun = [
      green("A02", "orthogonality"),
      green("A03", "oscillation"),
      green("A11", "symmetry"),
      red("A12", "convergence"),
    ];
    assert.deepEqual(nonDiscriminating(defectRun, ["A02", "A03", "A11", "A12"]), [
      "A02",
      "A03",
      "A11",
    ]);
  });
});

describe("against the cochlea project's own reports", () => {
  /**
   * Not a fixture. These files are written by `pytest` in
   * `projects/coclea-sr/gates/`, in Python, and read here in TypeScript with
   * nothing shared but the JSON. If the format drifts on either side, this
   * fails — which is the only thing keeping the seam honest.
   *
   * Skipped rather than failed when the reports are absent: the Python suite is
   * not a dependency of this package, and a TypeScript test that cannot run
   * without a Python environment would be a test nobody keeps green.
   */
  it("parses every report the Python suite produced", (t) => {
    const reports = realReports();
    if (!reports.length) return t.skip("no gate reports on disk; run the coclea-sr suite first");

    const verdicts = summarise(reports);
    assert.ok(verdicts.size >= 8, `expected the A-gates, saw ${[...verdicts.keys()].join(",")}`);
    for (const gate of ["A01", "A02", "A03", "A04", "A07", "A08", "A11", "A12"]) {
      assert.ok(verdicts.has(gate), `${gate} has no report`);
    }
  });

  it("the passive layer's required gates authorise a freeze", (t) => {
    const reports = realReports();
    if (!reports.length) return t.skip("no gate reports on disk");

    const v = freezeVerdict(["A01", "A02", "A03", "A04", "A07", "A08", "A11", "A12"], reports);
    assert.deepEqual(v.blockers, [], "a required gate is red");
    assert.deepEqual(v.unknown, [], "a required gate never ran");
    assert.equal(v.mayFreeze, true);
  });

  it("reads a real metric out of GATE-A01", (t) => {
    const reports = realReports();
    const a01 = reports.find((r) => r.gate === "A01" && "max_relative_error" in r);
    if (!a01) return t.skip("no A01 report on disk");

    const obs = observationOf(a01, "max_relative_error", 0, sha);
    assert.equal(typeof obs.value, "number");
    assert.ok((obs.value as number) < 1e-4, "GATE-A01's own tolerance");
    assert.ok((obs.value as number) > 0, "a relative error of exactly zero would be a bug");
  });
});
