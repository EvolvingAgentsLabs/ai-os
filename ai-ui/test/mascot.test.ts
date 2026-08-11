/**
 * Cubi's brain.
 *
 * The three functions under test ship as source text, because they run in a page
 * with no build step. A test that re-implemented them in TypeScript would be
 * testing a copy — the exact failure [simulate.ts](../src/simulate.ts) exists to
 * avoid — so this **executes the shipped string** and calls what comes out.
 *
 * The state it feeds them is built by the product's own projection
 * (`traceOf`, `digestOf`, `actionsFor`) over the demo world, for the same
 * reason: a hand-written digest in a fixture drifts from the one the server
 * makes, and then the brain is tested against a shape nobody ships.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRAIN_JS, MASCOT_JS } from "../src/mascot.ts";
import { DEMO_AT, demoWorld } from "../src/simulate.ts";
import { traceOf } from "../src/trace.ts";
import { digestOf } from "../src/zoom.ts";
import { actionsFor } from "../src/actions.ts";
import { agentOfIntent } from "../src/server.ts";

type Remark = {
  id: string;
  pri: number;
  tone: string;
  en: { say: string; why: string };
  es: { say: string; why: string };
};
type Brain = {
  cubiRemarks: (
    state: unknown,
    ctx: Record<string, unknown>,
  ) => { all: Remark[]; fresh: Remark[] };
  cubiFacts: (state: unknown, docId: string) => string;
  cubiUngrounded: (answer: string, facts: string) => string[];
};

/** The shipped source, executed. Not a paraphrase of it. */
const brain: Brain = new Function(
  `${BRAIN_JS}\nreturn { cubiRemarks, cubiFacts, cubiUngrounded };`,
)() as Brain;

/** The demo world, projected the way the server projects it. */
const worldState = (
  over: { steps?: unknown[]; state?: string; done?: number } = {},
) => {
  const w = demoWorld();
  const docs = w.docs.map((d, i) => {
    const raw = { ...(d as Record<string, unknown>) };
    if (i === 0) Object.assign(raw, over);
    const trace = traceOf(
      raw["steps"] as Parameters<typeof traceOf>[0],
      agentOfIntent,
    );
    const digest = digestOf(
      {
        flowId: raw["id"] as string,
        title: raw["title"] as string,
        state: raw["state"] as string,
        updatedAt: raw["updatedAt"] as number,
        trace,
      },
      "step",
      DEMO_AT,
    );
    return {
      ...raw,
      trace,
      digest,
      actions: actionsFor({
        flowId: raw["id"] as string,
        state: raw["state"] as string,
        digest,
        trace,
        availableAgents: w.agents.map((a) => a["name"] as string),
      }),
    };
  });
  return { docs, agents: w.agents };
};

const step = (
  index: number,
  agent: string,
  state: string,
  result: string | null,
) => ({
  index,
  state,
  agent,
  intent: `Call your \`delegate\` tool with agent="${agent}". The task: rewrite the ledger`,
  result,
  attempts: result
    ? [
        {
          n: 1,
          state: "done",
          runId: `run-${index}`,
          error: null,
          digest: `d00${index}`,
          source: "run.reply",
        },
      ]
    : [],
});

const ids = (rs: Remark[]) => rs.map((r) => r.id);

