import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CoreClient, QueuedTurn, RunState } from "../src/core-client.ts";
import { createEngine } from "../src/engine.ts";
import { createMemoryFlowStore } from "../src/memory-flow-store.ts";
import type { FlowStore } from "../src/flow-store.ts";

/**
 * A core whose runs settle when the test says so, so the window between "queued"
 * and "terminal" — the window a restart lands in — is directly addressable.
 */
function fakeCore(mode: "pending" | "ok" | "fail" = "ok") {
  const runs = new Map<string, RunState>();
  const queued: string[] = [];
  const state = { mode };
  let n = 0;
  // The real shape: two statuses at two levels, reply on the inner one.
  const terminal = (runId: string): RunState =>
    state.mode === "ok"
      ? { id: runId, status: "done", result: { status: "ok", reply: `reply for ${runId}` } }
      : { id: runId, status: "done", result: { status: "failed", reason: `failure for ${runId}` } };
  const core = {
    async queueTurn(): Promise<QueuedTurn> {
      n += 1;
      const runId = `run-${n}`;
      runs.set(runId, state.mode === "pending" ? { id: runId, status: "running" } : terminal(runId));
      queued.push(runId);
      return { status: "queued", runId, sessionId: `sess-${n}` };
    },
    async turn(): Promise<QueuedTurn> {
      throw new Error("not used");
    },
    async run(runId: string): Promise<RunState> {
      return runs.get(runId) ?? { status: "unknown" };
    },
    async signal() {
      return {};
    },
    /** Never blocks: a run still `running` reads as a timeout, which is what a
     * caller that walked away would see. The tests drive settlement explicitly. */
    async awaitRun(runId: string): Promise<RunState> {
      const r = runs.get(runId) ?? { status: "unknown" };
      return r.status === "running" ? { ...r, status: "timeout" } : r;
    },
  } as unknown as CoreClient;
  return {
    core,
    queued,
    setMode: (m: "pending" | "ok" | "fail") => {
      state.mode = m;
    },
    settleOk: (runId: string, reply: string) => runs.set(runId, { id: runId, status: "done", result: { status: "ok", reply } }),
    settleFail: (runId: string, reason: string) => runs.set(runId, { id: runId, status: "done", result: { status: "failed", reason } }),
  };
}

async function seed(store: FlowStore, intents: string[]) {
  const flow = await store.createFlow({ scopeId: "personal:U1", title: "t", goal: "g" });
  for (const intent of intents) await store.appendStep({ flowId: flow.id, intent });
  return flow;
}

const engineOn = (store: FlowStore, core: CoreClient) =>
  createEngine({
    store,
    core,
    turnFor: (flow, step) => ({
      surface: "test",
      actor: { externalId: "U1" },
      conversation: { kind: "dm", threadRef: flow.id },
      text: step.intent,
    }),
    now: () => 1_000,
  });

describe("advancing a step", () => {
  it("runs the step, records the attempt, and settles both", async () => {
    const store = createMemoryFlowStore();
    const f = fakeCore();
    const flow = await seed(store, ["do the thing"]);
    const engine = engineOn(store, f.core);
    const out = await engine.advance(flow.id);

    assert.equal(out.kind, "advanced");
    const after = (await store.getFlow(flow.id))!;
    assert.equal(after.steps[0]!.state, "done");
    assert.equal(after.steps[0]!.result, "reply for run-1");
    assert.equal(after.state, "done");
  });

  it("records the runId on the attempt, which is the whole durable handle", async () => {
    const store = createMemoryFlowStore();
    const f = fakeCore();
    const flow = await seed(store, ["a"]);
    const engine = engineOn(store, f.core);
    await engine.advance(flow.id);

    const attempt = (await store.getFlow(flow.id))!.steps[0]!.attempts[0]!;
    assert.equal(attempt.runId, "run-1");
    assert.equal(attempt.sessionId, "sess-1");
  });

  it("captures an observation at close, with the source named", async () => {
    const store = createMemoryFlowStore();
    const f = fakeCore();
    const flow = await seed(store, ["a"]);
    const engine = engineOn(store, f.core);
    await engine.advance(flow.id);

    const obs = (await store.getFlow(flow.id))!.steps[0]!.attempts[0]!.observation!;
    assert.ok(obs, "an observation must be captured, never derived later");
    assert.equal(obs.source, "run.reply");
    assert.equal(obs.value, null, "open declares no metric; a score here would be invented");
    // Normalized fingerprint: presentation must not read as a state change.
    assert.equal(obs.digest, (await import("../src/observability.ts")).digestOf("REPLY for Run-1!!"));
  });

  it("blocks the flow when a step fails, rather than calling it done", async () => {
    const store = createMemoryFlowStore();
    const f = fakeCore("fail");
    const flow = await seed(store, ["a", "b"]);
    const engine = engineOn(store, f.core);
    await engine.advance(flow.id);

    const after = (await store.getFlow(flow.id))!;
    assert.equal(after.steps[0]!.state, "failed");
    assert.equal(after.state, "blocked");
    // blocked, not failed: the flow did not choose to stop, it could not proceed.
    assert.equal((await engine.advance(flow.id)).kind, "halted");
  });

  it("does not retry a failed step on its own", async () => {
    // Retrying silently would collapse the attempt history into a success, and
    // the history is the thing doc/03 refuses to overwrite.
    const store = createMemoryFlowStore();
    const f = fakeCore("fail");
    const flow = await seed(store, ["a"]);
    const engine = engineOn(store, f.core);
    await engine.advance(flow.id);
    await engine.advance(flow.id);
    assert.equal(f.queued.length, 1);
  });
});

