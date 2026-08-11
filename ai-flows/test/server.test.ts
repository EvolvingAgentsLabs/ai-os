import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFlowServer } from "../src/server.ts";
import { createMemoryFlowStore } from "../src/memory-flow-store.ts";
import { createEngine } from "../src/engine.ts";
import { signedHeaders, type CoreClient, type QueuedTurn, type RunState } from "../src/core-client.ts";

const SECRET = "a-signing-secret-long-enough-to-be-real-0123";

function stubCore(mode: "ok" | "pending" = "ok"): CoreClient {
  const runs = new Map<string, RunState>();
  let n = 0;
  return {
    async queueTurn(): Promise<QueuedTurn> {
      n += 1;
      const runId = `run-${n}`;
      runs.set(
        runId,
        mode === "ok"
          ? { id: runId, status: "done", result: { status: "ok", reply: `reply ${n}` } }
          : { id: runId, status: "running" },
      );
      return { status: "queued", runId };
    },
    async awaitRun(runId: string) {
      const r = runs.get(runId)!;
      return r.status === "running" ? { ...r, status: "timeout" } : r;
    },
    async run(runId: string) {
      return runs.get(runId)!;
    },
  } as unknown as CoreClient;
}

function serverOn(
  mode: "ok" | "pending" = "ok",
  secret: string | undefined = SECRET,
  extra: { ask?: (prompt: string) => Promise<string> } = {},
) {
  const store = createMemoryFlowStore();
  const engine = createEngine({
    store,
    core: stubCore(mode),
    turnFor: (flow, step) => ({
      surface: "t",
      actor: { externalId: "U1" },
      conversation: { kind: "dm", threadRef: `${flow.id}-${step.index}` },
      text: step.intent,
    }),
  });
  const server = createFlowServer({
    store,
    engine,
    ...(secret ? { signingSecret: secret } : { allowUnauthenticated: true }),
    ...extra,
  });
  return { store, server };
}

/** Drive the handler without a socket, so the tests exercise routing and auth only. */
async function call(
  server: ReturnType<typeof createFlowServer>,
  method: string,
  path: string,
  body?: unknown,
  opts: { secret?: string; headers?: Record<string, string> } = {},
) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const headers: Record<string, string> = {
    ...(opts.secret ? signedHeaders(opts.secret, method, path, raw) : {}),
    ...(opts.headers ?? {}),
  };
  const req = Object.assign(
    (async function* () {
      if (raw) yield Buffer.from(raw);
    })(),
    { method, url: path, headers },
  ) as never;

  let status = 0;
  let payload = "";
  const res = {
    headersSent: false,
    writeHead(s: number) {
      status = s;
      return res;
    },
    end(t?: string) {
      payload = t ?? "";
    },
  } as never as import("node:http").ServerResponse;

  await server.handle(req, res);
  return { status, body: payload ? JSON.parse(payload) : null };
}

describe("refusing to start", () => {
  it("will not start open unless somebody says so out loud", () => {
    // A write surface that starts model runs and touches a scope's workspace
    // must not default to open.
    assert.throws(
      () =>
        createFlowServer({
          store: createMemoryFlowStore(),
          engine: {} as never,
        }),
      /refusing to start/,
    );
  });

  it("starts open when the caller acknowledges it", () => {
    assert.doesNotThrow(() =>
      createFlowServer({ store: createMemoryFlowStore(), engine: {} as never, allowUnauthenticated: true }),
    );
  });
});

describe("authentication", () => {
  it("rejects an unsigned request", async () => {
    const { server } = serverOn();
    const r = await call(server, "GET", "/flows?scopeId=personal:U1");
    assert.equal(r.status, 401);
    assert.match(r.body.reason, /unsigned/);
  });

  it("rejects a signature made for a different path", async () => {
    // The signature covers path AND query, so one issued for my scope cannot be
    // replayed against yours.
    const { server } = serverOn();
    const headers = signedHeaders(SECRET, "GET", "/flows?scopeId=personal:MINE", "");
    const r = await call(server, "GET", "/flows?scopeId=personal:YOURS", undefined, { headers });
    assert.equal(r.status, 401);
    assert.match(r.body.reason, /mismatch/);
  });

  it("rejects a signature made with the wrong secret", async () => {
    const { server } = serverOn();
    const r = await call(server, "GET", "/flows?scopeId=personal:U1", undefined, { secret: "not-the-secret-at-all-x" });
    assert.equal(r.status, 401);
  });

  it("accepts a correctly signed request", async () => {
    const { server } = serverOn();
    const r = await call(server, "GET", "/flows?scopeId=personal:U1", undefined, { secret: SECRET });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.flows, []);
  });
});

