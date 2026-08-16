/**
 * The desk's server, tested against a fake `ai-flows` — no core, no database, no
 * model.
 *
 * The routes worth testing are the two that spend money and the one that writes
 * a layout, because those are where a canvas stops being a picture. The rest is
 * projection and is covered by `layout.test.ts` and `desk.test.ts`.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import {
  agentOfIntent,
  assignIntent,
  createDeskServer,
  type FlowsClient,
} from "../src/server.ts";
import { createMemoryLayoutStore } from "../src/layout-store.ts";

function fakeFlows(over: Partial<FlowsClient> = {}) {
  const appended: Array<{ flowId: string; intent: string }> = [];
  const advanced: string[] = [];
  const removed: Array<{ flowId: string; index: number }> = [];
  const resumed: string[] = [];
  const forked: Array<{ flowId: string; atStep: number }> = [];
  const asked: Array<{ flowId: string; question: string; step?: number }> = [];
  const created: Array<{ scopeId: string; actorId: string; title: string; goal: string }> = [];
  const projects: Array<{ name: string; ownerId: string }> = [];
  const agents: Array<{ scopeId: string; name: string; tools: string[] }> = [];
  const files: Array<{ scopeId: string; path: string; bytes: number }> = [];
  const client: FlowsClient = {
    async conformation() {
      return {
        harness: "pi",
        scopes: [
          {
            scopeId: "org:acme",
            role: "system",
            members: [],
            agents: [
              {
                name: "SystemAgent",
                description: "org wide",
                tools: ["read"],
                subagents: [],
                ok: true,
              },
            ],
          },
          {
            scopeId: "group:web-project-1",
            role: "project",
            members: ["matias", "ada"],
            agents: [
              {
                name: "LedgerLead",
                description: "owns it",
                tools: ["read", "write"],
                subagents: ["SchemaAgent", "Ghost"],
                ok: true,
              },
              {
                name: "SchemaAgent",
                description: "designs schemas",
                tools: ["read"],
                subagents: [],
                ok: true,
              },
            ],
          },
        ],
      };
    },
    async flows(scopeId) {
      if (scopeId !== "group:web-project-1") return [];
      return [
        {
          id: "f1",
          title: "ledger rewrite",
          goal: "every amount carries its currency",
          state: "waiting",
          updatedAt: 1,
          steps: [
            {
              index: 0,
              state: "done",
              intent: 'Call your `delegate` tool with agent="SchemaAgent". …',
            },
          ],
        },
      ];
    },
    async appendStep(flowId, intent) {
      appended.push({ flowId, intent });
      return { index: 1 };
    },
    async removeStep(flowId, index) {
      removed.push({ flowId, index });
      // Step 0 has run in the fixture, so it stands in for the case the desk has
      // to explain rather than obey.
      if (index === 0)
        return {
          ok: false as const,
          reason: "step has started",
          state: "done",
        };
      return { ok: true as const };
    },
    async resume(flowId) {
      resumed.push(flowId);
      return { resumed: 0 };
    },
    async advance(flowId) {
      advanced.push(flowId);
      return { kind: "advanced" };
    },
    async fork(flowId, atStep) {
      forked.push({ flowId, atStep });
      return { id: `${flowId}-fork`, title: "fork" };
    },
    async ask(flowId, question, step) {
      asked.push({ flowId, question, step });
      return { answer: `about ${flowId}: ${question}`, spent: true, evidence: 3 };
    },
    async writeAgent(scopeId, draft) {
      // The real validator lives in ai-flows/src/agent-file.ts and is exercised
      // by its own tests; this stub records what the route forwarded.
      agents.push({ scopeId, name: draft.name, tools: draft.tools });
      return { name: draft.name, path: `agents/${draft.name}.md` };
    },
    async writeFile(scopeId, path, content) {
      files.push({ scopeId, path, bytes: content.length });
      return { path, verifiedInSandbox: `${content.length} of ${content.length} bytes present` };
    },
    async createProject(input) {
      projects.push({ name: input.name, ownerId: input.ownerId });
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return { id: `p${projects.length}`, name: input.name, scopeId: `group:${slug}-p${projects.length}` };
    },
    async createFlow(input) {
      created.push({
        scopeId: input.scopeId, actorId: input.actorId,
        title: input.title, goal: input.goal,
      });
      return { id: `flow-new-${created.length}`, title: input.title, state: "draft" };
    },
    ...over,
  };
  return { client, appended, advanced, removed, resumed, forked, asked, created, projects, agents, files };
}

async function serve(flows: FlowsClient) {
  const layouts = createMemoryLayoutStore();
  const server = createDeskServer({
    flows,
    layouts,
    now: () => 1_760_000_000_000,
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    layouts,
    close: () => new Promise<void>((r) => server.close(() => r())),
    get: (p: string) => fetch(base + p),
    /** `fetch().json()` is `unknown`; every read here wants the same shape. */
    state: async (p = "/state") =>
      (await (await fetch(base + p)).json()) as {
        at: number;
        docs: Array<{
          id: string;
          steps: Array<{ state: string; agent: string | null }>;
        }>;
        agents: Array<{ name: string; missing: boolean }>;
        layout: {
          scopeId: string;
          docs: Record<string, unknown>;
          cubes: Record<string, { onDoc: string | null }>;
        };
        busy: Record<string, boolean>;
      },
    send: (method: string, p: string, body: unknown) =>
      fetch(base + p, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
  };
}

