import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertConformant,
  formatConformance,
  runConformance,
  type EvalRunner,
  type ToolCall,
} from "../src/conformance.ts";

/** A runner with each known silent failure switchable, so the gate can be shown catching it. */
function fake(
  opts: {
    empty?: boolean;
    answerInReasoning?: boolean;
    noToolCalls?: boolean;
    garbledArgs?: boolean;
    degradesWithHistory?: boolean;
  } = {},
): EvalRunner {
  const answer = opts.empty ? "" : opts.answerInReasoning ? "" : "PONG";
  return {
    name: "fake",
    async complete() {
      return answer;
    },
    async completeWithTools() {
      if (opts.noToolCalls) return { text: "The number is 42.", calls: [] };
      const calls: ToolCall[] = [{ name: "echo_number", args: { value: opts.garbledArgs ? "<function=echo>" : 42 } }];
      return { text: "", calls };
    },
    async completeWithHistory(turns) {
      return opts.degradesWithHistory && turns.length > 4
        ? "Sure! Here is a summary of our conversation so far."
        : answer;
    },
  };
}

const at = 1_700_000_000_000;

describe("conformance gates", () => {
  it("passes a runner that behaves", async () => {
    const r = await runConformance(fake(), () => at);
    assert.equal(r.passed, true, formatConformance(r));
    assert.equal(r.checks.length, 5);
  });

  it("catches an endpoint that returns nothing", async () => {
    const r = await runConformance(fake({ empty: true }), () => at);
    assert.equal(r.passed, false);
    assert.ok(r.checks.find((c) => c.id === "answers-at-all")!.ok === false);
  });

  it("catches an answer that never reaches the field the eval reads", async () => {
    const r = await runConformance(fake({ answerInReasoning: true }), () => at);
    assert.equal(r.checks.find((c) => c.id === "content-not-displaced")!.ok, false);
  });

  it("catches the silent failure that fabricates a null interaction term", async () => {
    // The dangerous one: the model answers correctly in prose and never calls
    // the tool. Every harness condition then scores as bare, the lift vanishes,
    // and the interaction term reads as a genuine "the harness does not help".
    const r = await runConformance(fake({ noToolCalls: true }), () => at);
    assert.equal(r.passed, false);
    assert.equal(r.checks.find((c) => c.id === "emits-tool-calls")!.ok, false);
  });

  it("catches arguments that cannot be executed", async () => {
    const r = await runConformance(fake({ garbledArgs: true }), () => at);
    assert.equal(r.checks.find((c) => c.id === "tool-args-parse")!.ok, false);
  });

  it("catches degradation that only appears once history accumulates", async () => {
    const r = await runConformance(fake({ degradesWithHistory: true }), () => at);
    assert.equal(r.checks.find((c) => c.id === "survives-history")!.ok, false);
    // Single-turn checks stay green, which is exactly why this one exists.
    assert.equal(r.checks.find((c) => c.id === "answers-at-all")!.ok, true);
  });

  it("reports every failure rather than stopping at the first", async () => {
    const r = await runConformance(fake({ empty: true, noToolCalls: true }), () => at);
    assert.ok(r.checks.filter((c) => !c.ok).length >= 3);
  });

  it("survives a runner that throws, and records why", async () => {
    const broken: EvalRunner = {
      name: "broken",
      async complete() {
        throw new Error("ECONNREFUSED");
      },
      async completeWithTools() {
        throw new Error("ECONNREFUSED");
      },
      async completeWithHistory() {
        throw new Error("ECONNREFUSED");
      },
    };
    const r = await runConformance(broken, () => at);
    assert.equal(r.passed, false);
    assert.ok(r.checks.every((c) => c.detail.includes("ECONNREFUSED")));
  });
});

describe("the gate itself", () => {
  it("refuses to proceed on a failure, and says what downstream breaks", async () => {
    const r = await runConformance(fake({ noToolCalls: true }), () => at);
    assert.throws(() => assertConformant(r, { now: at }), /emits-tool-calls[\s\S]*fabricates a null interaction term/);
  });

  it("refuses a stale pass, because a local endpoint can be restarted differently", async () => {
    const r = await runConformance(fake(), () => at);
    assert.doesNotThrow(() => assertConformant(r, { now: at + 60_000 }));
    assert.throws(() => assertConformant(r, { now: at + 48 * 3_600_000 }), /re-run it/);
  });
});
