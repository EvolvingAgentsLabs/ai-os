import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { COCHLEA_NUMBERS, analyticOmega, cochleaAgents, cochleaFlows } from "../src/cochlea-demo.ts";

/**
 * The anti-drift test.
 *
 * `src/cochlea-demo.ts` computes eigenvalues in TypeScript, by Sturm bisection,
 * with no dependencies. `projects/coclea-sr/` computes them in Python, through
 * LAPACK, against closed forms derived in sympy and mpmath. The two share no
 * code and no library, and the whole point of the demo scope is that they agree.
 *
 * If they ever stop agreeing, one of them is wrong and this is what says so.
 * Without it, the demo would keep rendering plausible numbers about a project it
 * no longer describes — which is the failure `build-demo.ts` was written to
 * prevent for the desk and this file prevents for its contents.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPORTS = join(HERE, "..", "..", "projects", "coclea-sr", "gates", "reports");

function reports(): Array<Record<string, unknown>> {
  try {
    return readdirSync(REPORTS)
      .filter((n) => n.endsWith(".json"))
      .map((n) => JSON.parse(readFileSync(join(REPORTS, n), "utf8")));
  } catch {
    return [];
  }
}

const find = (pred: (r: Record<string, unknown>) => boolean) => reports().find(pred);

describe("the cochlea scope's numbers", () => {
  it("reproduces the closed form it is checked against", () => {
    assert.ok(Math.abs(analyticOmega(1) - Math.PI / 2) < 1e-15);
    // Only odd quarter-wave harmonics exist on a fixed-free string.
    assert.deepEqual([1, 2, 3].map((n) => analyticOmega(n) / analyticOmega(1)), [1, 3, 5]);
  });

  it("the flux chain converges at second order and the defect at first", () => {
    const { flux, defect } = COCHLEA_NUMBERS;
    assert.ok(flux.order > 1.9 && flux.order < 2.1, `flux order ${flux.order}`);
    assert.ok(defect.order > 0.9 && defect.order < 1.1, `defect order ${defect.order}`);
  });

  /**
   * The defect exists to prove the gate can fail. If it ever passes GATE-A12's
   * band, the gate has stopped measuring and the scope's whole argument goes
   * with it.
   */
  it("the defect is not accepted by the band that accepts the flux chain", () => {
    const { defect } = COCHLEA_NUMBERS;
    assert.ok(!(defect.order >= 1.9 && defect.order <= 2.1));
  });

  /**
   * Three gates cannot see this defect, and the scope claims so out loud. If one
   * of them started catching it, the claim would be false and the flows would be
   * telling the reader something untrue.
   */
  it("stays symmetric, ordered and mass-positive while being wrong", () => {
    const { flux, defect } = COCHLEA_NUMBERS;
    assert.equal(defect.symmetryDefect, flux.symmetryDefect, "GATE-A11 cannot separate them");
    assert.deepEqual(defect.interiorZeros, flux.interiorZeros, "GATE-A03 cannot separate them");
    // And the naive mass check prefers the broken one, which is the detail worth
    // keeping: it sums to exactly the continuum value.
    assert.ok(Math.abs(defect.totalMass - 1) < 1e-12);
    assert.ok(Math.abs(flux.totalMass - 1) > 1e-6);
  });
});