describe("reading the desk", () => {
  it("serves a desk for a scope that can hold work, never the system scope", async () => {
    // The org scope mounts read-only into every other one. A desk for it would
    // show agents that are visible everywhere and assignable nowhere.
    const { client } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const state = await s.state();
    assert.equal(state.layout.scopeId, "group:web-project-1");
    assert.ok(!state.agents.some((a) => a.name === "SystemAgent"));
  });

  it("draws a declared agent with no file, and refuses to let it be assigned", async () => {
    const { client, appended } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const state = await s.state();
    const ghost = state.agents.find((a) => a.name === "Ghost");
    assert.ok(
      ghost,
      "a declared name with no file should still be on the desk",
    );
    assert.equal(ghost.missing, true);

    const r = await s.send("POST", "/assign", {
      scopeId: "group:web-project-1",
      flowId: "f1",
      agent: "Ghost",
    });
    assert.equal(r.status, 400);
    assert.deepEqual(
      appended,
      [],
      "no step should be created for an agent that has no file",
    );
  });

  it("puts an agent's cube on the document whose steps name it", async () => {
    const { client } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const state = await s.state();
    assert.equal(state.layout.cubes["SchemaAgent"]!.onDoc, "f1");
    assert.equal(state.layout.cubes["LedgerLead"]!.onDoc, null);
  });
});

describe("dropping a cube on a document", () => {
  it("appends the same instruction compose.ts would have written", async () => {
    // If these drift, a step created by dragging behaves differently from the
    // identical step created by composing a tree — the same picture, two
    // meanings.
    const { client, appended } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const r = await s.send("POST", "/assign", {
      scopeId: "group:web-project-1",
      flowId: "f1",
      agent: "LedgerLead",
    });
    assert.equal(r.status, 200);
    assert.equal(appended.length, 1);
    assert.equal(
      appended[0]!.intent,
      assignIntent(
        { name: "LedgerLead", description: "owns it" },
        "every amount carries its currency",
      ),
    );
    assert.match(appended[0]!.intent, /agents\/LedgerLead\.md/);
  });

  it("refuses a flow that is not in that scope", async () => {
    const { client, appended } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const r = await s.send("POST", "/assign", {
      scopeId: "group:web-project-1",
      flowId: "nope",
      agent: "LedgerLead",
    });
    assert.equal(r.status, 404);
    assert.deepEqual(appended, []);
  });

  it("does not advance the flow it just added a step to", async () => {
    // Assign and advance are separate on purpose: the desk polls itself, and a
    // canvas where a drag could start work would spend money on a gesture.
    const { client, advanced } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    await s.send("POST", "/assign", {
      scopeId: "group:web-project-1",
      flowId: "f1",
      agent: "LedgerLead",
    });
    assert.deepEqual(advanced, []);
  });
});

