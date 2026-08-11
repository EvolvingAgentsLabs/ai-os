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
import { type DeskDoc, type DeskView, renderDeskHtml } from "../src/desk.ts";
import { propose } from "../src/layout.ts";
import { digestOf } from "../src/zoom.ts";
import { actionsFor } from "../src/actions.ts";

/**
 * Fill in the derived halves of a document with the real functions.
 *
 * Hand-written digests and menus in a fixture would drift from the ones the
 * server builds, and the render tests would then be asserting against a shape
 * the product does not produce.
 */
const derived = (d: Omit<DeskDoc, "digest" | "actions">, at: number): DeskDoc => {
  const digest = digestOf(
    {
      flowId: d.id,
      title: d.title,
      state: d.state,
      updatedAt: d.updatedAt,
      trace: d.trace,
    },
    "step",
    at,
  );
  return {
    ...d,
    digest,
    actions: actionsFor({
      flowId: d.id,
      state: d.state,
      digest,
      trace: d.trace,
      availableAgents: ["SchemaAgent", "MigrationAgent", "ReviewAgent"],
    }),
  };
};

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
      trace: {
        movement: "not enough to say",
        movementTone: "muted" as const,
        detail: "1 observation(s)",
        ignoredCount: 0,
        steps: [
          {
            index: 0,
            state: "done",
            agent: "SchemaAgent",
            result: "a currency column, decimal 12,2",
            attempts: [
              {
                n: 1,
                state: "done",
                runId: "run-abc",
                digest: "cafebabe",
                source: "run.reply",
                error: null,
              },
            ],
          },
        ],
      },
    },
  ].map((d) => derived(d as Omit<DeskDoc, "digest" | "actions">, 1_760_000_000_000));
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
    notes: [],
    memoryLevels: [],
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

describe("the simulated page", () => {
  it("ships a parseable shim, and says on its chrome that it is simulated", () => {
    // Same trap as the client: SIMULATION_JS is a template literal, and one
    // backtick in it ends the string early. It happened here too, on the first
    // write of this module.
    const html = renderDeskHtml({ ...view(), simulate: true });
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      (m) => m[1]!,
    );
    assert.equal(scripts.length, 3, "state, shim, client");
    assert.doesNotThrow(() => new Function(scripts[1]!), "the shim must parse");
    assert.match(html, /Simulated — no core, no model, nothing stored/);
  });

  it("ships no shim when it is not simulated", () => {
    // The banner is the whole protection against a demo being mistaken for the
    // product; a real desk must never carry it, and never carry the shim.
    const html = renderDeskHtml(view());
    assert.equal([...html.matchAll(/<script>/g)].length, 2);
    assert.ok(!html.includes("Simulated —"));
  });
});

describe("the script the page actually ships", () => {
  it("parses as JavaScript", () => {
    // The client is a template literal, so one stray backtick in a comment ends
    // the string early and ships a broken page. That happened: a comment written
    // as `waiting` closed the template. Nothing about the page's shape catches
    // it, and the failure is total — no drag, no poll, no panel.
    const html = renderDeskHtml(view());
    const script = html.slice(
      html.lastIndexOf("<script>") + 8,
      html.lastIndexOf("</script>"),
    );
    assert.ok(
      script.length > 1000,
      "the client script should be shipped whole",
    );
    assert.doesNotThrow(
      () => new Function(script),
      "the shipped client must parse",
    );
  });

  it("carries no unresolved template interpolation", () => {
    // `${...}` inside the client would be evaluated at build time by the outer
    // template, not at run time by the browser — silently producing a different
    // program from the one written.
    const html = renderDeskHtml(view());
    const script = html.slice(
      html.lastIndexOf("<script>") + 8,
      html.lastIndexOf("</script>"),
    );
    assert.ok(
      !script.includes("${"),
      "the client must not contain template interpolation",
    );
  });
});

/**
 * Semantic zoom, the proposed menu and motion, as they reach the page.
 *
 * The motion assertion is the one worth having. `layout.ts` guarantees the
 * system never re-arranges what a person touched, and that guarantee is
 * currently invisible — you cannot see that your arrangement is safe, you can
 * only fail to notice it being destroyed. A pinned node with no transition is
 * how the page says it, so a rule that silently dropped `.pinned{transition:none}`
 * would make a placed document animate under its owner's hands.
 */
describe("what the page says without being read", () => {
  it("puts the digest on the panel, with the window it covers", () => {
    const html = renderDeskHtml(view());
    assert.match(html, /class="digest"/);
    // Rule 1 of the sampling argument: a projection declares its window.
    assert.match(html, /covering/);
  });

  it("ships the menu with the cost of each action beside it", () => {
    const html = renderDeskHtml(view());
    // Both labels must exist in the shipped client: an action that cannot state
    // its cost is not offerable, so neither branch may be dead code.
    assert.match(html, /spends a model call/);
    assert.match(html, /'free'/);
    assert.match(html, /\.menu \.mc\.spends/);
    assert.match(html, /\.menu \.mc\.free/);
  });

  it("does not animate a document its owner placed", () => {
    const html = renderDeskHtml(view());
    assert.match(html, /\.docnode\{transition:left/);
    assert.match(html, /\.docnode\.pinned,\.acube\.pinned\{transition:none\}/);
  });

  it("honours a reader who asked for less motion", () => {
    assert.match(renderDeskHtml(view()), /prefers-reduced-motion/);
  });

  it("keeps a digest built from a flow's own numbers, not a template", () => {
    const html = renderDeskHtml(view());
    // The fixture's one flow has a single recorded attempt on step 0.
    assert.match(html, /1 attempt/);
  });
});

describe("the new panel cannot be a way in", () => {
  it("escapes a digest headline built from a hostile title", () => {
    const v = view();
    const html = renderDeskHtml({
      ...v,
      docs: v.docs.map((d) => ({
        ...d,
        digest: { ...d.digest, headline: '</script><img src=x onerror=alert(1)>' },
      })),
    });
    assert.ok(!html.includes("<img src=x onerror"));
  });

  it("escapes the evidence line of a proposed action", () => {
    const v = view();
    const html = renderDeskHtml({
      ...v,
      docs: v.docs.map((d) => ({
        ...d,
        actions: [
          {
            id: "x",
            label: "</script><b>label</b>",
            why: "</script><b>why</b>",
            spends: false,
            route: null,
            source: "state" as const,
          },
        ],
      })),
    });
    assert.ok(!html.includes("<b>label</b>"));
    assert.ok(!html.includes("<b>why</b>"));
  });
});
