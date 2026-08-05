import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANSWER_PROTOCOL,
  ellipticK,
  errorReduction,
  exponentialGrowth,
  fallInVacuum,
  fallWithDrag,
  grade,
  levelCounts,
  logistic,
  newtonianKE,
  pendulumPeriod,
  pendulumPeriodSmallAngle,
  physicsSuite,
  relativisticKE,
  type PhysicsTask,
} from "../src/tasks/physics.ts";

const close = (a: number, b: number, rel = 1e-9) => assert.ok(Math.abs(a - b) / Math.abs(b) < rel, `${a} !== ${b}`);

describe("the oracles, against published values", () => {
  // If these drift, every evaluation built on them is wrong, so they are checked
  // against numbers from outside this repository rather than against themselves.
  it("K(0) = pi/2 and K(1/2) = 1.8540747", () => {
    close(ellipticK(0), Math.PI / 2);
    close(ellipticK(0.5), 1.854074677301372, 1e-12);
  });

  it("a pendulum at 90 degrees runs 18.03% slow, the standard result", () => {
    const ratio = pendulumPeriod(1, Math.PI / 2) / pendulumPeriodSmallAngle(1);
    close(ratio, 1.180340599, 1e-9);
  });

  it("and at small amplitude the exact and approximate models agree", () => {
    const ratio = pendulumPeriod(1, (1 * Math.PI) / 180) / pendulumPeriodSmallAngle(1);
    assert.ok(Math.abs(ratio - 1) < 2e-5, `${ratio}`);
  });

  it("relativistic kinetic energy at gamma = 2 is exactly c squared", () => {
    const c = 299_792_458;
    close(relativisticKE(Math.sqrt(0.75) * c), c ** 2, 1e-9);
  });

  it("and Newton is its leading term at low speed", () => {
    const v = 1000;
    assert.ok(Math.abs(relativisticKE(v) - newtonianKE(v)) / newtonianKE(v) < 1e-10);
  });

  it("logistic growth saturates at the carrying capacity", () => {
    close(logistic(10, 0.5, 1000, 1e6), 1000, 1e-9);
  });

  it("and matches exponential growth while the population is small", () => {
    const a = logistic(1, 0.5, 1e9, 2);
    const b = exponentialGrowth(1, 0.5, 2);
    assert.ok(Math.abs(a - b) / b < 1e-8, `${a} vs ${b}`);
  });

  it("drag-free fall is the infinite-terminal-velocity limit of falling with drag", () => {
    close(fallWithDrag(1e9, 3), fallInVacuum(3), 1e-6);
  });

  it("and drag always leaves the body higher than a vacuum would", () => {
    assert.ok(fallWithDrag(20, 8) < fallInVacuum(8));
  });
});

describe("difficulty is derived, not asserted", () => {
  const suite = physicsSuite({ seed: 3 });

  it("labels a task L1 exactly when the first approximation already clears the tolerance", () => {
    for (const t of suite) {
      const clears = t.approximationError <= t.tolerance;
      assert.equal(t.level === "L1", clears, `${t.id}: err=${t.approximationError} tol=${t.tolerance}`);
    }
  });

  it("produces all three levels, so the sweep has something to stratify", () => {
    const counts = levelCounts(suite);
    assert.ok(counts.L1 > 0 && counts.L2 > 0 && counts.L3 > 0, JSON.stringify(counts));
  });

  it("moves one physical question up the ladder by tightening tolerance alone", () => {
    // Same system, same parameters, same phrasing — only the required precision
    // changes. That is the confound most difficulty stratifications cannot rule
    // out, ruled out by construction.
    const byPrompt = new Map<string, PhysicsTask[]>();
    for (const t of suite) {
      const stem = t.prompt.split(", accurate to")[0]!;
      (byPrompt.get(stem) ?? byPrompt.set(stem, []).get(stem)!).push(t);
    }
    const laddered = [...byPrompt.values()].filter((g) => new Set(g.map((t) => t.level)).size > 1);
    assert.ok(laddered.length > 0, "no single system spanned more than one level");
  });

  it("never gets easier as the tolerance tightens", () => {
    const rank = { L1: 0, L2: 1, L3: 2 } as const;
    const byStem = new Map<string, PhysicsTask[]>();
    for (const t of suite) {
      const stem = t.prompt.split(", accurate to")[0]!;
      (byStem.get(stem) ?? byStem.set(stem, []).get(stem)!).push(t);
    }
    for (const group of byStem.values()) {
      const sorted = [...group].sort((a, b) => b.tolerance - a.tolerance);
      for (let i = 1; i < sorted.length; i++) {
        assert.ok(rank[sorted[i]!.level] >= rank[sorted[i - 1]!.level], `${sorted[i]!.id} got easier`);
      }
    }
  });

  it("randomises parameters so the answer must be computed rather than recalled", () => {
    const a = physicsSuite({ seed: 1 });
    const b = physicsSuite({ seed: 2 });
    assert.notEqual(a[0]!.answer, b[0]!.answer);
  });

  it("carries the answer protocol on every prompt", () => {
    assert.ok(suite.every((t) => t.prompt.includes(ANSWER_PROTOCOL)));
  });
});

describe("grading separates wrong from wrong-and-said-so", () => {
  const t = physicsSuite({ seed: 5 }).find((x) => x.level === "L3")!;

  it("passes an answer inside tolerance", () => {
    const near = t.answer * (1 + t.tolerance / 2);
    assert.equal(grade(t, `${near}`).outcome, "pass");
  });

  it("calls a confidently wrong number an undetected error", () => {
    // The liability: no hedge, no flag, just a number that is not the answer.
    assert.equal(grade(t, `${t.answer * 2}`).outcome, "undetected");
  });

  it("calls an abstention a detected error, not an undetected one", () => {
    assert.equal(grade(t, "UNSURE").outcome, "detected");
    assert.equal(grade(t, "  unsure  ").outcome, "detected");
  });

  it("treats an unparseable reply as detected rather than guessing at it", () => {
    assert.equal(grade(t, "it depends on the drag regime").outcome, "detected");
  });

  it("reads scientific notation and thousands separators", () => {
    assert.equal(grade(t, `${t.answer.toExponential(9)}`).outcome, "pass");
    const withCommas = t.answer.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    assert.ok(grade(t, withCommas).relativeError! < 1e-3);
  });

  it("scores the first approximation as a failure at L3, which is the point of L3", () => {
    const g = grade(t, `${t.approximation}`);
    assert.equal(g.outcome, "undetected");
    assert.equal(errorReduction(t, g.relativeError), 0, "reproducing the linear model reduces nothing");
  });
});

describe("how much less wrong", () => {
  const t = physicsSuite({ seed: 5 }).find((x) => x.level === "L3")!;

  it("is 1 for an exact answer and 0 for the linear one", () => {
    assert.equal(errorReduction(t, 0), 1);
    assert.equal(errorReduction(t, t.approximationError), 0);
  });

  it("goes negative when a model does worse than not modelling the nonlinearity", () => {
    assert.ok(errorReduction(t, t.approximationError * 3)! < 0);
  });

  it("is undefined when there is no answer to compare", () => {
    assert.equal(errorReduction(t, null), null);
  });
});