describe("collecting work the desk started", () => {
  it("collects a finished run before starting another step", async () => {
    // Found by pressing the button. `advance` returns `in_flight` when the run
    // has not come back, and something has to settle it — every other caller in
    // this repository pairs resume with advance. The desk did not, and a step
    // started from it stayed `running` for over ten minutes while its run had
    // finished: the cube pulsed forever.
    const { client, resumed, advanced } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    await s.send("POST", "/advance", { flowId: "f1" });
    assert.deepEqual(
      resumed,
      ["f1"],
      "advance must collect before it launches",
    );
    assert.deepEqual(advanced, ["f1"]);
  });

  it("collects in the background while the desk is merely being read", async () => {
    // Otherwise a flow started from the desk sits at `running` until somebody
    // clicks again. Resuming launches nothing: it settles a run already paid for.
    const { client, resumed, advanced } = fakeFlows({
      async flows(scopeId) {
        if (scopeId !== "group:web-project-1") return [];
        return [
          {
            id: "f1",
            title: "ledger rewrite",
            goal: "g",
            state: "running",
            updatedAt: 1,
            steps: [
              { index: 0, state: "running", intent: 'agent="SchemaAgent"' },
            ],
          },
        ];
      },
    });
    const s = await serve(client);
    after(() => s.close());
    await s.state();
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(resumed, ["f1"]);
    assert.deepEqual(
      advanced,
      [],
      "reading must never LAUNCH work, only collect it",
    );
  });

  it("does not stack overlapping collectors on one flow", async () => {
    let open = 0;
    let maxOpen = 0;
    const { client } = fakeFlows({
      async flows(scopeId) {
        if (scopeId !== "group:web-project-1") return [];
        return [
          {
            id: "f1",
            title: "t",
            goal: "g",
            state: "running",
            updatedAt: 1,
            steps: [
              { index: 0, state: "running", intent: 'agent="SchemaAgent"' },
            ],
          },
        ];
      },
      async resume() {
        open += 1;
        maxOpen = Math.max(maxOpen, open);
        await new Promise((r) => setTimeout(r, 40));
        open -= 1;
        return { resumed: 1 };
      },
    });
    const s = await serve(client);
    after(() => s.close());
    await Promise.all([s.state(), s.state(), s.state()]);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(
      maxOpen,
      1,
      "a slow run must not accumulate collectors racing to settle it",
    );
  });
});

describe("advancing", () => {
  it("runs exactly one step, and only when asked", async () => {
    const { client, advanced } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    await s.state();
    await s.state();
    assert.deepEqual(advanced, [], "reading the desk must never run work");
    const r = await s.send("POST", "/advance", { flowId: "f1" });
    assert.equal(((await r.json()) as { outcome: string }).outcome, "advanced");
    assert.deepEqual(advanced, ["f1"]);
  });
});

describe("the layout", () => {
  it("survives a reload", async () => {
    const { client } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const before = await s.state();
    before.layout.docs["f1"] = { x: 900, y: 700, pinned: true };
    const put = await s.send("PUT", "/layout", {
      scopeId: "group:web-project-1",
      layout: before.layout,
    });
    assert.equal(put.status, 200);
    const after_ = await s.state();
    assert.deepEqual(after_.layout.docs["f1"], {
      x: 900,
      y: 700,
      pinned: true,
    });
  });

  it("refuses a body whose scope disagrees with the layout it carries", async () => {
    // Otherwise one desk can write another scope's arrangement.
    const { client } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const r = await s.send("PUT", "/layout", {
      scopeId: "group:web-project-1",
      layout: { scopeId: "group:someone-else", docs: {}, cubes: {} },
    });
    assert.equal(r.status, 400);
    assert.equal(await s.layouts.get("group:someone-else"), null);
  });
});

describe("reading an agent back out of a step", () => {
  it("finds the name in both instruction forms", () => {
    assert.equal(
      agentOfIntent(
        'Call your `delegate` tool with agent="SchemaAgent". Its definition…',
      ),
      "SchemaAgent",
    );
    assert.equal(
      agentOfIntent('Act as the agent "MemoryAnalysisAgent" for this step.'),
      "MemoryAnalysisAgent",
    );
  });

  it("returns null rather than guessing", () => {
    // A cube drawn on the wrong document is worse than a cube left on the shelf:
    // the desk's whole claim is that you can see who is working on what.
    assert.equal(agentOfIntent("do the thing"), null);
    assert.equal(agentOfIntent(""), null);
  });
});

