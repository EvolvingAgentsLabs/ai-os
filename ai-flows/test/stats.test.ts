import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calibrateCompounding,
  MIN_STEPS_PER_ITEM,
  clearsZero,
  crossingPoint,
  interactionByStratum,
  interactionTerm,
  logOdds,
  mcnemar,
  pairedMeanDiff,
  rate,
  Scale,
  undetectedErrorRate,
  type Quad,
  type StepCounts,
} from "../src/stats.ts";

/**
 * A simulator whose interaction term is known by construction, so the estimators
 * can be asked to recover a number nobody had to measure.
 *
 * Harness components add corrective log-odds, scaled by
 * `1 + substitution * (1 - capability)`. At `substitution > 0` the weaker model
 * gains more per component and the true interaction is positive; at
 * `substitution < 0` it is negative; at 0 the harness is capability-neutral and
 * the true interaction is exactly zero.
 */
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const COMPONENT_LOGITS = 3.3;

function stepLogit(capability: number, difficulty: number, harness: boolean, substitution: number): number {
  const base = 3.0 * (capability - 0.5) - 0.6 * (difficulty - 1);
  if (!harness) return base;
  return base + COMPONENT_LOGITS * (1 + substitution * (1 - capability));
}

/** True interaction in log-odds, read straight off the construction. */
function trueInteractionLogOdds(capSmall: number, capFront: number, substitution: number): number {
  return COMPONENT_LOGITS * substitution * (capFront - capSmall);
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(p: number, steps: number, r: () => number): StepCounts {
  let successes = 0;
  for (let i = 0; i < steps; i++) if (r() < p) successes++;
  return { steps, successes };
}

function suite(opts: {
  n?: number;
  capSmall: number;
  capFront: number;
  substitution: number;
  difficulty?: number | ((i: number) => number);
  steps?: number;
  seed?: number;
}): Quad[] {
  const { n = 120, capSmall, capFront, substitution, steps = 64, seed = 42 } = opts;
  const r = rng(seed);
  const diffOf = typeof opts.difficulty === "function" ? opts.difficulty : () => (opts.difficulty as number) ?? 3;
  const items: Quad[] = [];
  for (let i = 0; i < n; i++) {
    const d = diffOf(i);
    const cell = (cap: number, harness: boolean) => draw(sigmoid(stepLogit(cap, d, harness, substitution)), steps, r);
    items.push({
      id: `t${i}`,
      strata: { difficulty: `L${d}` },
      smallBare: cell(capSmall, false),
      smallHarness: cell(capSmall, true),
      frontBare: cell(capFront, false),
      frontHarness: cell(capFront, true),
    });
  }
  return items;
}

describe("log-odds with the Haldane-Anscombe correction", () => {
  it("is finite where an uncorrected logit is not", () => {
    assert.ok(Number.isFinite(logOdds({ steps: 8, successes: 0 })));
    assert.ok(Number.isFinite(logOdds({ steps: 8, successes: 8 })));
  });

  it("shrinks extremes toward the middle rather than inventing separation", () => {
    // Conservative by design: the corrected estimate is strictly less extreme
    // than the raw rate, so it understates rather than manufactures an effect.
    assert.ok(logOdds({ steps: 8, successes: 8 }) < Math.log(1 / 1e-9));
    assert.ok(logOdds({ steps: 8, successes: 0 }) > -Math.log(1 / 1e-9));
    assert.ok(logOdds({ steps: 100, successes: 100 }) > logOdds({ steps: 8, successes: 8 }));
  });

  it("is undefined for an item with no evidence, rather than defaulting to zero", () => {
    assert.ok(Number.isNaN(logOdds({ steps: 0, successes: 0 })));
    assert.ok(Number.isNaN(rate({ steps: 0, successes: 0 })));
  });
});

describe("the interaction term recovers a known construction", () => {
  const CAP_SMALL = 0.45;
  const CAP_FRONT = 0.82;

  for (const substitution of [-1, -0.5, 0.5, 1]) {
    it(`recovers the sign on log-odds at substitution=${substitution}`, () => {
      const items = suite({ capSmall: CAP_SMALL, capFront: CAP_FRONT, substitution, seed: 7 });
      const got = interactionTerm(items, Scale.LogOdds, { iters: 2000, seed: 3 });
      const expected = trueInteractionLogOdds(CAP_SMALL, CAP_FRONT, substitution);
      assert.equal(
        Math.sign(got.interaction.point),
        Math.sign(expected),
        `point ${got.interaction.point} vs true ${expected}`,
      );
      assert.ok(got.decisive, "a construction this large should clear zero");
    });
  }

  it("reports no decisive effect when the harness is capability-neutral", () => {
    const items = suite({ capSmall: CAP_SMALL, capFront: CAP_FRONT, substitution: 0, seed: 11 });
    const got = interactionTerm(items, Scale.LogOdds, { iters: 2000, seed: 3 });
    assert.equal(got.decisive, false, `expected a null result, got ${got.interaction.point}`);
  });

  it("agrees with the probability scale in the mid-range", () => {
    // Where neither arm is pinned, the two scales tell the same story. This is
    // why the GAIA result held on raw accuracy: the correction below matters at
    // the edges, not everywhere.
    const items = suite({ capSmall: 0.45, capFront: 0.55, substitution: 1, seed: 5 });
    const lo = interactionTerm(items, Scale.LogOdds, { iters: 2000, seed: 3 });
    const pr = interactionTerm(items, Scale.Probability, { iters: 2000, seed: 3 });
    assert.equal(Math.sign(lo.interaction.point), Math.sign(pr.interaction.point));
    assert.ok(lo.decisive && pr.decisive);
  });

  it("keeps the signal on log-odds where the probability scale loses it to the floor and ceiling", () => {
    // Small pinned near 0 without the harness, frontier near 1 with it: the
    // configuration a real small-vs-frontier comparison actually lands in.
    const items = suite({ capSmall: 0.05, capFront: 0.98, substitution: 1, difficulty: 4, seed: 13 });
    const lo = interactionTerm(items, Scale.LogOdds, { iters: 2000, seed: 3 });
    const pr = interactionTerm(items, Scale.Probability, { iters: 2000, seed: 3 });
    assert.ok(lo.decisive, "log-odds should still resolve a construction this large");
    assert.ok(
      Math.abs(pr.interaction.point) < Math.abs(lo.interaction.point),
      "the bounded scale must compress the effect it is measuring",
    );
  });
});

describe("the sign flips with difficulty, and that is the product boundary", () => {
  // Substitution on easy items, complementarity on hard ones — the pattern the
  // pre-registered GAIA comparison found, built here so the estimator can be
  // asked to find it.
  function flipped(): Quad[] {
    const easy = suite({ n: 90, capSmall: 0.45, capFront: 0.82, substitution: 1, difficulty: 1, seed: 21 });
    const hard = suite({ n: 90, capSmall: 0.45, capFront: 0.82, substitution: -1, difficulty: 4, seed: 22 });
    return [...easy, ...hard];
  }

  it("finds opposite signs in the two strata", () => {
    const byLevel = interactionByStratum(flipped(), "difficulty", Scale.LogOdds, { iters: 2000, seed: 3 });
    assert.ok(byLevel.get("L1")!.interaction.point > 0, "easy should show substitution");
    assert.ok(byLevel.get("L4")!.interaction.point < 0, "hard should show complementarity");
  });

  it("pooling across the flip hides it — which is why pooling is not the headline", () => {
    const pooled = interactionTerm(flipped(), Scale.LogOdds, { iters: 2000, seed: 3 });
    const byLevel = interactionByStratum(flipped(), "difficulty", Scale.LogOdds, { iters: 2000, seed: 3 });
    assert.ok(
      Math.abs(pooled.interaction.point) < Math.abs(byLevel.get("L1")!.interaction.point),
      "the pooled estimate must be smaller than the stratum it averages away",
    );
  });

  it("names the level where the fleet stops being defensible", () => {
    const byLevel = interactionByStratum(flipped(), "difficulty", Scale.LogOdds, { iters: 2000, seed: 3 });
    assert.equal(crossingPoint(byLevel, ["L1", "L4"]), "L4");
  });

  it("returns null when it never crosses, and that is a finding rather than a pass", () => {
    const allEasy = suite({ n: 90, capSmall: 0.45, capFront: 0.82, substitution: 1, difficulty: 1, seed: 21 });
    const byLevel = interactionByStratum(allEasy, "difficulty", Scale.LogOdds, { iters: 2000, seed: 3 });
    assert.equal(crossingPoint(byLevel, ["L1"]), null);
  });
});

describe("does per-step reliability predict the trajectory", () => {
  const r = rng(99);

  it("recovers r^h when steps fail independently", () => {
    const trajectories = [];
    for (const hops of [1, 2, 4, 8]) {
      for (let i = 0; i < 300; i++) {
        const p = 0.85;
        let ok = true;
        let successes = 0;
        for (let s = 0; s < hops; s++) {
          const hit = r() < p;
          if (hit) successes++;
          else ok = false;
        }
        trajectories.push({ hops, succeeded: ok, steps: { steps: hops, successes } });
      }
    }
    const cal = calibrateCompounding(trajectories);
    assert.ok(cal.meanAbsError < 0.05, `independent steps should compound cleanly, got ${cal.meanAbsError}`);
  });

  it("shows a large error when failures are correlated across steps", () => {
    // Half the trajectories are doomed from the start and fail every step; the
    // rest never fail. Per-step reliability is identical to the independent
    // case, and r^h is badly wrong — the failure mode that would break the
    // per-step programme, made visible rather than assumed away.
    const trajectories = [];
    for (const hops of [2, 4, 8]) {
      for (let i = 0; i < 300; i++) {
        const doomed = r() < 0.3;
        const successes = doomed ? 0 : hops;
        trajectories.push({ hops, succeeded: !doomed, steps: { steps: hops, successes } });
      }
    }
    const cal = calibrateCompounding(trajectories);
    assert.ok(cal.meanAbsError > 0.1, `correlated failures should be caught, got ${cal.meanAbsError}`);
  });
});

describe("how much per-item evidence the correction needs", () => {
  // The correction that makes log-odds defined at the extremes also shrinks
  // them, and it shrinks an arm near the floor by a different amount than an
  // arm near the ceiling. The two lifts are compressed unequally and the
  // difference of differences inherits the gap. Measured against a construction
  // whose true interaction is exactly zero.
  const nullSuite = (steps: number) =>
    suite({ n: 400, capSmall: 0.45, capFront: 0.82, substitution: 0, steps, seed: 7 });

  it("manufactures a positive interaction from thin evidence", () => {
    const thin = interactionTerm(nullSuite(8), Scale.LogOdds, { iters: 1500, seed: 3 });
    assert.ok(thin.decisive, "8 steps/item produces a decisive result where the truth is zero");
    assert.ok(thin.interaction.point > 0.2, `and it points the expensive way: ${thin.interaction.point}`);
    assert.equal(thin.underpowered, true, "and it must say so");
  });

  it("recovers the null once there is enough", () => {
    const enough = interactionTerm(nullSuite(MIN_STEPS_PER_ITEM), Scale.LogOdds, { iters: 1500, seed: 3 });
    assert.equal(enough.decisive, false, `expected the null back, got ${enough.interaction.point}`);
    assert.equal(enough.underpowered, false);
  });

  it("shrinks the bias monotonically as evidence grows", () => {
    const pts = [4, 8, 16, 32, 64].map((k) =>
      Math.abs(interactionTerm(nullSuite(k), Scale.LogOdds, { iters: 800, seed: 3 }).interaction.point),
    );
    for (let i = 1; i < pts.length; i++) {
      assert.ok(pts[i]! <= pts[i - 1]! + 1e-9, `bias grew from ${pts[i - 1]} to ${pts[i]}`);
    }
  });

  it("flags thin evidence even when the effect is real", () => {
    const real = suite({ n: 200, capSmall: 0.45, capFront: 0.82, substitution: 1, steps: 8, seed: 9 });
    assert.equal(interactionTerm(real, Scale.LogOdds, { iters: 800, seed: 3 }).underpowered, true);
  });
});

describe("the metrics that stay legible where success rates do not", () => {
  it("counts silent failures as a share of all attempts", () => {
    assert.equal(undetectedErrorRate(["pass", "pass", "detected", "undetected"]), 0.25);
    assert.ok(Number.isNaN(undetectedErrorRate([])));
  });

  it("compares two conditions on the same items", () => {
    const a = [true, true, false, true];
    const b = [false, true, false, false];
    const m = mcnemar(a, b);
    assert.equal(m.aOnly, 2);
    assert.equal(m.bOnly, 0);
    assert.equal(m.discordant, 2);
    assert.ok(m.p <= 1 && m.p > 0);
  });

  it("reports no evidence when the two conditions never disagree", () => {
    assert.equal(mcnemar([true, false], [true, false]).p, 1);
  });

  it("refuses unpaired input rather than silently truncating", () => {
    assert.throws(() => mcnemar([true], [true, false]));
    assert.throws(() => pairedMeanDiff([1], [1, 2]));
  });
});
