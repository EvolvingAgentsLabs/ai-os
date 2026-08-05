import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  channelCapacity,
  detectionProbability,
  digestOf,
  divergenceRate,
  observabilityOf,
  quadrantOf,
} from "../src/observability.ts";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);

describe("the noise floor", () => {
  it("is zero when repeated identical work repeats its fingerprint", () => {
    near(divergenceRate([["a", "a", "a"]]), 0);
  });

  it("is one when every repeat of identical work looks different", () => {
    near(divergenceRate([["a", "b", "c"]]), 1);
  });

  it("pools pairs across groups rather than averaging the groups", () => {
    // Group 1 contributes 3 pairs, all equal; group 2 contributes 1 pair, differing.
    near(
      divergenceRate([
        ["a", "a", "a"],
        ["b", "c"],
      ]),
      1 / 4,
    );
  });

  it("is undefined rather than zero when no pair was ever observed", () => {
    assert.ok(Number.isNaN(divergenceRate([["a"], []])));
  });
});

describe("what the instrument can carry", () => {
  it("carries one bit when it never lies and none when it always does", () => {
    near(channelCapacity(0), 1);
    near(channelCapacity(1), 0);
  });

  it("still carries a third of a bit at a coin-flip false-change rate", () => {
    // log2(1.25) — the Z-channel is asymmetric, so 0.5 is not the dead point a
    // symmetric channel would have there. Equality still proves something.
    near(channelCapacity(0.5), Math.log2(1.25), 1e-12);
  });

  it("decreases monotonically as the false-change rate grows", () => {
    // Integer steps: accumulating 0.05 in a float overshoots 1 and lands
    // outside the domain, where capacity is NaN rather than small.
    for (let i = 0; i < 100; i++) {
      assert.ok(channelCapacity(i / 100) >= channelCapacity((i + 1) / 100) - 1e-12);
    }
  });

  it("is undefined outside [0,1] rather than silently extrapolating", () => {
    assert.ok(Number.isNaN(channelCapacity(-0.01)));
    assert.ok(Number.isNaN(channelCapacity(1.01)));
  });

  it("catches a stuck flow less and less often as noise grows", () => {
    near(detectionProbability(0, 3), 1);
    near(detectionProbability(0.2, 3), 0.512);
    assert.ok(detectionProbability(0.8, 3) < 0.01);
  });
});

describe("reading a flow", () => {
  const clean = { floor: 0.1 };

  it("reports insufficient rather than guessing from too little evidence", () => {
    const o = observabilityOf(["a", "b"], clean);
    assert.equal(o.verdict, "insufficient");
    assert.equal(o.observable, false);
  });

  it("calls a repeating fingerprint drift, and says where the repeat began", () => {
    const o = observabilityOf(["x", "a", "a", "a", "a"], clean);
    assert.equal(o.verdict, "drift");
    assert.equal(o.observable, true);
    assert.equal(o.sinceIndex, 1);
  });

  it("calls a moving fingerprint progressing when a stuck flow would have been caught", () => {
    const o = observabilityOf(["a", "b", "c"], clean);
    assert.equal(o.verdict, "progressing");
    assert.equal(o.observable, true);
  });

  it("refuses to call anything progressing once noise hides stuck flows", () => {
    // At δ=0.8 a genuinely stuck flow repeats three fingerprints 0.8% of the
    // time. "Progressing" here would be an assertion the instrument cannot make.
    const o = observabilityOf(["a", "b", "c"], { floor: 0.8 });
    assert.equal(o.verdict, "unreadable");
    assert.equal(o.observable, false);
  });

  it("still trusts a repeat under a noisy instrument, because noise only manufactures difference", () => {
    const o = observabilityOf(["a", "a", "a"], { floor: 0.8 });
    assert.equal(o.verdict, "drift");
    assert.equal(o.observable, true);
  });

  it("always reports the floor and detection alongside the verdict", () => {
    const o = observabilityOf(["a", "b", "c"], { floor: 0.25, window: 4 });
    assert.equal(o.verdict, "insufficient");
    assert.equal(o.floor, 0.25);
    near(o.detection, Math.pow(0.75, 4));
  });
});

describe("who has to act", () => {
  const readable = observabilityOf(["a", "b", "c"], { floor: 0.1 });
  const blind = observabilityOf(["a", "b", "c"], { floor: 0.9 });

  it("leaves a readable, steerable flow alone", () => {
    assert.equal(quadrantOf(readable, { inputs: ["steer", "abort"] }), "autonomous");
  });

  it("escalates when the problem is visible and no input reaches it", () => {
    assert.equal(quadrantOf(readable, { inputs: [] }), "escalate");
  });

  it("asks for instrumentation, not more steps, when it is steerable but unreadable", () => {
    assert.equal(quadrantOf(blind, { inputs: ["steer"] }), "instrument");
  });

  it("abandons when neither half is available", () => {
    assert.equal(quadrantOf(blind, { inputs: [] }), "abandon");
  });
});

describe("the fingerprint helper", () => {
  it("is stable and short", () => {
    assert.equal(digestOf("same"), digestOf("same"));
    assert.equal(digestOf("same").length, 16);
    assert.notEqual(digestOf("same"), digestOf("different"));
  });

  it("ignores the backticks that drove measured δ to 53.6% on raw text", () => {
    // Verbatim from the probe: the model answered `src/types.ts` three times and
    // src/types.ts five times, and nothing about the state differed.
    assert.equal(digestOf("`src/types.ts`"), digestOf("src/types.ts"));
  });

  it("ignores casing, spacing and trailing punctuation", () => {
    assert.equal(digestOf("Done: src/types.ts."), digestOf("done   src/types.ts"));
    assert.equal(digestOf("  YES  "), digestOf("yes"));
  });

  it("still separates states that genuinely differ", () => {
    assert.notEqual(digestOf("src/types.ts"), digestOf("src/flow-store.ts"));
    assert.notEqual(digestOf("YES"), digestOf("NO"));
  });
});