describe("taking a cube off a document", () => {
  it("removes the step it queued, so the picture and the flow agree", async () => {
    // The bug this closes: drop a cube (a step is created), drag it off (nothing
    // happens), and the desk now shows the agent as idle while its step sits
    // queued and ready to run. A view that renders cleanly and is wrong.
    const { client, removed } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const r = await s.send("POST", "/unassign", {
      scopeId: "group:web-project-1",
      flowId: "f1",
      agent: "SchemaAgent",
    });
    assert.equal(r.status, 200);
    assert.deepEqual(removed, [{ flowId: "f1", index: 0 }]);
  });

  it("reports the steps it could not remove instead of pretending", async () => {
    // Step 0 in the fixture has run. An attempt is history, so it stays — and
    // the desk has to be told, because it puts the cube back on that word.
    const { client } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const body = (await (
      await s.send("POST", "/unassign", {
        scopeId: "group:web-project-1",
        flowId: "f1",
        agent: "SchemaAgent",
      })
    ).json()) as { removed: number; kept: string[]; note?: string };
    assert.equal(body.removed, 0);
    assert.deepEqual(body.kept, ["step 0 (done)"]);
    assert.match(body.note!, /an attempt is history/);
  });

  it("says nothing was queued when the cube was only ever a placement", async () => {
    const { client, removed } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const body = (await (
      await s.send("POST", "/unassign", {
        scopeId: "group:web-project-1",
        flowId: "f1",
        agent: "LedgerLead",
      })
    ).json()) as { removed: number; note?: string };
    assert.equal(body.removed, 0);
    assert.deepEqual(
      removed,
      [],
      "no step should be touched for an agent with none",
    );
    assert.match(body.note!, /no step was queued/);
  });

  it("refuses a flow that is not in that scope", async () => {
    const { client, removed } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const r = await s.send("POST", "/unassign", {
      scopeId: "group:web-project-1",
      flowId: "nope",
      agent: "SchemaAgent",
    });
    assert.equal(r.status, 404);
    assert.deepEqual(removed, []);
  });
});

describe("what /state carries", () => {
  it("carries every field the first render did", async () => {
    // The polled endpoint and the initial page must not drift. They did: a
    // reformat moved the /state literal out from under a textual edit, so the
    // page shipped memory and the poll silently dropped it — the drawer
    // rendered once and emptied five seconds later.
    const { client } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const body = (await (await s.get("/state")).json()) as Record<
      string,
      unknown
    >;
    for (const key of ["at", "docs", "agents", "layout", "notes", "busy"]) {
      assert.ok(key in body, `/state is missing "${key}"`);
    }
  });

  it("carries the trace on every document", async () => {
    const { client } = fakeFlows();
    const s = await serve(client);
    after(() => s.close());
    const body = (await (await s.get("/state")).json()) as {
      docs: Array<{ trace?: { steps: unknown[]; movement: string } }>;
    };
    assert.ok(body.docs.length > 0);
    for (const d of body.docs) {
      assert.ok(d.trace, "a document without its trace is a skeleton");
      assert.ok(typeof d.trace.movement === "string");
    }
  });
});