describe("what Cubi says", () => {
  it("says nothing has run when nothing has, and says how it knows", () => {
    const s = worldState();
    const r = brain.cubiRemarks(s, {
      event: "select-doc",
      docId: "flow-duplicates",
    });
    assert.equal(r.fresh[0]!.id, "never-ran");
    assert.match(r.fresh[0]!.en.why, /0 attempts across 1 step/);
    assert.match(r.fresh[0]!.es.say, /Acá no corrió nada/);
  });

  it("names the unrun step rather than the goal when work is half done", () => {
    const s = worldState();
    const r = brain.cubiRemarks(s, {
      event: "select-doc",
      docId: "flow-ledger",
    });
    const top = r.fresh[0]!;
    assert.equal(top.id, "not-verified");
    assert.match(top.en.say, /ReviewAgent has not run/);
    // The goal reads like an answer. It must never be what Cubi repeats back.
    assert.doesNotMatch(top.en.say, /every amount carries its currency/);
  });

  it("leads with the step that ran and carried nothing forward", () => {
    // The demo's finding, produced by the real instrument: ReviewAgent settles
    // with "Looks fine to me." and shares no distinctive word with step 1.
    const s = worldState({
      state: "waiting",
      steps: [
        step(
          0,
          "SchemaAgent",
          "done",
          "The ledger table needs a currency column, decimal precision twelve scale two, backfilled from settlement records and indexed alongside merchant identifier.",
        ),
        step(
          1,
          "MigrationAgent",
          "done",
          "Rewrote /root/workspace/ledger.txt to ledger_with_currency.txt. Every amount now carries its USD prefix; column spacing preserved exactly.",
        ),
        step(2, "ReviewAgent", "done", "Looks fine to me."),
      ],
    });
    const r = brain.cubiRemarks(s, {
      event: "select-doc",
      docId: "flow-ledger",
    });
    assert.equal(r.fresh[0]!.id, "ignored");
    assert.match(r.fresh[0]!.en.say, /ReviewAgent ran, settled/);
    assert.match(r.fresh[0]!.en.why, /Carried 0% of \d+ distinctive tokens/);
  });

  it("lets a finding outrank its own news about the step that just ran", () => {
    // Advancing is the press most likely to expose something. If "that was a
    // real step" outranked the finding, the demo would announce the gesture and
    // swallow the result of it -- which is what it did until this test existed.
    const s = worldState({
      state: "waiting",
      steps: [
        step(
          0,
          "SchemaAgent",
          "done",
          "The ledger table needs a currency column, decimal precision twelve scale two, backfilled from settlement records and indexed alongside merchant identifier.",
        ),
        step(1, "ReviewAgent", "done", "Looks fine to me."),
      ],
    });
    const r = brain.cubiRemarks(s, { event: "advance", docId: "flow-ledger" });
    assert.equal(r.fresh[0]!.id, "ignored");
    assert.ok(ids(r.all).includes("advanced"));
  });

  it("calls a declared agent with no file behind it what it is", () => {
    const s = worldState();
    const r = brain.cubiRemarks(s, {
      event: "select-agent",
      agentName: "AnomalyScanner",
    });
    assert.equal(r.fresh[0]!.id, "missing-agent");
    assert.match(r.fresh[0]!.en.say, /A name is a claim; a file is a fact/);
  });

  it("does not repeat itself: what it has said is filtered out", () => {
    const s = worldState();
    const ctx = { event: "select-doc", docId: "flow-ledger", seen: [] as string[] };
    const first = brain.cubiRemarks(s, ctx).fresh[0]!;
    ctx.seen = [first.id];
    const second = brain.cubiRemarks(s, ctx).fresh[0]!;
    assert.notEqual(second.id, first.id);
    // The remark is filtered from `fresh`, not deleted: `all` still carries it,
    // so a caller with nothing fresh left can fall back rather than go silent.
    assert.ok(ids(brain.cubiRemarks(s, ctx).all).includes(first.id));
  });

  it("has both languages on every remark it can produce", () => {
    const s = worldState();
    const every = [
      { event: "greet" },
      { event: "select-doc", docId: "flow-ledger" },
      { event: "select-doc", docId: "flow-duplicates" },
      { event: "select-agent", agentName: "AnomalyScanner" },
      { event: "select-agent", agentName: "SchemaAgent" },
      { event: "assign" },
      { event: "advance" },
      { event: "trace" },
      { event: "idle" },
    ].flatMap((ctx) => brain.cubiRemarks(s, ctx).all);
    assert.ok(every.length >= 10, `only ${every.length} remarks reachable`);
    for (const r of every) {
      for (const lang of ["en", "es"] as const) {
        assert.ok(r[lang].say.length > 20, `${r.id}.${lang}.say is thin`);
        assert.ok(r[lang].why.length > 3, `${r.id}.${lang}.why is missing`);
      }
      // A "translation" that is the English string is the bug this catches: the
      // toggle looks wired and changes nothing.
      assert.notEqual(r.es.say, r.en.say, `${r.id} is not translated`);
    }
  });
});

describe("the fact sheet a model may speak from", () => {
  it("carries the trace and refuses to carry the goal", () => {
    const facts = brain.cubiFacts(worldState(), "flow-ledger");
    assert.match(facts, /STEP 2 ReviewAgent: pending, never attempted/);
    assert.match(facts, /STATE: waiting, 2 of 3 steps done/);
    assert.match(facts, /DIGEST: .*stands for 2 attempt/);
    // The whole claim the page makes. A fact sheet containing the goal would let
    // a model answer "what did this produce?" out of somebody's intention.
    assert.doesNotMatch(facts, /rewrite the ledger so every amount/);
  });

  it("clips a long result rather than handing over three paragraphs", () => {
    const long = "x".repeat(400);
    const s = worldState({ steps: [step(0, "SchemaAgent", "done", long)] });
    const facts = brain.cubiFacts(s, "flow-ledger");
    assert.ok(facts.length < 900, `fact sheet is ${facts.length} chars`);
    assert.match(facts, /…/);
  });

  it("says so when no flow is selected, rather than inventing one", () => {
    const facts = brain.cubiFacts(worldState(), "no-such-flow");
    assert.match(facts, /No flow is selected/);
    assert.match(facts, /Ledger currency rewrite/);
  });
});

describe("the grounding check", () => {
  const facts = "STEP 2 ReviewAgent: pending, never attempted. 3 steps done.";

  it("catches a number the facts do not contain", () => {
    assert.deepEqual(
      brain.cubiUngrounded("It ran 12 times across 3 steps.", facts),
      ["12"],
    );
  });

  it("catches an agent name nobody declared", () => {
    assert.deepEqual(
      brain.cubiUngrounded("ReviewAgent waited for CurrencyBot.", facts),
      ["CurrencyBot"],
    );
  });

  it("does not fire on a capitalised first word", () => {
    assert.deepEqual(
      brain.cubiUngrounded("Nothing has run. The step is pending.", facts),
      [],
    );
  });

  it("passes an answer built only from the facts", () => {
    assert.deepEqual(
      brain.cubiUngrounded("ReviewAgent is pending and was never attempted.", facts),
      [],
    );
  });

  it("reports each invention once, however often it is repeated", () => {
    assert.deepEqual(
      brain.cubiUngrounded("99 rows, then 99 rows again, per BatchAgent.", facts),
      ["99", "BatchAgent"],
    );
  });
});

describe("the page it ships as", () => {
  it("parses as JavaScript", () => {
    // The brain is embedded in the mascot, which is embedded in the page. A
    // stray backtick in a comment inside a String.raw block ships a page whose
    // last script tag never runs, and nothing else in this suite would notice.
    assert.doesNotThrow(() => new Function(MASCOT_JS));
  });

  it("carries no unresolved template holes", () => {
    assert.doesNotMatch(MASCOT_JS, /\$\{/);
  });

  it("reaches the network in exactly one place, and it is opt-in", () => {
    const urls = MASCOT_JS.match(/https?:\/\/[^'"\s)]+/g) || [];
    assert.deepEqual(urls, ["https://esm.run/@mlc-ai/web-llm"]);
    assert.match(MASCOT_JS, /cubiwake/);
  });
});