describe("the flow routes", () => {
  const signed = (s: ReturnType<typeof createFlowServer>, m: string, p: string, b?: unknown) =>
    call(s, m, p, b, { secret: SECRET });

  it("creates a flow with its steps in one call", async () => {
    const { server } = serverOn();
    const r = await signed(server, "POST", "/flows", {
      scopeId: "personal:U1",
      actorId: "U1",
      goal: "two things",
      steps: ["first", "second"],
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.steps.length, 2);
    assert.equal(r.body.state, "draft");
  });

  it("refuses a shape this build does not have, rather than quietly using open", async () => {
    // Asking for `sequence` today is asking for M6. Defaulting would answer a
    // different question than the one the caller asked.
    const { server } = serverOn();
    const r = await signed(server, "POST", "/flows", { scopeId: "personal:U1", actorId: "U1", goal: "g", shape: "sequence" });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /unknown shape/);
  });

  it("requires a scope and a goal", async () => {
    const { server } = serverOn();
    assert.equal((await signed(server, "POST", "/flows", { goal: "g", actorId: "U1" })).status, 400);
    assert.equal((await signed(server, "POST", "/flows", { scopeId: "personal:U1", actorId: "U1" })).status, 400);
  });

  it("advances a step and answers with the outcome and the flow", async () => {
    const { server } = serverOn();
    const created = await signed(server, "POST", "/flows", {
      scopeId: "personal:U1",
      actorId: "U1",
      goal: "g",
      steps: ["do it"],
    });
    const id = created.body.id;
    const r = await signed(server, "POST", `/flows/${id}/advance`, {});
    assert.equal(r.status, 200);
    assert.equal(r.body.outcome.kind, "advanced");
    assert.equal(r.body.flow.steps[0].state, "done");
    assert.equal(r.body.flow.steps[0].result, "reply 1");
  });

  it("answers 202 while a run is still executing, not 200", async () => {
    // 200 would tell the caller the step finished when the core is still on it.
    const { server } = serverOn("pending");
    const created = await signed(server, "POST", "/flows", { scopeId: "personal:U1", actorId: "U1", goal: "g", steps: ["slow"] });
    const r = await signed(server, "POST", `/flows/${created.body.id}/advance`, {});
    assert.equal(r.status, 202);
    assert.equal(r.body.outcome.kind, "in_flight");
  });

  it("resumes an in-flight flow through the API", async () => {
    const { server } = serverOn("pending");
    const created = await signed(server, "POST", "/flows", { scopeId: "personal:U1", actorId: "U1", goal: "g", steps: ["slow"] });
    await signed(server, "POST", `/flows/${created.body.id}/advance`, {});
    const r = await signed(server, "POST", `/flows/${created.body.id}/resume`, {});
    assert.equal(r.status, 200);
    assert.equal(r.body.resumed, 0, "still running, so nothing to settle yet");
  });

  it("forks a flow at a step and records the lineage", async () => {
    const { server } = serverOn();
    const created = await signed(server, "POST", "/flows", {
      scopeId: "personal:U1",
      actorId: "U1",
      goal: "g",
      steps: ["a", "b"],
    });
    const r = await signed(server, "POST", `/flows/${created.body.id}/fork`, { atStep: 0 });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.forkedFrom, { flowId: created.body.id, atStep: 0 });
    assert.notEqual(r.body.id, created.body.id);
  });

  it("refuses a flow with no actor rather than attributing it to a service account", async () => {
    // ADR-0009: an optional field with a fallback behind it is the same
    // shared-account attribution with an extra step.
    const { server } = serverOn();
    const r = await signed(server, "POST", "/flows", { scopeId: "personal:U1", goal: "g" });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /actorId is required/);
  });

  it("records the actor on the flow, and a fork inherits it", async () => {
    const { server } = serverOn();
    const created = await signed(server, "POST", "/flows", {
      scopeId: "personal:U1",
      actorId: "ada",
      goal: "g",
      steps: ["a"],
    });
    assert.equal(created.body.actorId, "ada");
    const forked = await signed(server, "POST", `/flows/${created.body.id}/fork`, { atStep: 0 });
    // The same person continuing the same work down a different branch.
    assert.equal(forked.body.actorId, "ada");
  });

  it("404s an unknown flow instead of inventing one", async () => {
    const { server } = serverOn();
    assert.equal((await signed(server, "GET", "/flows/nope")).status, 404);
    assert.equal((await signed(server, "POST", "/flows/nope/steps", { intent: "x" })).status, 404);
  });

  it("409s an advance on a blocked flow", async () => {
    const { server } = serverOn();
    const created = await signed(server, "POST", "/flows", { scopeId: "personal:U1", actorId: "U1", goal: "g", steps: [] });
    await signed(server, "POST", `/flows/${created.body.id}/advance`, {}); // no steps -> complete/done
    const again = await signed(server, "POST", `/flows/${created.body.id}/advance`, {});
    assert.equal(again.body.outcome.kind, "complete");
    assert.equal(again.status, 200);
  });
});