describe("creating a document from the desk", () => {
  /**
   * The gesture the desk did not have.
   *
   * Every other action it offers — assign, unassign, advance, fork, ask —
   * operates on a document that already exists, so a person could arrange work
   * and could not start it. The first step of any project had to happen outside
   * the interface, which is a strange shape for a surface whose claim is that
   * work outlives the conversation.
   */
  it("creates a flow and returns its id", async () => {
    const f = fakeFlows();
    const s = await serve(f.client);
    after(() => s.close());

    const res = await s.send("POST", "/flow", {
      scopeId: "group:acme-web",
      actorId: "matias",
      title: "Passive membrane",
      goal: "validate it against its closed form and freeze only if it holds",
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; flowId: string; title: string };
    assert.equal(body.ok, true);
    assert.equal(body.title, "Passive membrane");
    assert.equal(f.created.length, 1);
    assert.equal(f.created[0]!.scopeId, "group:acme-web");
    assert.equal(f.created[0]!.actorId, "matias");
  });

  /**
   * ADR-0009: a flow with no actor is **not created**, rather than created and
   * quietly attributed to a service account. An optional field with a fallback
   * behind it is the same shared-account attribution with an extra step.
   */
  it("refuses a flow with no actor", async () => {
    const f = fakeFlows();
    const s = await serve(f.client);
    after(() => s.close());

    const res = await s.send("POST", "/flow", {
      scopeId: "group:acme-web",
      title: "Something",
      goal: "finish it",
    });
    assert.equal(res.status, 400);
    assert.match((await res.text()), /actorId is required/);
    assert.equal(f.created.length, 0, "nothing may be created on a rejected request");
  });

  /**
   * The goal is required and is **not** defaulted from the title. A flow whose
   * goal is its own title states nothing about what "done" means, which is the
   * first of the four things `doc/03-ai-flows` says a session lacks and a flow
   * is supposed to supply.
   */
  it("refuses a flow with no goal, rather than copying the title into it", async () => {
    const f = fakeFlows();
    const s = await serve(f.client);
    after(() => s.close());

    const res = await s.send("POST", "/flow", {
      scopeId: "group:acme-web",
      actorId: "matias",
      title: "Something",
    });
    assert.equal(res.status, 400);
    assert.equal(f.created.length, 0);
  });

  it("carries initial steps through when they are given", async () => {
    const f = fakeFlows();
    const s = await serve(f.client);
    after(() => s.close());

    const res = await s.send("POST", "/flow", {
      scopeId: "group:acme-web",
      actorId: "matias",
      title: "Gate run",
      goal: "report every gate with its measured number",
      steps: ["run the analytic gates", "decide whether it may freeze"],
    });
    assert.equal(res.status, 200);
    assert.equal(f.created.length, 1);
  });

  it("rejects steps that are not strings", async () => {
    const f = fakeFlows();
    const s = await serve(f.client);
    after(() => s.close());

    const res = await s.send("POST", "/flow", {
      scopeId: "group:acme-web",
      actorId: "matias",
      title: "Gate run",
      goal: "report every gate",
      steps: [{ intent: "run them" }],
    });
    assert.equal(res.status, 400);
    assert.equal(f.created.length, 0);
  });
});

/**
 * Starting a project from the desk.
 *
 * The gesture that decides whether this is a system or a viewer of one. Every
 * scope the desk has ever shown was minted by a seed script run from a shell,
 * so a person sitting at it could open work somebody else started and could not
 * start their own — which is the difference between an operating system and a
 * dashboard over one.
 */
describe("starting a project from the desk", () => {
  it("creates it, and answers with the scope its work will happen in", async () => {
    const f = fakeFlows();
    const s = await serve(f.client);
    after(() => s.close());

    const res = await s.send("POST", "/project", { name: "COCLEA-SR", ownerId: "matias" });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; scopeId: string; name: string };
    assert.equal(body.ok, true);
    assert.equal(body.name, "COCLEA-SR");
    // The scope id is what the page navigates to. Without it the project exists
    // and the person who just made it has no way to reach it.
    assert.match(body.scopeId, /^group:coclea-sr-/);
    assert.equal(f.projects.length, 1);
    assert.equal(f.projects[0]!.ownerId, "matias");
  });

  /**
   * The same rule `Flow.actorId` states, one level up. A project with a guessed
   * owner is manufactured provenance, and at this level it decides who may see
   * the work at all.
   */
  it("refuses a project with no owner", async () => {
    const f = fakeFlows();
    const s = await serve(f.client);
    after(() => s.close());

    const res = await s.send("POST", "/project", { name: "COCLEA-SR" });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /ownerId is required/);
    assert.equal(f.projects.length, 0, "nothing may be created on a rejected request");
  });

  it("refuses a project with no name", async () => {
    const f = fakeFlows();
    const s = await serve(f.client);
    after(() => s.close());

    const res = await s.send("POST", "/project", { name: "   ", ownerId: "matias" });
    assert.equal(res.status, 400);
    assert.equal(f.projects.length, 0);
  });
});
