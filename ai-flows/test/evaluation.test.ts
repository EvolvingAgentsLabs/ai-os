import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type Scenario, evaluate, producedText, renderEvaluation } from "../src/evaluation.ts";
import { createMemoryFlowStore } from "../src/memory-flow-store.ts";
import { createEngine } from "../src/engine.ts";
import type { CoreClient, QueuedTurn, RunState } from "../src/core-client.ts";

/** A core whose reply is a function of the step text, so a configuration's shape changes its output. */
function scriptedCore(reply: (text: string) => string): CoreClient {
  const runs = new Map<string, RunState>();
  let n = 0;
  return {
    async queueTurn(req: { text: string }): Promise<QueuedTurn> {
      n += 1;
      const runId = `run-${n}`;
      runs.set(runId, { id: runId, status: "done", result: { status: "ok", reply: reply(req.text) } });
      return { status: "queued", runId };
    },
    async awaitRun(runId: string) {
      return runs.get(runId)!;
    },
    async run(runId: string) {
      return runs.get(runId)!;
    },
  } as unknown as CoreClient;
}

const SCENARIOS: Scenario[] = [
  {
    id: "names-the-column",
    goal: "propose adding a currency column",
    check: (produced) => ({
      passed: /currency/i.test(produced),
      detail: /currency/i.test(produced) ? "named the column" : "never named the column",
    }),
  },
  {
    id: "names-the-table",
    goal: "propose adding a currency column to ledger",
    check: (produced) => ({
      passed: /ledger/i.test(produced),
      detail: /ledger/i.test(produced) ? "named the table" : "never named the table",
    }),
  },
];

function harness(reply: (text: string) => string) {
  const store = createMemoryFlowStore();
  const engine = createEngine({
    store,
    core: scriptedCore(reply),
    turnFor: (flow, step) => ({
      surface: "eval",
      actor: { externalId: "U1" },
      conversation: { kind: "dm", threadRef: `${flow.id}-${step.index}` },
      text: step.intent,
    }),
  });
  const config = (id: string, steps: (s: Scenario) => string[]) => ({
    id,
    async createFlow(scenario: Scenario) {
      const flow = await store.createFlow({
        actorId: "U1",
        scopeId: "personal:U1",
        title: scenario.id,
        goal: scenario.goal,
      });
      for (const intent of steps(scenario)) await store.appendStep({ flowId: flow.id, intent });
      return flow.id;
    },
  });
  return { store, engine, config };
}

describe("comparing two arrangements of agents", () => {
  it("scores each configuration on the same scenarios", async () => {
    // The reply echoes the step text, so a configuration that mentions the table
    // in its steps produces work that names it, and one that does not, does not.
    const { store, engine, config } = harness((t) => `worked on: ${t}`);
    const report = await evaluate({
      store,
      engine,
      scenarios: SCENARIOS,
      configurations: [
        config("mentions-both", (s) => [`${s.goal} — the currency column on the ledger table`]),
        config("mentions-neither", () => ["do something vague"]),
      ],
    });
    const rates = Object.fromEntries(report.byConfiguration.map((c) => [c.configurationId, c.rate]));
    assert.equal(rates["mentions-both"], 1);
    assert.equal(rates["mentions-neither"], 0);
  });

  it("gives every configuration the identical scenario", async () => {
    // A comparison in which the arms saw different work is not a comparison.
    const seen: string[] = [];
    const { store, engine, config } = harness((t) => {
      seen.push(t);
      return t;
    });
    await evaluate({
      store,
      engine,
      scenarios: [SCENARIOS[0]!],
      configurations: [config("a", (s) => [s.goal]), config("b", (s) => [s.goal])],
    });
    assert.equal(seen.length, 2);
    assert.equal(seen[0], seen[1]);
  });

  it("counts a configuration that cannot build a flow as failing, not as absent", async () => {
    // Dropping it would let a broken arrangement score 100% on the scenarios it
    // managed to attempt.
    const { store, engine, config } = harness((t) => t);
    const report = await evaluate({
      store,
      engine,
      scenarios: SCENARIOS,
      configurations: [config("ok", (s) => [s.goal]), { id: "broken", createFlow: async () => null }],
    });
    const broken = report.byConfiguration.find((c) => c.configurationId === "broken")!;
    assert.equal(broken.rate, 0);
    assert.equal(broken.errored, 2);
    assert.ok(report.notes.some((n) => /errored/.test(n)));
  });
});

describe("what the report refuses to let you conclude", () => {
  it("says a two-scenario difference is not evidence", async () => {
    const { store, engine, config } = harness((t) => t);
    const report = await evaluate({
      store,
      engine,
      scenarios: SCENARIOS,
      configurations: [config("a", (s) => [s.goal]), config("b", (s) => [s.goal])],
    });
    assert.ok(report.notes.some((n) => /not evidence/.test(n)));
    assert.ok(renderEvaluation(report).includes("read this before quoting the numbers"));
  });

  it("says a single configuration is a pass rate, not a comparison", async () => {
    const { store, engine, config } = harness((t) => t);
    const report = await evaluate({
      store,
      engine,
      scenarios: SCENARIOS,
      configurations: [config("only", (s) => [s.goal])],
    });
    assert.ok(report.notes.some((n) => /not a comparison/.test(n)));
  });
});

describe("the ceiling", () => {
  it("refuses to call a tie at 100% a comparison", async () => {
    // The wall this repository has hit four times: every arm the same, at the top
    // of the range, reading as "no difference" when it means "no room".
    const { store, engine, config } = harness(() => "currency ledger");
    const report = await evaluate({
      store,
      engine,
      scenarios: SCENARIOS,
      configurations: [config("a", (s) => [s.goal]), config("b", (s) => [s.goal, "and again"])],
    });
    assert.equal(report.verdict, "no-headroom");
    assert.ok(report.notes[0]!.startsWith("NO HEADROOM"));
  });

  it("calls a tie at 0% the same thing — a floor is a ceiling upside down", async () => {
    const { store, engine, config } = harness(() => "nothing relevant at all");
    const report = await evaluate({
      store,
      engine,
      scenarios: SCENARIOS,
      configurations: [config("a", (s) => [s.goal]), config("b", (s) => [s.goal])],
    });
    assert.equal(report.verdict, "no-headroom");
  });

  it("calls it comparable once one configuration fails something the other does not", async () => {
    const { store, engine, config } = harness((t) => (t.includes("ledger") ? "currency ledger" : "vague"));
    const report = await evaluate({
      store,
      engine,
      scenarios: SCENARIOS,
      configurations: [config("names-it", (s) => [`${s.goal} ledger`]), config("vague", () => ["do something"])],
    });
    assert.equal(report.verdict, "comparable");
  });
});

describe("what a check is given", () => {
  it("sees every settled step's result, in order", () => {
    const flow = {
      steps: [
        { index: 1, state: "done", result: "second" },
        { index: 0, state: "done", result: "first" },
        { index: 2, state: "failed", result: null },
      ],
    } as never;
    assert.equal(producedText(flow), "first\n\nsecond");
  });
});
