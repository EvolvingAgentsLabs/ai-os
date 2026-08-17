import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CoreClient, QueuedTurn, RunState } from "../src/core-client.ts";
import { carryPriorResults, createEngine } from "../src/engine.ts";
import { createMemoryFlowStore } from "../src/memory-flow-store.ts";
import type { FlowStore } from "../src/flow-store.ts";
import type { FlowWithSteps, Step } from "../src/types.ts";

/**
 * A core whose runs settle when the test says so, so the window between "queued"
 * and "terminal" — the window a restart lands in — is directly addressable.
 */
function fakeCore(mode: "pending" | "ok" | "fail" = "ok") {
  const runs = new Map<string, RunState>();
  const queued: string[] = [];
  const sent: string[] = [];
  const state = { mode };
  let n = 0;
  // The real shape: two statuses at two levels, reply on the inner one.
  const terminal = (runId: string): RunState =>
    state.mode === "ok"
      ? { id: runId, status: "done", result: { status: "ok", reply: `reply for ${runId}` } }
      : { id: runId, status: "done", result: { status: "failed", reason: `failure for ${runId}` } };
  const core = {
    async queueTurn(req?: { text?: string }): Promise<QueuedTurn> {
      sent.push(req?.text ?? "");
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
    sent,
    setMode: (m: "pending" | "ok" | "fail") => {
      state.mode = m;
    },
    settleOk: (runId: string, reply: string) => runs.set(runId, { id: runId, status: "done", result: { status: "ok", reply } }),
    settleFail: (runId: string, reason: string) => runs.set(runId, { id: runId, status: "done", result: { status: "failed", reason } }),
  };
}

async function seed(store: FlowStore, intents: string[]) {
  const flow = await store.createFlow({ actorId: "U1", scopeId: "personal:U1", title: "t", goal: "g" });
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

describe("carrying work forward between steps", () => {
  const flowWith = (steps: Array<{ index: number; state: string; result: string | null }>) =>
    ({ steps: steps.map((s) => ({ ...s, id: `s${s.index}`, attempts: [] })) }) as never;

  it("shows a step what the steps before it produced", async () => {
    // Without this a flow is a list of independent turns that happen to be
    // numbered: a ReviewAgent asked to review a schema it was never shown.
    const carry = carryPriorResults();
    const text = carry(
      flowWith([
        { index: 0, state: "done", result: "ALTER TABLE ledger ADD COLUMN currency" },
        { index: 1, state: "pending", result: null },
      ]),
      { index: 1 } as never,
    );
    assert.match(text, /step 0 produced/);
    assert.match(text, /ALTER TABLE ledger/);
  });

  it("carries nothing to the first step", () => {
    const text = carryPriorResults()(flowWith([{ index: 0, state: "pending", result: null }]), { index: 0 } as never);
    assert.equal(text, "");
  });

  it("does not carry a failed step's error forward as an input", () => {
    // A step that failed produced nothing. Passing its error on as though it were
    // a result is how the next step builds on something that did not happen.
    const text = carryPriorResults()(
      flowWith([
        { index: 0, state: "failed", result: null },
        { index: 1, state: "pending", result: null },
      ]),
      { index: 1 } as never,
    );
    assert.equal(text, "");
  });

  it("truncates oldest-first and says that it truncated", () => {
    // A silent cut is the worst kind: the step still runs, still answers
    // confidently, and what it was not shown is invisible in the output.
    const text = carryPriorResults(120)(
      flowWith([
        { index: 0, state: "done", result: "A".repeat(200) },
        { index: 1, state: "done", result: "B".repeat(60) },
        { index: 2, state: "pending", result: null },
      ]),
      { index: 2 } as never,
    );
    assert.match(text, /BBB/);
    assert.ok(!text.includes("AAA"), "the oldest is the one dropped");
    assert.match(text, /1 earlier step result\(s\) omitted/);
  });

  it("prepends what was carried to the step's own instruction", async () => {
    const store = createMemoryFlowStore();
    const f = fakeCore();
    const flow = await seed(store, ["first", "second"]);
    const engine = createEngine({
      store,
      core: f.core,
      carry: carryPriorResults(),
      turnFor: (fl, st) => ({
        surface: "t",
        actor: { externalId: "U1" },
        conversation: { kind: "dm", threadRef: `${fl.id}-${st.index}` },
        text: st.intent,
      }),
    });
    await engine.advance(flow.id);
    await engine.advance(flow.id);
    assert.match(f.sent[1]!, /Work already done in this flow/);
    assert.match(f.sent[1]!, /reply for run-1/);
    assert.match(f.sent[1]!, /second$/);
  });
});

describe("a flow with no actor", () => {
  it("halts rather than running as somebody it picked", async () => {
    // Flows created before actorId existed. Running them as a configured
    // principal is the shared-account attribution ADR-0009 removes; inferring one
    // from the scope manufactures provenance. Stopping is the honest answer.
    const store = createMemoryFlowStore();
    const f = fakeCore();
    // Written the way the row exists on disk for a pre-ADR-0009 flow: the type
    // forbids it, the migrated column allows it, and the engine must cope.
    const flow = await store.createFlow({
      actorId: null as unknown as string,
      scopeId: "personal:U1",
      title: "legacy",
      goal: "created before the field existed",
    });
    await store.appendStep({ flowId: flow.id, intent: "a" });
    const out = await engineOn(store, f.core).advance(flow.id);
    assert.equal(out.kind, "halted");
    assert.match((out as { reason: string }).reason, /records no actor/);
    assert.equal(f.queued.length, 0, "nothing may be launched for a flow with nobody to be");
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

describe("the gated shape", () => {
  /**
   * The shape [doc/16](../../doc/16-a-workload-with-an-oracle.md) argued for,
   * and the rule it exists to enforce: **every step settling says the work ran,
   * not that it was right.** `open` cannot tell those apart because prose has
   * no oracle; a gated flow names checks that do.
   */
  function gatedFlowStore() {
    return createMemoryFlowStore();
  }

  const gatedTurn = (flow: FlowWithSteps, step: Step) => ({
    surface: "test",
    actor: { externalId: "U1" },
    conversation: { kind: "dm" as const, threadRef: flow.id },
    text: step.intent,
  });

  async function gatedFlow(store: ReturnType<typeof createMemoryFlowStore>, gates: string[]) {
    const flow = await store.createFlow({
      scopeId: "group:lab",
      actorId: "matias",
      title: "may it freeze?",
      goal: "decide whether the artefact may freeze",
      shape: "gated",
      requiredGates: gates,
    });
    await store.appendStep({ flowId: flow.id, intent: "run the checks" });
    return flow;
  }

  /** Settle every step so only the gate decides the outcome. */
  async function settleAll(store: ReturnType<typeof createMemoryFlowStore>, flowId: string) {
    const f = await store.getFlow(flowId);
    for (const s of f!.steps) {
      const a = await store.startAttempt({ stepId: s.id });
      await store.finishAttempt({
        attemptId: a!.id, state: "done", result: "ran",
        observation: { digest: "d", value: null, source: "test", at: 1 },
      });
    }
  }

  it("finishes when every required gate is green", async () => {
    const store = gatedFlowStore();
    const flow = await gatedFlow(store, ["A01", "A12"]);
    await settleAll(store, flow.id);

    const engine = createEngine({
      store, core: fakeCore().core, turnFor: gatedTurn,
      gateVerdict: async () => ({ mayFreeze: true, blockers: [], unknown: [] }),
    });
    const out = await engine.advance(flow.id);
    assert.equal(out.kind, "complete");
    assert.equal((await store.getFlow(flow.id))!.state, "done");
  });

  it("blocks and names the gate that went red", async () => {
    const store = gatedFlowStore();
    const flow = await gatedFlow(store, ["A01", "A12"]);
    await settleAll(store, flow.id);

    const engine = createEngine({
      store, core: fakeCore().core, turnFor: gatedTurn,
      gateVerdict: async () => ({ mayFreeze: false, blockers: ["A12"], unknown: [] }),
    });
    const out = await engine.advance(flow.id);
    assert.equal(out.kind, "halted");
    assert.match((out as { reason: string }).reason, /red: A12/);
    assert.equal((await store.getFlow(flow.id))!.state, "blocked");
  });

  /**
   * Reported apart from a red gate, all the way to the caller. A specific,
   * fixable failure rendered as an unexplained refusal is how a gate stops
   * being read.
   */
  it("blocks on a gate that never ran, and says so differently", async () => {
    const store = gatedFlowStore();
    const flow = await gatedFlow(store, ["A01", "A08"]);
    await settleAll(store, flow.id);

    const engine = createEngine({
      store, core: fakeCore().core, turnFor: gatedTurn,
      gateVerdict: async () => ({ mayFreeze: false, blockers: [], unknown: ["A08"] }),
    });
    const out = await engine.advance(flow.id);
    const reason = (out as { reason: string }).reason;
    assert.match(reason, /never ran: A08/);
    assert.doesNotMatch(reason, /red:/);
  });

  /**
   * The rule the whole shape rests on, one level up: **a deployment that cannot
   * check is not a deployment where everything passes.**
   */
  it("blocks when the deployment cannot evaluate gates at all", async () => {
    const store = gatedFlowStore();
    const flow = await gatedFlow(store, ["A01"]);
    await settleAll(store, flow.id);

    // No gateVerdict injected at all.
    const engine = createEngine({ store, core: fakeCore().core, turnFor: gatedTurn });
    const out = await engine.advance(flow.id);
    assert.equal(out.kind, "halted");
    assert.match((out as { reason: string }).reason, /cannot evaluate gates/);
    assert.equal((await store.getFlow(flow.id))!.state, "blocked");
  });

  it("refuses to finish a gated flow whose gates were configured away", async () => {
    const store = gatedFlowStore();
    const flow = await gatedFlow(store, []);
    await settleAll(store, flow.id);

    const engine = createEngine({
      store, core: fakeCore().core, turnFor: gatedTurn,
      gateVerdict: async () => ({ mayFreeze: true, blockers: [], unknown: [] }),
    });
    const out = await engine.advance(flow.id);
    assert.equal(out.kind, "halted");
    assert.match((out as { reason: string }).reason, /configured\s+away/);
  });

  it("leaves an open flow alone — no gate is consulted", async () => {
    const store = gatedFlowStore();
    const flow = await store.createFlow({
      scopeId: "group:lab", actorId: "matias", title: "prose", goal: "write it",
    });
    await store.appendStep({ flowId: flow.id, intent: "write" });
    await settleAll(store, flow.id);

    let consulted = false;
    const engine = createEngine({
      store, core: fakeCore().core, turnFor: gatedTurn,
      gateVerdict: async () => { consulted = true; return { mayFreeze: false, blockers: ["X"], unknown: [] }; },
    });
    const out = await engine.advance(flow.id);
    assert.equal(out.kind, "complete");
    assert.equal(consulted, false, "an open flow declares no metric and must not be gated");
  });
});

/**
 * An attempt whose run never returns.
 *
 * Found by running the coclea-sr §7.4 experiment against a live stack: an
 * attempt sat `running` for 3,316 seconds while the flow reported `waiting` —
 * the same state a flow doing useful work reports. `resume` polled, got
 * `status: "timeout"`, and returned without settling, which is right for a poll
 * that gave up on a live run and wrong forever for a run that died.
 *
 * The experiment's own runner then span until its deadline, three times per
 * cell, and produced two flows that cost two hours and answered nothing.
 */
describe("a run that never comes back", () => {
  function stuckCore(): CoreClient {
    return {
      async queueTurn() {
        return { status: "queued", runId: "run-stuck", sessionId: "sess-stuck" };
      },
      async turn() {
        throw new Error("not used");
      },
      async run() {
        return { id: "run-stuck", status: "running" };
      },
      async signal() {
        return {};
      },
      // Always "timeout": the poll gives up, the run never finishes. That is
      // exactly what the live stack did for 3,316 seconds.
      async awaitRun() {
        return { id: "run-stuck", status: "timeout" };
      },
    } as unknown as CoreClient;
  }

  async function flowWithOpenAttempt(clock: { t: number }) {
    const store = createMemoryFlowStore({ now: () => clock.t });
    const engine = createEngine({
      store,
      core: stuckCore(),
      now: () => clock.t,
      staleAttemptMs: 60_000,
      turnFor: (flow, step) => ({
        surface: "t",
        actor: { externalId: "U1" },
        conversation: { kind: "dm", threadRef: `${flow.id}-${step.index}` },
        text: step.intent,
      }),
    });
    const flow = await store.createFlow({
      scopeId: "group:x",
      actorId: "U1",
      title: "stuck",
      goal: "g",
    });
    await store.appendStep({ flowId: flow.id, intent: "do it" });
    await store.transitionFlow(flow.id, "draft", "running");
    await engine.advance(flow.id);
    return { store, engine, flowId: flow.id };
  }

  it("is left alone while it is still plausibly working", async () => {
    const clock = { t: 1_000_000 };
    const { store, engine, flowId } = await flowWithOpenAttempt(clock);

    clock.t += 30_000; // under the limit
    const { resumed } = await engine.resume(flowId);
    assert.equal(resumed, 0);
    const flow = await store.getFlow(flowId);
    assert.equal(flow!.steps[0]!.state, "running", "a live run must not be reaped early");
  });

  it("is failed once it is older than any turn should take", async () => {
    const clock = { t: 1_000_000 };
    const { store, engine, flowId } = await flowWithOpenAttempt(clock);

    clock.t += 120_000; // past the 60s limit
    const { resumed } = await engine.resume(flowId);
    assert.equal(resumed, 1);

    const flow = await store.getFlow(flowId);
    assert.equal(flow!.steps[0]!.state, "failed");
    const error = flow!.steps[0]!.attempts[0]!.error ?? "";
    assert.match(error, /did not return after 120s/);
    assert.match(error, /blocks/, "the reason must say what happens next");
  });

  it("puts the flow in a state a person can act on", async () => {
    const clock = { t: 1_000_000 };
    const { engine, flowId } = await flowWithOpenAttempt(clock);

    clock.t += 120_000;
    await engine.resume(flowId);
    const outcome = await engine.advance(flowId);
    assert.equal(outcome.kind, "halted");
    // `waiting` is what a working flow looks like. `blocked` is not.
    assert.match(String((outcome as { reason?: string }).reason ?? ""), /failed/);
  });
});
