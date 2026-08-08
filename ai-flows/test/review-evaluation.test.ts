import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classify, renderReviewStudy, runReviewStudy, type ReviewScenario } from "../src/review-evaluation.ts";
import { createMemoryFlowStore } from "../src/memory-flow-store.ts";
import { createEngine } from "../src/engine.ts";
import type { CoreClient, QueuedTurn, RunState } from "../src/core-client.ts";

describe("classifying what a reviewer did", () => {
  it("names the outcome a final score cannot see", () => {
    // A right answer made wrong. Invisible in a pass rate, invisible in a flow
    // that reports `done`, and the exact thing a reviewer is added to prevent.
    assert.equal(classify(true, false), "reduced");
    assert.equal(classify(false, true), "improved");
    assert.equal(classify(true, true), "unchanged");
    assert.equal(classify(false, false), "unchanged");
  });
});

function harness(reply: (text: string, n: number) => string) {
  const store = createMemoryFlowStore();
  const runs = new Map<string, RunState>();
  let n = 0;
  const core = {
    async queueTurn(req: { text: string }): Promise<QueuedTurn> {
      n += 1;
      const runId = `run-${n}`;
      runs.set(runId, { id: runId, status: "done", result: { status: "ok", reply: reply(req.text, n) } });
      return { status: "queued", runId };
    },
    async awaitRun(id: string) {
      return runs.get(id)!;
    },
    async run(id: string) {
      return runs.get(id)!;
    },
  } as unknown as CoreClient;
  const engine = createEngine({
    store,
    core,
    turnFor: (flow, step) => ({
      surface: "t",
      actor: { externalId: "U1" },
      conversation: { kind: "dm", threadRef: `${flow.id}-${step.index}` },
      text: step.intent,
    }),
  });
  const createFlow = async (s: ReviewScenario) => {
    const flow = await store.createFlow({ actorId: "U1", scopeId: "personal:U1", title: s.id, goal: s.goal });
    await store.appendStep({ flowId: flow.id, intent: `answer: ${s.goal}` });
    await store.appendStep({ flowId: flow.id, intent: `review: ${s.goal}` });
    return flow.id;
  };
  return { store, engine, createFlow };
}

const scenario = (id: string): ReviewScenario => ({ id, goal: id, check: (p) => /RIGHT/.test(p) });

describe("measuring a reviewer", () => {
  it("sees a reviewer that repairs", async () => {
    const { store, engine, createFlow } = harness((t) => (t.startsWith("review") ? "RIGHT" : "WRONG"));
    const r = await runReviewStudy({ store, engine, scenarios: [scenario("a")], createFlow });
    assert.equal(r.improved, 1);
    assert.equal(r.beforeRate, 0);
    assert.equal(r.afterRate, 1);
  });

  it("sees a reviewer that damages — the finding a final score hides", async () => {
    const { store, engine, createFlow } = harness((t) => (t.startsWith("review") ? "WRONG" : "RIGHT"));
    const r = await runReviewStudy({ store, engine, scenarios: [scenario("a")], createFlow });
    assert.equal(r.reduced, 1);
    assert.equal(r.beforeRate, 1);
    assert.equal(r.afterRate, 0);
  });

  it("reads the STEPS, not the concatenated flow", async () => {
    /**
     * If the readings came from the whole flow's text, the producer's correct
     * answer would still be in the string after the reviewer replaced it, the
     * check would find it, and `reduced` would be unobservable by construction.
     */
    const { store, engine, createFlow } = harness((t) => (t.startsWith("review") ? "WRONG now" : "RIGHT then"));
    const r = await runReviewStudy({ store, engine, scenarios: [scenario("a")], createFlow });
    assert.equal(r.results[0]!.outcome, "reduced");
  });

  it("says so when repair was impossible before it started", async () => {
    // The producer was right on everything, so only damage could be observed —
    // and a 0% improvement rate would read as "the reviewer never helps".
    const { store, engine, createFlow } = harness(() => "RIGHT");
    const r = await runReviewStudy({ store, engine, scenarios: [scenario("a"), scenario("b")], createFlow });
    assert.ok(r.notes.some((n) => /NO HEADROOM FOR REPAIR/.test(n)));
  });

  it("says so when damage was impossible", async () => {
    const { store, engine, createFlow } = harness(() => "WRONG");
    const r = await runReviewStudy({ store, engine, scenarios: [scenario("a"), scenario("b")], createFlow });
    assert.ok(r.notes.some((n) => /NO HEADROOM FOR DAMAGE/.test(n)));
  });

  it("calls out a reviewer whose repairs and damage cancel", async () => {
    // The case the whole module exists for: the rate does not move, and a study
    // reporting only the final score calls this reviewer neutral.
    let flip = false;
    const { store, engine, createFlow } = harness((t) => {
      if (!t.startsWith("review")) {
        flip = !flip;
        return flip ? "RIGHT" : "WRONG";
      }
      return flip ? "WRONG" : "RIGHT";
    });
    const r = await runReviewStudy({ store, engine, scenarios: [scenario("a"), scenario("b")], createFlow });
    assert.equal(r.improved, 1);
    assert.equal(r.reduced, 1);
    assert.equal(r.beforeRate, r.afterRate);
    assert.ok(r.notes.some((n) => /would have called this reviewer neutral/.test(n)));
    assert.ok(renderReviewStudy(r).includes("review made a right answer wrong"));
  });

  it("counts an unreadable run instead of dropping it", async () => {
    // A study that silently discards incomplete runs reports on the subset that
    // happened to work.
    const store = createMemoryFlowStore();
    const engine = createEngine({
      store,
      core: {} as CoreClient,
      turnFor: () => ({ surface: "t", actor: { externalId: "U1" }, conversation: { kind: "dm", threadRef: "x" }, text: "" }),
    });
    const r = await runReviewStudy({
      store,
      engine,
      scenarios: [scenario("a")],
      maxAdvances: 0,
      createFlow: async (s) => {
        const f = await store.createFlow({ actorId: "U1", scopeId: "personal:U1", title: s.id, goal: s.goal });
        await store.appendStep({ flowId: f.id, intent: "one" });
        return f.id;
      },
    });
    assert.equal(r.unreadable, 1);
    assert.ok(r.notes.some((n) => /could not be read/.test(n)));
  });
});