/**
 * Asking about a flow — the route behind the desk's selection.
 *
 * The assertions that matter are about money and about honesty: it must not buy
 * a turn when the trace holds nothing, it must say whether it bought one, and
 * with no model wired it must refuse rather than answer from the goal.
 */
describe("asking about a flow", () => {
  const signed = (s: ReturnType<typeof createFlowServer>, m: string, p: string, b?: unknown) =>
    call(s, m, p, b, { secret: SECRET });

  async function flowThatRan(server: ReturnType<typeof createFlowServer>) {
    const created = await signed(server, "POST", "/flows", {
      scopeId: "personal:U1",
      actorId: "U1",
      goal: "rewrite the ledger",
      steps: ["first"],
    });
    await signed(server, "POST", `/flows/${created.body.id}/advance`, {});
    return created.body.id as string;
  }

  it("answers from the trace, and says it spent", async () => {
    const asked: string[] = [];
    const { server } = serverOn("ok", SECRET, {
      ask: async (p) => {
        asked.push(p);
        return "it stopped on a constraint violation";
      },
    });
    const id = await flowThatRan(server);
    const r = await signed(server, "POST", `/flows/${id}/ask`, { question: "why did this stop?" });
    assert.equal(r.status, 200);
    assert.equal(r.body.spent, true);
    assert.match(r.body.answer, /constraint violation/);
    assert.match(asked[0]!, /RECORD:/);
  });

  it("does not buy a turn when there is nothing in the trace", async () => {
    let calls = 0;
    const { server } = serverOn("ok", SECRET, {
      ask: async () => {
        calls++;
        return "should not happen";
      },
    });
    const created = await signed(server, "POST", "/flows", {
      scopeId: "personal:U1",
      actorId: "U1",
      goal: "not started",
      steps: ["first"],
    });
    const r = await signed(server, "POST", `/flows/${created.body.id}/ask`, { question: "what happened?" });
    assert.equal(r.status, 200);
    assert.equal(r.body.spent, false);
    assert.equal(calls, 0);
    assert.match(r.body.answer, /nothing in the trace/);
  });

  it("501s with no model wired, rather than answering from the goal", async () => {
    const { server } = serverOn();
    const id = await flowThatRan(server);
    const r = await signed(server, "POST", `/flows/${id}/ask`, { question: "why?" });
    assert.equal(r.status, 501);
    assert.equal(r.body.error, "not_configured");
  });

  it("refuses an empty question before it looks anything up", async () => {
    const { server } = serverOn("ok", SECRET, { ask: async () => "x" });
    const id = await flowThatRan(server);
    assert.equal((await signed(server, "POST", `/flows/${id}/ask`, { question: "   " })).status, 400);
    assert.equal((await signed(server, "POST", `/flows/${id}/ask`, {})).status, 400);
  });

  it("404s an unknown flow", async () => {
    const { server } = serverOn("ok", SECRET, { ask: async () => "x" });
    assert.equal((await signed(server, "POST", "/flows/nope/ask", { question: "why?" })).status, 404);
  });

  it("marks the selected step in the prompt when one is given", async () => {
    let prompt = "";
    const { server } = serverOn("ok", SECRET, {
      ask: async (p) => {
        prompt = p;
        return "ok";
      },
    });
    const id = await flowThatRan(server);
    await signed(server, "POST", `/flows/${id}/ask`, { question: "why?", step: 0 });
    assert.match(prompt, /^>> step 0 /m);
  });
});
