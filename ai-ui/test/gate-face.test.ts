import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gateFace, gateSentence, parseGateSource } from "../src/gate-face.ts";

/**
 * The property under test is a refusal, not a feature.
 *
 * `ai-flows` keeps `blockers` (ran and failed) apart from `unknown` (never ran)
 * all the way to the caller, and says in its own source that it does so **so a
 * UI can tell them apart**. Every test here is about that separation surviving
 * the trip to the surface, because a single `!v.passed` in a template would undo
 * it and nothing would look broken.
 */
const step = (state: string, source?: string, value: number | null = null) => ({
  state,
  attempts: source ? [{ state, source, value }] : [],
});

const flow = (required: string[], steps: ReturnType<typeof step>[]) => ({
  shape: "gated",
  requiredGates: required,
  steps,
});

describe("reading which gate a step reported", () => {
  it("splits the source `ai-flows` stamps", () => {
    assert.deepEqual(parseGateSource("gate.A01.max_relative_error"), {
      gate: "A01",
      metric: "max_relative_error",
    });
    assert.deepEqual(parseGateSource("gate.D02"), { gate: "D02", metric: null });
  });

  it("ignores a source that is not a gate", () => {
    // `open` flows stamp other sources, and reading one as a gate would invent
    // a verdict for a flow that declares none.
    assert.equal(parseGateSource("step.output"), null);
    assert.equal(parseGateSource("gate."), null);
  });
});

describe("a flow with nothing to freeze gets no verdict", () => {
  it("returns null for an open flow", () => {
    assert.equal(gateFace({ shape: "open", requiredGates: null, steps: [] }), null);
  });

  it("returns null for a gated flow that declares no gates", () => {
    // Rather than a face saying "may freeze". A confident verdict about a flow
    // with nothing to verify is worse than no verdict.
    assert.equal(gateFace({ shape: "gated", requiredGates: [], steps: [] }), null);
  });
});

describe("the three states a required gate can be in", () => {
  it("green everywhere means it may freeze", () => {
    const f = gateFace(flow(["A01", "A12"], [
      step("done", "gate.A01.max_relative_error", 9.28e-6),
      step("done", "gate.A12.order", 2.0015),
    ]))!;
    assert.equal(f.mayFreeze, true);
    assert.deepEqual(f.passed, ["A01", "A12"]);
    assert.deepEqual(f.blockers, []);
    assert.deepEqual(f.unknown, []);
    assert.match(gateSentence(f), /every required gate green/);
  });

  it("keeps a gate that went red apart from one that never ran", () => {
    // The load-bearing test. Both are "not passed" and they are not the same
    // thing: one has a number and a thing to fix, the other has nobody knowing
    // anything.
    const f = gateFace(flow(["A01", "A12", "C02"], [
      step("done", "gate.A01.max_relative_error", 9.28e-6),
      step("failed", "gate.A12.order", 0.9996),
    ]))!;
    assert.equal(f.mayFreeze, false);
    assert.deepEqual(f.passed, ["A01"]);
    assert.deepEqual(f.blockers, ["A12"], "the red gate is not named as a blocker");
    assert.deepEqual(f.unknown, ["C02"], "a gate with no report was merged into the red ones");

    const sentence = gateSentence(f);
    assert.match(sentence, /A12 went red/);
    assert.match(sentence, /C02 never ran/);
    assert.doesNotMatch(sentence, /\d+\/\d+/, "a fraction collapses the distinction");
  });

  it("says nothing about a gate the flow did not require", () => {
    // A step may report a gate that is not on the required list — that is extra
    // evidence, not a freeze condition, and promoting it would let a flow
    // freeze on gates nobody asked for.
    const f = gateFace(flow(["A01"], [
      step("done", "gate.A01.max_relative_error", 1e-6),
      step("failed", "gate.B99.something", 0),
    ]))!;
    assert.equal(f.mayFreeze, true);
    assert.deepEqual(f.blockers, []);
    assert.ok(f.observed.some((o) => o.gate === "B99"), "the extra report is still recorded");
  });
});

describe("the numbers survive the trip", () => {
  it("carries each gate's measurement, or null when it reported none", () => {
    const f = gateFace(flow(["A01", "A02"], [
      step("done", "gate.A01.max_relative_error", 9.28e-6),
      step("done", "gate.A02", null),
    ]))!;
    const a01 = f.observed.find((o) => o.gate === "A01")!;
    assert.equal(a01.value, 9.28e-6);
    assert.equal(a01.metric, "max_relative_error");
    const a02 = f.observed.find((o) => o.gate === "A02")!;
    assert.equal(a02.value, null, "a missing measurement became a number");
    assert.equal(a02.metric, null);
  });
});
