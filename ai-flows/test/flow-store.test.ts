import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMemoryFlowStore } from "../src/memory-flow-store.ts";
import { createPostgresFlowStore } from "../src/postgres-flow-store.ts";
import { nextStepOf, openAttemptOf, type FlowStore } from "../src/flow-store.ts";

const SCOPE = "personal:U1";
const DATABASE_URL = process.env.DATABASE_URL;

const backends: Array<{
  name: string;
  make: () => FlowStore;
  skip: boolean | string;
}> = [
  { name: "memory", make: createMemoryFlowStore, skip: false },
  {
    name: "postgres",
    make: () => createPostgresFlowStore(DATABASE_URL!),
    skip: DATABASE_URL ? false : "set DATABASE_URL to run the postgres backend",
  },
];

for (const backend of backends) {
  describe(`flow store (${backend.name})`, { skip: backend.skip }, () => {
    let store: FlowStore;

    before(() => {
      store = backend.make();
    });

    after(async () => {
      await store.close?.();
    });

    const newFlow = () =>
      store.createFlow({
        scopeId: SCOPE,
        title: `t-${randomUUID()}`,
        goal: "ship it",
      });

    it("a flow starts as a draft with no lineage", async () => {
      const flow = await newFlow();
      assert.equal(flow.state, "draft");
      assert.equal(flow.shape, "open");
      assert.equal(flow.forkedFrom, null);
      const read = await store.getFlow(flow.id);
      assert.equal(read?.goal, "ship it", "the goal is persisted, which is what a session cannot do");
      assert.deepEqual(read?.steps, []);
    });

    it("steps are appended in order and the next one is the first pending", async () => {
      const flow = await newFlow();
      const a = await store.appendStep({
        flowId: flow.id,
        intent: "read the thing",
      });
      const b = await store.appendStep({
        flowId: flow.id,
        intent: "write the thing",
      });
      assert.equal(a?.index, 0);
      assert.equal(b?.index, 1);
      const read = await store.getFlow(flow.id);
      assert.equal(nextStepOf(read!)?.id, a!.id);
    });

    it("appending to a flow that does not exist returns null rather than throwing", async () => {
      assert.equal(await store.appendStep({ flowId: randomUUID(), intent: "nowhere" }), null);
    });

    it("state transitions are compare-and-swap", async () => {
      const flow = await newFlow();
      assert.equal((await store.transitionFlow(flow.id, "running", "done"))?.state, undefined, "wrong expected state");
      assert.equal((await store.transitionFlow(flow.id, "draft", "running"))?.state, "running");
      assert.equal(await store.transitionFlow(flow.id, "draft", "running"), null, "the second writer loses");
    });

    it("waiting and blocked are distinct states a flow can reach and leave", async () => {
      const flow = await newFlow();
      await store.transitionFlow(flow.id, "draft", "running");
      assert.equal((await store.transitionFlow(flow.id, "running", "waiting"))?.state, "waiting");
      assert.equal((await store.transitionFlow(flow.id, "waiting", "running"))?.state, "running");
      assert.equal((await store.transitionFlow(flow.id, "running", "blocked"))?.state, "blocked");
      assert.equal(
        await store.transitionFlow(flow.id, "waiting", "done"),
        null,
        "blocked is not waiting: a transition expecting waiting must not fire",
      );
    });

    it("every attempt is kept — a failure is history, not an overwrite", async () => {
      const flow = await newFlow();
      const step = await store.appendStep({
        flowId: flow.id,
        intent: "flaky work",
      });

      const first = await store.startAttempt({
        stepId: step!.id,
        runId: "run-1",
        sessionId: "s-1",
      });
      assert.equal(first?.n, 1);
      await store.finishAttempt({
        attemptId: first!.id,
        state: "failed",
        error: "provider timeout",
      });

      await store.transitionStep(step!.id, "failed", "pending");
      const second = await store.startAttempt({
        stepId: step!.id,
        runId: "run-2",
        sessionId: "s-2",
      });
      assert.equal(second?.n, 2);
      await store.finishAttempt({
        attemptId: second!.id,
        state: "done",
        result: "the answer",
      });

      const read = await store.getFlow(flow.id);
      const persisted = read!.steps[0]!;
      assert.equal(persisted.state, "done");
      assert.equal(persisted.result, "the answer");
      assert.equal(persisted.attempts.length, 2, "the failed attempt survives its own failure");
      assert.equal(persisted.attempts[0]!.error, "provider timeout");
      assert.equal(persisted.attempts[0]!.runId, "run-1", "each attempt points at the run that produced it");
      assert.equal(persisted.attempts[1]!.runId, "run-2");
      assert.notEqual(persisted.attempts[0]!.sessionId, persisted.attempts[1]!.sessionId);
    });

    it("a step carries the session on the attempt, not on the flow", async () => {
      const flow = await newFlow();
      const step = await store.appendStep({ flowId: flow.id, intent: "one" });
      const attempt = await store.startAttempt({
        stepId: step!.id,
        sessionId: "s-a",
      });
      const read = await store.getFlow(flow.id);
      assert.equal(read!.steps[0]!.attempts[0]!.sessionId, "s-a");
      assert.equal(
        (read! as unknown as Record<string, unknown>).sessionId,
        undefined,
        "a flow that owned one session would be single-threaded by the run store's per-session claim",
      );
      await store.finishAttempt({ attemptId: attempt!.id, state: "done" });
    });

    it("only one attempt is open at a time", async () => {
      const flow = await newFlow();
      const step = await store.appendStep({ flowId: flow.id, intent: "one" });
      const open = await store.startAttempt({ stepId: step!.id });
      assert.equal(await store.startAttempt({ stepId: step!.id }), null, "the step is already running");
      const read = await store.getFlow(flow.id);
      assert.equal(openAttemptOf(read!.steps[0]!)?.id, open!.id);
    });

    it("finishing an attempt twice is refused", async () => {
      const flow = await newFlow();
      const step = await store.appendStep({ flowId: flow.id, intent: "one" });
      const attempt = await store.startAttempt({ stepId: step!.id });
      assert.notEqual(await store.finishAttempt({ attemptId: attempt!.id, state: "done" }), null);
      assert.equal(await store.finishAttempt({ attemptId: attempt!.id, state: "failed" }), null);
    });

    it("an attempt closed without an observation keeps none — absence is not sameness", async () => {
      const flow = await store.createFlow({ scopeId: SCOPE, title: "t", goal: "g" });
      const step = await store.appendStep({ flowId: flow.id, intent: "one" });
      const attempt = await store.startAttempt({ stepId: step!.id });
      await store.finishAttempt({ attemptId: attempt!.id, state: "done" });

      const read = await store.getFlow(flow.id);
      assert.equal(read?.steps[0]!.attempts[0]!.observation, null);
    });

    it("an observation is captured on the attempt, because upstream telemetry expires within the hour", async () => {
      const flow = await store.createFlow({ scopeId: SCOPE, title: "t", goal: "g" });
      const step = await store.appendStep({ flowId: flow.id, intent: "one" });
      const attempt = await store.startAttempt({ stepId: step!.id });
      await store.finishAttempt({
        attemptId: attempt!.id,
        state: "done",
        observation: { digest: "beef", value: null, source: "files-touched", at: 1_700_000_000 },
      });

      const read = await store.getFlow(flow.id);
      const obs = read?.steps[0]!.attempts[0]!.observation;
      assert.equal(obs?.digest, "beef");
      assert.equal(obs?.value, null);
      assert.equal(obs?.source, "files-touched");
      assert.equal(obs?.at, 1_700_000_000);
    });

    it("every attempt keeps its own observation, so a repeat is visible across retries", async () => {
      const flow = await store.createFlow({ scopeId: SCOPE, title: "t", goal: "g" });
      const step = await store.appendStep({ flowId: flow.id, intent: "one" });

      for (const digest of ["a1", "a1", "b2"]) {
        const attempt = await store.startAttempt({ stepId: step!.id });
        await store.transitionStep(step!.id, "running", "pending");
        await store.finishAttempt({
          attemptId: attempt!.id,
          state: "failed",
          observation: { digest, value: null, source: "files-touched" },
        });
        await store.transitionStep(step!.id, "failed", "pending");
      }

      const read = await store.getFlow(flow.id);
      const digests = read?.steps[0]!.attempts.map((a) => a.observation?.digest);
      assert.deepEqual(digests, ["a1", "a1", "b2"]);
    });

    it("a numeric value rides alongside the digest for shapes that declare a metric", async () => {
      const flow = await store.createFlow({ scopeId: SCOPE, title: "t", goal: "g" });
      const step = await store.appendStep({ flowId: flow.id, intent: "one" });
      const attempt = await store.startAttempt({ stepId: step!.id });
      await store.finishAttempt({
        attemptId: attempt!.id,
        state: "done",
        observation: { digest: "c3", value: 0.75, source: "eval" },
      });

      const read = await store.getFlow(flow.id);
      assert.equal(read?.steps[0]!.attempts[0]!.observation?.value, 0.75);
    });

    it("a fork records its ancestor and the step it left from", async () => {
      const parent = await newFlow();
      const first = await store.appendStep({
        flowId: parent.id,
        intent: "step one",
      });
      await store.appendStep({ flowId: parent.id, intent: "step two" });
      const attempt = await store.startAttempt({ stepId: first!.id });
      await store.finishAttempt({
        attemptId: attempt!.id,
        state: "done",
        result: "one done",
      });

      const forked = await store.fork({
        flowId: parent.id,
        atStep: 0,
        title: "the other way",
      });
      assert.deepEqual(forked?.forkedFrom, { flowId: parent.id, atStep: 0 }, "lineage from the first commit");
      assert.equal(forked?.title, "the other way");
      assert.equal(forked?.steps.length, 1, "only the steps up to the fork point come along");
      assert.equal(forked?.steps[0]!.result, "one done", "the ancestor's result is inherited");
      assert.equal(forked?.steps[0]!.state, "pending", "but the fork re-runs it");
      assert.deepEqual(forked?.steps[0]!.attempts, [], "the ancestor's attempts are the ancestor's history");

      const reread = await store.getFlow(forked!.id);
      assert.deepEqual(reread?.forkedFrom, { flowId: parent.id, atStep: 0 }, "and it survives a re-read");
    });

    it("forking past the end, or from a flow that does not exist, returns null", async () => {
      const flow = await newFlow();
      await store.appendStep({ flowId: flow.id, intent: "only one" });
      assert.equal(await store.fork({ flowId: flow.id, atStep: 1 }), null);
      assert.equal(await store.fork({ flowId: flow.id, atStep: -1 }), null);
      assert.equal(await store.fork({ flowId: randomUUID(), atStep: 0 }), null);
    });

    it("flows are listed by scope, newest first", async () => {
      const scope = `personal:${randomUUID()}`;
      const older = await store.createFlow({
        scopeId: scope,
        title: "older",
        goal: "g",
      });
      const newer = await store.createFlow({
        scopeId: scope,
        title: "newer",
        goal: "g",
      });
      const listed = await store.listFlows(scope);
      assert.deepEqual(
        listed.map((f) => f.id),
        [newer.id, older.id],
      );
      assert.equal((await store.listFlows(`personal:${randomUUID()}`)).length, 0, "and never across scopes");
    });
  });
}

