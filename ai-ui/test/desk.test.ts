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
    assert.equal(scripts.length, 5, "state, shim, tour, client, mascot");
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

/**
 * The panel's own poll must not destroy what the panel is for.
 *
 * The desk re-reads every five seconds and re-renders the selection panel, which
 * rebuilds its innerHTML. An answer somebody **paid a model call for** therefore
 * vanished within five seconds of arriving, and a question typed slower than that
 * was erased mid-sentence — which makes the feature unusable rather than merely
 * annoying.
 *
 * Found by using it against a live core, not by reading the code. These assert
 * the shipped client keeps the state across a re-render.
 */
describe("an answer survives the five-second poll", () => {
  const client = () => {
    const html = renderDeskHtml(view());
    return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).join("\n");
  };

  it("keeps answers per flow rather than in the DOM it rebuilds", () => {
    const js = client();
    assert.match(js, /const asked = \{\}/);
    // Restored on render, or the rebuild wins.
    assert.match(js, /const kept = asked\[doc\.id\]/);
    assert.match(js, /q\.value = kept\.q/);
  });

  it("keeps a half-typed question too", () => {
    // The worse half of the bug: you could not type a question slowly enough to
    // finish it.
    assert.match(client(), /q\.oninput/);
  });

  it("records the answer at the same moment it is shown", () => {
    // A `show` that writes the DOM without recording would pass the two tests
    // above and still lose every answer.
    assert.match(client(), /asked\[doc\.id\] = \{ q: question, html: html \}/);
  });
});

/**
 * The answer is displayed as text, and the model does not always cooperate.
 *
 * The prompt asks for plain prose and the model mostly complies — but "mostly"
 * means the page is correct at a *rate*, and the failure lands as literal
 * asterisks and backticks in front of the reader. Seen on a live instance after
 * the prompt constraint was already in place, which is why the fix is on this
 * side and deterministic.
 */
describe("markup the panel does not render is removed, not hoped away", () => {
  /** Evaluate the helper exactly as the page ships it, escaping included. */
  const shippedPlain = () => {
    const js = [...renderDeskHtml(view()).matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1]!)
      .join("\n");
    const m = js.match(/const plain = \(s\) => String[\s\S]*?;\n/);
    assert.ok(m, "the page must ship a plain() helper");
    return eval(
      "(" + m[0]!.replace(/^const plain = /, "").replace(/;\n$/, "") + ")",
    ) as (s: string) => string;
  };

  it("removes emphasis markers and code ticks", () => {
    const plain = shippedPlain();
    assert.equal(plain("a **bold** word"), "a bold word");
    assert.equal(plain("path `/root/x.txt` here"), "path /root/x.txt here");
    assert.equal(plain("**b** and `c`"), "b and c");
  });

  it("leaves the text between the markers untouched", () => {
    // The distinction from parsing markdown: no structure is interpreted and
    // nothing becomes HTML. Only the markers go.
    const plain = shippedPlain();
    assert.equal(plain("plain text"), "plain text");
    assert.equal(plain("2 * 3 * 4"), "2 * 3 * 4");
  });

  it("still escapes what it stripped markers from", () => {
    // Stripping must not become a way in: the result is escaped afterwards.
    const html = renderDeskHtml(view());
    assert.match(html, /escape_\(plain\(r\.answer\)\)/);
  });
});

/**
 * Play — the demo driving itself.
 *
 * Two properties are worth holding. The tour must **never reach the product**,
 * because a thing that moves a person's documents around on its own is not a
 * feature. And it must drive the real client rather than animate a picture of
 * one — a scripted movie of a product is a second implementation, and it goes on
 * looking right for exactly as long as nobody checks.
 */