describe("Monday to Wednesday", () => {
  it("resumes an in-flight attempt from its runId instead of relaunching it", async () => {
    // Monday: the step is queued and the process dies before the run settles.
    const store = createMemoryFlowStore();
    const f = fakeCore("pending");
    const flow = await seed(store, ["long job"]);
    const mondayEngine = engineOn(store, f.core);
    await mondayEngine.advance(flow.id); // run-1 never settles -> awaitRun times out

    const mid = (await store.getFlow(flow.id))!;
    assert.equal(mid.steps[0]!.state, "running");
    assert.equal(mid.steps[0]!.attempts[0]!.runId, "run-1");
    assert.equal(mid.steps[0]!.attempts[0]!.state, "running");

    // While nobody was watching, the core finished it.
    f.settleOk("run-1", "finished overnight");

    // Wednesday: a brand-new engine over the same store.
    const wednesdayEngine = engineOn(store, f.core);
    const { resumed } = await wednesdayEngine.resume(flow.id);

    assert.equal(resumed, 1);
    const after = (await store.getFlow(flow.id))!;
    assert.equal(after.steps[0]!.state, "done");
    assert.equal(after.steps[0]!.result, "finished overnight");
    assert.equal(f.queued.length, 1, "resuming must not launch a second run");
  });

  it("does not close an attempt just because the poller gave up", async () => {
    // The bug this pins: settling a timeout as `failed` marks work failed that
    // the core is still doing, and closes the attempt so `resume` — which looks
    // for attempts still `running` — can never find it again.
    const store = createMemoryFlowStore();
    const f = fakeCore("pending");
    const flow = await seed(store, ["long job"]);
    const out = await engineOn(store, f.core).advance(flow.id);

    assert.equal(out.kind, "in_flight");
    const after = (await store.getFlow(flow.id))!;
    assert.equal(after.steps[0]!.attempts[0]!.state, "running");
    assert.equal(after.steps[0]!.attempts[0]!.observation, null, "nothing was observed, so nothing is recorded");
    assert.equal(after.state, "waiting", "waiting is the flow's own pause, not a failure to proceed");
  });

  it("leaves a still-running attempt alone rather than duplicating it", async () => {
    const store = createMemoryFlowStore();
    const f = fakeCore("pending");
    const flow = await seed(store, ["long job"]);
    const engine = engineOn(store, f.core);
    await engine.advance(flow.id);

    const { resumed } = await engine.resume(flow.id);
    assert.equal(resumed, 0);
    assert.equal(f.queued.length, 1);
  });

  it("runToCompletion resumes before it advances", async () => {
    const store = createMemoryFlowStore();
    const f = fakeCore("pending");
    const flow = await seed(store, ["one", "two"]);
    await engineOn(store, f.core).advance(flow.id); // run-1 left in flight
    f.settleOk("run-1", "first done");
    f.setMode("ok"); // the second run settles on its own

    const out = await engineOn(store, f.core).runToCompletion(flow.id);

    assert.equal(out.kind, "complete", `got ${out.kind}: ${JSON.stringify(out)}`);
    const after = (await store.getFlow(flow.id))!;
    assert.deepEqual(
      after.steps.map((s) => s.result),
      ["first done", "reply for run-2"],
    );
    assert.equal(f.queued.length, 2, "the resumed step must not be relaunched");
  });
});
