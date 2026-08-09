/**
 * The page had no tests at all, which is how a UI acquires an injection hole and
 * a legend that disagrees with the page it explains.
 *
 * These are not snapshot tests. A snapshot of an HTML page fails on every visual
 * change and therefore gets regenerated without being read, which is worse than
 * nothing. Each test below asserts one property the render must keep whatever it
 * looks like.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderViewHtml } from "../src/view.ts";
import type { Conformation } from "../src/conformation.ts";
import type { Attempt, FlowWithSteps, Step, StepState } from "../src/types.ts";

const T = 1_760_000_000_000;

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    id: "a1",
    stepId: "s1",
    n: 1,
    state: "done",
    runId: "run-abcdef123456",
    sessionId: null,
    error: null,
    observation: { digest: "cafebabe1234", source: "run.reply" },
    startedAt: T,
    finishedAt: T,
    ...over,
  } as Attempt;
}

function step(index: number, state: StepState, over: Partial<Step> = {}): Step {
  return {
    id: `s${index}`,
    flowId: "f1",
    index,
    intent: `step ${index}`,
    state,
    result: state === "done" ? `result ${index}` : null,
    attempts: [attempt({ id: `a${index}`, stepId: `s${index}` })],
    createdAt: T,
    updatedAt: T,
    ...over,
  };
}

function flow(over: Partial<FlowWithSteps> = {}): FlowWithSteps {
  return {
    id: "f1",
    scopeId: "personal:U1",
    actorId: "U1",
    title: "a flow",
    goal: "do the thing",
    shape: "sequence",
    state: "waiting",
    forkedFrom: null,
    createdAt: T,
    updatedAt: T,
    steps: [step(0, "done"), step(1, "running"), step(2, "pending")],
    ...over,
  } as FlowWithSteps;
}

const CONFORMATION: Conformation = {
  at: T,
  harness: "pi",
  digest: "deadbeef0000",
  scopes: [
    {
      scopeId: "org:acme",
      kind: "org",
      ref: "acme",
      role: "system",
      agents: [
        {
          name: "SystemAgent",
          path: "agents/SystemAgent.md",
          description: "orchestrates",
          tools: ["read", "write"],
          ok: true,
          inert: false,
          subagents: ["Helper"],
        },
        {
          name: "Helper",
          path: "agents/Helper.md",
          description: "helps",
          tools: ["read"],
          ok: true,
          inert: false,
          subagents: [],
        },
      ],
      skills: [],
      hasMemory: false,
      membershipInFolders: [],
    },
    {
      scopeId: "group:web-project-1",
      kind: "group",
      ref: "web-project-1",
      role: "project",
      projectId: "1",
      roster: { version: "v1", members: ["matias", "ada"] },
      agents: [],
      skills: ["s1"],
      hasMemory: true,
      membershipInFolders: [],
    },
  ],
  edges: [{ from: "matias", to: "SystemAgent", messages: 3, via: "delegate", scopeId: "org:acme" }],
  holes: [{ question: "who is in a channel?", why: "no roster port answers channels", scopeId: "channel:x" }],
} as unknown as Conformation;

describe("what the page must not do", () => {
  it("escapes every field an operator does not control", () => {
    // A flow title comes from a user turn. Rendering it raw makes the page that
    // reports on the system a way to attack whoever opens it.
    const html = renderViewHtml({
      flows: [flow({ title: "<script>alert(1)</script>", goal: "a & b \"quoted\"" })],
      at: T,
    });
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("a &amp; b"));
  });

  it("makes no external request", () => {
    // "Open it from a file over a coffee, days later, with no server running" is
    // the requirement. One webfont or CDN link silently breaks it, and it breaks
    // exactly when nobody is around to notice.
    const html = renderViewHtml({ flows: [flow()], conformation: CONFORMATION, at: T });
    const external = html.match(/(?:src|href)\s*=\s*"(?!#)[^"]*"/g) ?? [];
    assert.deepEqual(external, [], `expected no external references, found: ${external.join(", ")}`);
    assert.ok(!/@import|url\(/.test(html));
  });

  it("offers nothing to click", () => {
    // The page is M5's control arm: it is evidence only while it stays inert.
    // A button added "just for convenience" turns the comparison into a test of
    // two canvases.
    const html = renderViewHtml({ flows: [flow()], conformation: CONFORMATION, at: T });
    for (const tag of ["<button", "<a ", "<form", "<input", "onclick", "<script"]) {
      assert.ok(!html.includes(tag), `page should contain no ${tag}`);
    }
  });
});

describe("the progress strip", () => {
  it("draws exactly one cube per step", () => {
    // The strip replaced "5/8 steps done" because it shows WHERE the unfinished
    // steps are. It only does that while it is one cube per step.
    const f = flow({ steps: [step(0, "done"), step(1, "done"), step(2, "failed"), step(3, "pending")] });
    const html = renderViewHtml({ flows: [f], at: T });
    const strip = html.match(/<span class="strip">(.*?)<\/span><\/span>/s)?.[1] ?? "";
    assert.equal((strip.match(/class="cube"/g) ?? []).length, 4);
  });

  it("colours a failed step differently from a done one", () => {
    const html = renderViewHtml({ flows: [flow({ steps: [step(0, "done"), step(1, "failed")] })], at: T });
    assert.ok(html.includes("--c:#3f8f3f"), "done should be green");
    assert.ok(html.includes("--c:#b03a2e"), "failed should be red");
  });
});

describe("the legend", () => {
  it("names every state colour the page can draw", () => {
    // A legend maintained apart from the styles goes wrong silently, and a wrong
    // legend on a page whose premise is "colour carries the meaning" is worse
    // than no colour.
    const f = flow({
      state: "blocked",
      steps: [step(0, "done"), step(1, "running"), step(2, "pending"), step(3, "failed")],
    });
    const html = renderViewHtml({ flows: [f], conformation: CONFORMATION, at: T });
    const key = html.slice(html.indexOf('<div class="key">'), html.indexOf("The System"));
    for (const word of ["done", "running", "pending", "failed", "blocked", "agent", "subagent", "system", "project"]) {
      assert.ok(key.includes(word), `legend is missing "${word}"`);
    }
  });

  it("explains every colour the page can draw", () => {
    // The invariant, rather than a hand-kept list of words: a state added to
    // STATE_COLORS and left out of the legend is a colour on the page that
    // nothing explains, which is the precise failure a legend exists to prevent.
    const f = flow({ steps: [step(0, "done"), step(1, "running"), step(2, "failed")] });
    const html = renderViewHtml({ flows: [f], conformation: CONFORMATION, at: T });
    const key = html.slice(html.indexOf('<div class="key">'), html.indexOf("The System"));
    const drawn = new Set((html.match(/--c:(#[0-9a-f]{6})/g) ?? []).map((m) => m.slice(4)));
    const explained = new Set((key.match(/--c:(#[0-9a-f]{6})/g) ?? []).map((m) => m.slice(4)));
    const unexplained = [...drawn].filter((c) => !explained.has(c));
    assert.deepEqual(unexplained, [], `colours drawn but not in the legend: ${unexplained.join(", ")}`);
  });
});

describe("what a person coming back cold has to see", () => {
  it("shows every scope, its roster and its agent tree", () => {
    const html = renderViewHtml({ flows: [], conformation: CONFORMATION, at: T });
    assert.ok(html.includes("org:acme"));
    assert.ok(html.includes("group:web-project-1"));
    assert.ok(html.includes("matias") && html.includes("ada"));
    assert.ok(html.includes("SystemAgent") && html.includes("Helper"));
  });

  it("separates what is still moving from what has settled", () => {
    const html = renderViewHtml({
      flows: [flow({ id: "f1", title: "still going", state: "waiting" }), flow({ id: "f2", title: "finished", state: "done" })],
      at: T,
    });
    const inTray = html.indexOf("In tray");
    const outTray = html.indexOf("Out tray");
    assert.ok(inTray > 0 && outTray > inTray);
    assert.ok(html.indexOf("still going") > inTray && html.indexOf("still going") < outTray);
    assert.ok(html.indexOf("finished") > outTray);
  });

  it("shows the holes rather than rendering cleanly without them", () => {
    const html = renderViewHtml({ flows: [], conformation: CONFORMATION, at: T });
    assert.ok(html.includes("who is in a channel?"));
    assert.ok(html.includes("no roster port answers channels"));
  });

  it("says so when there was no conformation, instead of showing an empty system", () => {
    // An empty page and a page that could not ask look identical, and only one of
    // them means the system is empty.
    const html = renderViewHtml({ flows: [flow()], at: T });
    assert.ok(html.includes("No conformation was projected"));
  });

  it("puts a step that used nothing it was given on the flow's face", () => {
    const f = flow({
      steps: [
        // Long enough to clear MIN_INPUT_TOKENS: below that, contribution.ts
        // correctly refuses to judge rather than guessing.
        step(0, "done", {
          result:
            "the ledger table needs a currency column typed decimal precision twelve scale two, " +
            "backfilled from settlement records, indexed alongside merchant identifier and posting timestamp",
        }),
        step(1, "done", { intent: "use the above", result: "ok" }),
      ],
    });
    const html = renderViewHtml({ flows: [f], at: T });
    assert.ok(html.includes("used nothing they were given"));
  });
});