describe("the guided tour", () => {
  it("is absent from the real desk", () => {
    const html = renderDeskHtml(view());
    assert.ok(!html.includes("tourbar"), "the product must not ship a tour");
    assert.ok(!html.includes("Play"));
  });

  it("ships with the demo", () => {
    const html = renderDeskHtml({ ...view(), simulate: true });
    assert.match(html, /tourbar/);
    assert.match(html, /▶ Play/);
  });

  it("parses as JavaScript", () => {
    // Same trap as the client and the shim: these are String.raw templates and
    // one stray backtick ends them early.
    const html = renderDeskHtml({ ...view(), simulate: true });
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    assert.equal(scripts.length, 5, "state, shim, tour, client, mascot");
    for (const [i, s] of scripts.entries())
      assert.doesNotThrow(() => new Function(s), `script ${i} does not parse`);
  });

  it("drives the real client with real events rather than drawing a movie", () => {
    const js = renderDeskHtml({ ...view(), simulate: true });
    // The drag is three real pointer events on the real cube.
    assert.match(js, /new PointerEvent\('pointerdown'/);
    assert.match(js, /new PointerEvent\('pointermove'/);
    assert.match(js, /new PointerEvent\('pointerup'/);
    // And the buttons are the page's own.
    assert.match(js, /document\.getElementById\('adv'\)/);
    assert.match(js, /document\.getElementById\('qgo'\)/);
  });

  it("yields to a real gesture, and cannot stop itself", () => {
    // `isTrusted` is false for everything the tour dispatches, so the guard
    // distinguishes the person from the tour. Without it the first synthetic
    // pointerdown would halt the tour it belongs to.
    const js = renderDeskHtml({ ...view(), simulate: true });
    assert.match(js, /if \(e\.isTrusted\) halt\(\)/);
  });
});

/**
 * The mascot.
 *
 * Two properties, and they are the two that decide whether a companion is a
 * feature or the paperclip. It must **never reach the product** — a thing that
 * walks around somebody's real documents, or fetches half a gigabyte from a CDN,
 * is not something a desk ships by default. And it must **fetch nothing until
 * asked**: the page's standing claim is that it makes no external request, and
 * the only honest way to keep that while offering a model is to make the request
 * the consequence of a press.
 */
describe("the mascot", () => {
  it("does not exist on the product's page", () => {
    const html = renderDeskHtml(view());
    // Matched on markers rather than the substring "cubi", which the desk's own
    // `cubic-bezier` transitions contain. A guard that fires on the product's
    // stylesheet gets deleted, and then it guards nothing.
    assert.ok(!html.includes("cubisay"), "the product must not ship a mascot");
    assert.ok(!html.includes("cubiRemarks"), "nor its brain");
    assert.ok(!html.includes("esm.run"), "the product must not reach a CDN");
  });

  it("is on the demo, with its balloon and its cube", () => {
    const html = renderDeskHtml({ ...view(), simulate: true });
    assert.match(html, /wrap\.className = 'cubi'/);
    assert.match(html, /\.cubisay\{/);
    // It is the agent cube, not a character: same amber the shelf draws agents
    // in, so the mascot reads as a member of the notation rather than a guest.
    assert.match(html, /--cubi,#e0a020/);
  });

  it("reaches the network only behind a press", () => {
    // Not "it has a button": the import must be inside the handler. A top-level
    // import would download the model on load and the cost notice would be a
    // label on a thing that already happened.
    const html = renderDeskHtml({ ...view(), simulate: true });
    const wake = /wakeBrain = async \(\) => \{[\s\S]*?\n  \};/.exec(html);
    assert.ok(wake, "wakeBrain must exist");
    assert.match(wake[0], /await import\('https:\/\/esm\.run/);
    assert.equal((html.match(/esm\.run/g) || []).length, 1);
  });

  it("stays quiet while the tour is talking", () => {
    const html = renderDeskHtml({ ...view(), simulate: true });
    assert.match(html, /window\.__TOUR__ = \{ running: false \}/);
    assert.match(html, /if \(window\.__TOUR__ && window\.__TOUR__\.running\) return/);
  });
});

/**
 * The creatures.
 *
 * The desk draws an agent as a body with eyes and legs, one per document it has
 * work in. Three properties are worth holding, and none of them can be seen from
 * a screenshot after the fact.
 */
describe("agents as creatures", () => {
  it("ships the rules it draws from, inside the client", () => {
    const html = renderDeskHtml(view());
    assert.match(html, /function agentInstances\(docs, name\)/);
    assert.match(html, /function agentDoing\(docs, name, flowId\)/);
    // Product-side, not a demo trick: an unsimulated desk draws them too.
    assert.match(html, /class="blk crt/);
    // And it draws them from the shared sprite. Two stylesheets is two species,
    // whatever the comments say -- that is how the mascot ended up looking like
    // a character standing next to a row of chips.
    assert.match(html, /\.crt \.eye\{/);
    assert.match(html, /\.crt \.leg\{/);
    assert.ok(
      !html.includes(".acube .blk i{"),
      "the desk must not keep a private sprite",
    );
  });

  it("reconciles rather than rebuilding, which is what makes motion possible", () => {
    // The old render emptied the surface every five seconds. Nothing could move,
    // because no element survived long enough to be moved -- every position
    // change was a new node appearing where the old one had been. If this line
    // ever comes back, the walk, the split and the merge all become teleports
    // again and nothing else in this suite would notice.
    const html = renderDeskHtml(view());
    assert.ok(
      !html.includes("querySelectorAll('.docnode,.acube').forEach((n) => n.remove())"),
      "the render must not clear the surface",
    );
    assert.match(html, /FLIP, first half/);
  });

  it("keeps the markdown stripper's escapes, which a plain template would eat", () => {
    // The client is String.raw + concatenation rather than one interpolated
    // template. In a plain template literal "\s" collapses to "s", and the rule
    // below would silently match a letter instead of whitespace.
    const html = renderDeskHtml(view());
    assert.ok(html.includes("(^|\\s)__(.+?)__(?=\\s|$)"), "the escape was eaten");
  });
});

describe("a click is not a drag", () => {
  it("ignores the tremor a hand makes while pressing a button", () => {
    // Clicking an agent that is already standing on a document used to drop it
    // there again -- POST /assign, a step appended, from a gesture the person
    // performed as a click. The guard is in the client, so this asserts the
    // shipped source carries it.
    const html = renderDeskHtml(view());
    assert.match(html, /if \(!drag\.moved\) \{/);
    assert.match(
      html,
      /Math\.abs\(ev\.clientX - drag\.x0\) \+ Math\.abs\(ev\.clientY - drag\.y0\) < 8/,
    );
  });

  it("writes nothing when a cube is put back on the document it came from", () => {
    // The other half of the same defect: past the threshold, a wobble over the
    // document an agent was already standing on appended a second step for it.
    // A drag that ends where it started is a change of mind, not an instruction.
    const html = renderDeskHtml(view());
    assert.match(html, /if \(flowId === d\.flow\) \{ select\('cube', d\.id\); render\(\); return; \}/);
  });
});

/**
 * Numbers, drawn.
 *
 * A step whose output is a waveform cannot be summarised in prose: "64 samples
 * returned, nothing clipped" is what a working stage says and what a stage that
 * returned 64 zeros says. The desk draws the shape, and never without the scale.
 */
describe("a step's numbers", () => {
  const withSeries = (series: number[]): DeskView => {
    const v = view();
    v.docs[0]!.steps = v.docs[0]!.steps.map((s, i) =>
      i === 0 ? { ...s, series } : s,
    );
    v.docs[0]!.trace.steps[0]!.series = series;
    return v;
  };

  it("is drawn with its peak beside it, so the scale cannot lie", () => {
    const html = renderDeskHtml(withSeries([0.2, 1, 0.4]));
    assert.match(html, /const spark = \(xs, w, h\)/);
    assert.match(html, /' values · peak '/);
  });

  it("says out loud when there is nothing in it", () => {
    // A bar chart normalised to its own maximum looks the same at 1.3 units and
    // at zero. The one case the reader must not have to squint at is the empty
    // one, so it is words rather than pixels.
    const html = renderDeskHtml(withSeries([0, 0, 0]));
    assert.match(html, /nothing here/);
    assert.match(html, /\.spark\.dead i\{background:#b03a2e\}/);
  });

  it("lets the handoff flag name the instrument that judged it", () => {
    const v = view();
    v.docs[0]!.trace.steps[0]!.ignoredInput = {
      carried: 0,
      inputTokens: 64,
      note: "its output does not move when its input does",
    };
    const html = renderDeskHtml(v);
    assert.match(html, /s\.ignoredInput\.note/);
    // And the old phrasing survives for the flows that were judged on prose.
    assert.match(html, /distinctive tokens it was handed/);
  });
});

/**
 * The living documents.
 *
 * The claim the panel makes is that read-only is a property of the document
 * rather than of the renderer, so these check the projection the desk ships
 * rather than the markup it draws from it.
 */
describe("living documents", () => {
  const channels = (html: string) =>
    JSON.parse(html.match(/window\.__DESK__ = (.*?);<\/script>/s)![1]!).channels;

  it("projects a running flow as a work document that is live", () => {
    const chs = channels(renderDeskHtml(view()));
    const work = chs.find((c: { kind: string }) => c.kind === "work");
    assert.equal(work.live, true, "a flow with a running step is live");
    assert.equal(work.writable, false);
  });

  it("gives the scope a chat and a log, and only the chat takes writing", () => {
    const chs = channels(renderDeskHtml(view()));
    const byKind = Object.fromEntries(
      chs.map((c: { kind: string; writable: boolean }) => [c.kind, c.writable]),
    );
    assert.equal(byKind.chat, true);
    assert.equal(byKind["project-log"], false);
  });

  it("uses ai-flows' own projection rather than a second one in the client", () => {
    // A second implementation of "who may write to this" is a second answer to
    // it, and the one on screen would be the untested one.
    const html = renderDeskHtml(view());
    assert.ok(
      !html.includes("kind === 'chat'"),
      "the client must not re-derive writability",
    );
    assert.match(html, /renderLive/);
  });
});

describe("the living documents are actually live", () => {
  it("takes writability from the module and liveness from the poll", () => {
    // The payload is built before the first poll, so a panel that took `live`
    // from it would list living documents that never come alive -- which is what
    // it did until somebody advanced a step and watched nothing happen.
    const html = renderDeskHtml({ ...view(), simulate: true });
    assert.match(html, /Policy from the module, liveness from the poll/);
    assert.match(html, /x\.state === 'running'/);
    // And the policy is still not re-derived.
    assert.ok(!html.includes("kind === 'chat'"));
  });
});

describe("the tour crossing a real scope change", () => {
  it("navigates rather than faking the switch, and resumes on the other side", () => {
    // Changing scope reloads, because that is what changing scope does against a
    // server. A tour that faked it to keep its own state would be the recording
    // this file exists not to be.
    const html = renderDeskHtml({ ...view(), simulate: true });
    assert.match(html, /sel\.dispatchEvent\(new Event\('change'/);
    assert.match(html, /sessionStorage/);
    assert.match(html, /ai-os\.tour\.resumeAt/);
  });

  it("uses sessionStorage, so yesterday's half-tour does not play at somebody", () => {
    // Use, not mention: the comment beside the code says why it is not
    // localStorage, and a test that banned the word would ban the explanation.
    const html = renderDeskHtml({ ...view(), simulate: true });
    assert.ok(!/localStorage\s*\./.test(html), "a tour must not outlive the tab");
    assert.match(html, /sessionStorage\.setItem/);
  });

  it("ends the tour gracefully when there is no memory scope to switch to", () => {
    // The product ships one scope at a time; a beat that assumed a second one
    // would throw on the desk it is most likely to run against.
    const html = renderDeskHtml({ ...view(), simulate: true });
    assert.match(html, /if \(!wanted\) return;/);
  });
});
