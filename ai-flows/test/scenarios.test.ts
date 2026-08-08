import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NUMERIC_SCENARIOS, statesNumber } from "../src/scenarios.ts";

describe("stating a number", () => {
  it("accepts the answer on its own and inside a sentence", () => {
    assert.ok(statesNumber("24", "24"));
    assert.ok(statesNumber("The factorial ends with 24 trailing zeros.", "24"));
  });

  it("accepts a thousands separator, because models write them", () => {
    assert.ok(statesNumber("2,971,215,073", "2971215073"));
    assert.ok(statesNumber("2_971_215_073", "2971215073"));
  });

  it("does not accept the answer buried inside a longer number", () => {
    // Substring matching turns a wrong answer containing the right digits into a
    // pass, which is the leniency that makes a benchmark flattering.
    assert.ok(!statesNumber("1024", "24"));
    assert.ok(!statesNumber("The result was 248.", "24"));
    assert.ok(!statesNumber("3.24", "24"));
  });

  it("does not accept it as part of a word", () => {
    assert.ok(!statesNumber("version24alpha", "24"));
  });
});

describe("the set itself", () => {
  it("has unique ids", () => {
    const ids = NUMERIC_SCENARIOS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("states why each one is expected to be hard, so an easy one is visible", () => {
    // A scenario nobody can say is hard is a scenario that will quietly sit at
    // the ceiling and drag the whole set there with it.
    for (const s of NUMERIC_SCENARIOS) {
      assert.ok(s.why.length > 10, `${s.id} has no stated reason`);
      assert.ok(/^\d+$/.test(s.expect) || /^[01]+$/.test(s.expect), `${s.id} expects a non-numeric answer`);
    }
  });

  it("is large enough that one scenario is not worth a tenth of the rate", () => {
    assert.ok(NUMERIC_SCENARIOS.length >= 10, `only ${NUMERIC_SCENARIOS.length} scenarios`);
  });
});
