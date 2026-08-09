/**
 * The desk render.
 *
 * The explorer's tests assert it has no interaction at all. The desk's cannot —
 * interaction is the point — so what these assert instead is that the *only*
 * script on the page is the one shipped with it, and that nothing a user typed
 * can become part of it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type DeskView, renderDeskHtml } from "../src/desk.ts";
import { propose } from "../src/layout.ts";

const view = (over: Partial<DeskView> = {}): DeskView => {
  const docs = over.docs ?? [
    {
      id: "f1",
      title: "ledger rewrite",
      goal: "every amount carries its currency",
      state: "waiting",
      updatedAt: 1,
      done: 1,
      total: 3,
      steps: [
        { index: 0, state: "done", agent: "SchemaAgent", intent: "…" },
        { index: 1, state: "running", agent: "MigrationAgent", intent: "…" },
        { index: 2, state: "pending", agent: "ReviewAgent", intent: "…" },
      ],
    },
  ];
  const agents = over.agents ?? [
    {
      name: "SchemaAgent",
      description: "designs schemas",
      tools: ["read"],
      child: true,
      missing: false,
    },
    {
      name: "MigrationAgent",
      description: "writes migrations",
      tools: ["read", "write"],
      child: true,
      missing: false,
    },
    {
      name: "ReviewAgent",
      description: "reviews",
      tools: ["read"],
      child: true,
      missing: false,
    },
    {
      name: "Ghost",
      description: "declared, no file",
      tools: [],
      child: true,
      missing: true,
    },
  ];
  return {
    scopeId: "group:web-project-1",
    scopeLabel: "group:web-project-1",
    harness: "pi",
    at: 1_760_000_000_000,
    docs,
    agents,
    people: ["matias"],
    scopes: [{ scopeId: "group:web-project-1", label: "group:web-project-1" }],
    layout: propose(
      {
        scopeId: "group:web-project-1",
        flows: docs.map((d) => ({
          id: d.id,
          title: d.title,
          state: d.state,
          agents: d.steps.map((s) => s.agent!),
        })),
        agents: agents.map((a) => a.name),
      },
      null,
    ),
    ...over,
  };
};

describe("what a user typed can never become script", () => {
  it("escapes a flow title in the markup", () => {
    const v = view();
    v.docs[0]!.title = "<img src=x onerror=alert(1)>";
    const html = renderDeskHtml(v);
    assert.ok(!html.includes("<img src=x"));
  });

  it("neutralises a closing script tag inside the embedded state", () => {
    // The state is embedded as JSON in a <script> block, and `</script>` inside
    // a string literal ends that block wherever it appears — including inside a
    // flow title somebody typed.
    const v = view();
    v.docs[0]!.goal = "</script><script>alert(1)</script>";
    const html = renderDeskHtml(v);
    const scripts = html.match(/<script/g) ?? [];
    assert.equal(
      scripts.length,
      2,
      `expected exactly the two shipped scripts, found ${scripts.length}`,
    );
    assert.ok(html.includes("\\u003c/script"));
  });

  it("embeds an agent description without letting it close the block", () => {
    const v = view();
    v.agents[0]!.description = "</script>gotcha";
    const html = renderDeskHtml(v);
    assert.equal((html.match(/<script/g) ?? []).length, 2);
  });
});

describe("what the desk shows before anything is read", () => {
  it("draws one cube per step on each document", () => {
    const html = renderDeskHtml(view());
    // The strip is built client-side from the same data; what the server must
    // ship is the steps with their states.
    const state = JSON.parse(
      html.match(/window\.__DESK__ = (.*?);<\/script>/s)![1]!,
    );
    assert.equal(state.docs[0].steps.length, 3);
    assert.deepEqual(
      state.docs[0].steps.map((s: { state: string }) => s.state),
      ["done", "running", "pending"],
    );
  });

  it("marks the agent of a running step as busy", () => {
    // "Is anything actually happening" is the question the desk answers with its
    // one animation, so the flag has to be computed rather than left to the client.
    const html = renderDeskHtml(view());
    const state = JSON.parse(
      html.match(/window\.__DESK__ = (.*?);<\/script>/s)![1]!,
    );
    assert.deepEqual(state.busy, { MigrationAgent: true });
  });

  it("ships the colour tables the legend is drawn from", () => {
    // Same vocabulary as the explorer, from the same module. A desk with its own
    // palette would teach a person one meaning and the other page another.
    const html = renderDeskHtml(view());
    const state = JSON.parse(
      html.match(/window\.__DESK__ = (.*?);<\/script>/s)![1]!,
    );
    assert.equal(state.stateColors.done, "#3f8f3f");
    assert.equal(state.stateColors.running, "#e0a020");
    assert.ok(
      html.includes("declared, no file"),
      "the legend must explain the struck-through cube",
    );
  });

  it("makes no external request", () => {
    const html = renderDeskHtml(view());
    const external = html.match(/(?:src|href)\s*=\s*"(?!#)[^"]*"/g) ?? [];
    assert.deepEqual(external, []);
    assert.ok(!/@import/.test(html));
  });
});