describe(
  "flow store (postgres): the flow outlives the process that made it",
  { skip: DATABASE_URL ? false : "set DATABASE_URL" },
  () => {
    it("a second store, with its own pool, reads the flow and its attempts back", async () => {
      const writer = createPostgresFlowStore(DATABASE_URL!);
      const flow = await writer.createFlow({
        scopeId: SCOPE,
        title: "monday",
        goal: "finish on wednesday",
      });
      const step = await writer.appendStep({
        flowId: flow.id,
        intent: "start it",
      });
      const attempt = await writer.startAttempt({
        stepId: step!.id,
        runId: "r-1",
        sessionId: "s-1",
      });
      await writer.finishAttempt({
        attemptId: attempt!.id,
        state: "failed",
        error: "interrupted",
      });
      await writer.transitionFlow(flow.id, "draft", "running");
      await writer.close?.();

      const reader = createPostgresFlowStore(DATABASE_URL!);
      const read = await reader.getFlow(flow.id);
      await reader.close?.();

      assert.equal(read?.state, "running");
      assert.equal(read?.goal, "finish on wednesday");
      assert.equal(read?.steps[0]!.attempts[0]!.error, "interrupted");
      assert.equal(read?.steps[0]!.attempts[0]!.n, 1);
    });
  },
);