describe("agreement with the Python suite", () => {
  it("GATE-A01's metric matches to four significant figures", (t) => {
    const a01 = find((r) => r["gate"] === "A01" && "max_relative_error" in r);
    if (!a01) return t.skip("no A01 report; run the coclea-sr suite first");

    const python = a01["max_relative_error"] as number;
    const ts = COCHLEA_NUMBERS.flux.maxRelativeError;
    const rel = Math.abs(ts - python) / python;
    assert.ok(
      rel < 1e-4,
      `TypeScript ${ts.toExponential(6)} vs Python ${python.toExponential(6)} (rel ${rel.toExponential(2)})`,
    );
  });

  it("GATE-A12's order for the deliberate defect matches", (t) => {
    const a12 = find(
      (r) => r["gate"] === "A12" && r["scheme"] === "lumped-full-cell",
    );
    if (!a12) return t.skip("no A12 defect report");

    const python = a12["observed_order"] as number;
    const ts = COCHLEA_NUMBERS.defect.order;
    assert.ok(
      Math.abs(ts - python) < 1e-3,
      `TypeScript ${ts.toFixed(6)} vs Python ${python.toFixed(6)}`,
    );
  });

  it("the defect's error curve matches grid for grid", (t) => {
    const a12 = find((r) => r["gate"] === "A12" && r["scheme"] === "lumped-full-cell");
    if (!a12) return t.skip("no A12 defect report");

    const python = a12["relative_errors"] as number[];
    const ts = COCHLEA_NUMBERS.defect.convergence;
    assert.equal(ts.length, python.length);
    ts.forEach((v, i) => {
      const rel = Math.abs(v - python[i]!) / python[i]!;
      assert.ok(rel < 1e-3, `grid ${i}: ${v.toExponential(4)} vs ${python[i]!.toExponential(4)}`);
    });
  });

  /**
   * Both implementations independently found the same grid contaminated by their
   * own precision floor. That agreement is worth asserting: it is the reason the
   * contamination was believable rather than a quirk of one library.
   */
  it("both implementations drop the same grid at the precision floor", (t) => {
    const a12 = find(
      (r) => r["gate"] === "A12" && r["case"] === "uniform" && r["mode"] === 1,
    );
    if (!a12) return t.skip("no A12 uniform mode-1 report");

    assert.deepEqual(
      COCHLEA_NUMBERS.flux.droppedGrids,
      a12["grids_dropped_at_precision_floor"],
    );
  });
});

describe("the scope as the desk will render it", () => {
  it("two flows, one frozen and one blocked, with the same agents", () => {
    const flows = cochleaFlows(1_700_000_000_000);
    assert.equal(flows.length, 2);
    const states = flows.map((f) => f["state"]);
    assert.deepEqual(states.sort(), ["blocked", "done"]);

    const agentsOf = (f: (typeof flows)[number]) =>
      (f["steps"] as Array<{ agent: string }>).map((s) => s.agent);
    assert.deepEqual(agentsOf(flows[0]!), agentsOf(flows[1]!), "the argument needs identical rosters");
  });

  /**
   * Measured rather than assumed, and the first version of this test asserted
   * the wrong shape. GATE-A01 catches the defect too — 2.592e-4 against its own
   * 1.0e-4 tolerance — so the flow is green for three steps, goes red at A01,
   * runs the convergence sweep *because* A01 went red, and goes red again at
   * A12 with the localisation. Two gates, saying different things.
   */
  it("the blocked flow is green until the first gate, and red again at the one that localises", () => {
    const blocked = cochleaFlows(0).find((f) => f["state"] === "blocked")!;
    const steps = blocked["steps"] as Array<{ state: string }>;
    assert.deepEqual(
      steps.map((s) => s.state),
      ["done", "done", "done", "failed", "done", "failed"],
    );

    const clean = cochleaFlows(0).find((f) => f["state"] === "done")!;
    assert.deepEqual(
      (clean["steps"] as Array<{ state: string }>).map((s) => s.state),
      ["done", "done", "done", "done", "done", "done"],
      "the correct chain must be green everywhere, or the comparison says nothing",
    );
  });

  it("declares an agent with no file behind it, like the other scopes", () => {
    const missing = cochleaAgents().filter((a) => a.missing);
    assert.equal(missing.length, 1);
    assert.equal(missing[0]!.name, "HOPF-LAYER");
  });

  it("every agent the flows delegate to is declared", () => {
    const declared = new Set(cochleaAgents().map((a) => a.name));
    for (const flow of cochleaFlows(0)) {
      for (const step of flow["steps"] as Array<{ agent: string }>) {
        assert.ok(declared.has(step.agent), `${step.agent} is used and not declared`);
      }
    }
  });
});
