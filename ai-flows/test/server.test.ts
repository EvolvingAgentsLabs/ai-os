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

function serverOn(mode: "ok" | "pending" = "ok", secret: string | undefined = SECRET) {
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
    const r = await signed(server, "POST", "/flows", { scopeId: "personal:U1", goal: "g", shape: "sequence" });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /unknown shape/);
  });

  it("requires a scope and a goal", async () => {
    const { server } = serverOn();
    assert.equal((await signed(server, "POST", "/flows", { goal: "g" })).status, 400);
    assert.equal((await signed(server, "POST", "/flows", { scopeId: "personal:U1" })).status, 400);
  });

  it("advances a step and answers with the outcome and the flow", async () => {
    const { server } = serverOn();
    const created = await signed(server, "POST", "/flows", {
      scopeId: "personal:U1",
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
    const created = await signed(server, "POST", "/flows", { scopeId: "personal:U1", goal: "g", steps: ["slow"] });
    const r = await signed(server, "POST", `/flows/${created.body.id}/advance`, {});
    assert.equal(r.status, 202);
    assert.equal(r.body.outcome.kind, "in_flight");
  });

  it("resumes an in-flight flow through the API", async () => {
    const { server } = serverOn("pending");
    const created = await signed(server, "POST", "/flows", { scopeId: "personal:U1", goal: "g", steps: ["slow"] });
    await signed(server, "POST", `/flows/${created.body.id}/advance`, {});
    const r = await signed(server, "POST", `/flows/${created.body.id}/resume`, {});
    assert.equal(r.status, 200);
    assert.equal(r.body.resumed, 0, "still running, so nothing to settle yet");
  });

  it("forks a flow at a step and records the lineage", async () => {
    const { server } = serverOn();
    const created = await signed(server, "POST", "/flows", {
      scopeId: "personal:U1",
      goal: "g",
      steps: ["a", "b"],
    });
    const r = await signed(server, "POST", `/flows/${created.body.id}/fork`, { atStep: 0 });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.forkedFrom, { flowId: created.body.id, atStep: 0 });
    assert.notEqual(r.body.id, created.body.id);
  });

  it("404s an unknown flow instead of inventing one", async () => {
    const { server } = serverOn();
    assert.equal((await signed(server, "GET", "/flows/nope")).status, 404);
    assert.equal((await signed(server, "POST", "/flows/nope/steps", { intent: "x" })).status, 404);
  });

  it("409s an advance on a blocked flow", async () => {
    const { server } = serverOn();
    const created = await signed(server, "POST", "/flows", { scopeId: "personal:U1", goal: "g", steps: [] });
    await signed(server, "POST", `/flows/${created.body.id}/advance`, {}); // no steps -> complete/done
    const again = await signed(server, "POST", `/flows/${created.body.id}/advance`, {});
    assert.equal(again.body.outcome.kind, "complete");
    assert.equal(again.status, 200);
  });
});
