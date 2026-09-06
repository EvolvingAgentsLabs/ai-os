/**
 * Write the playable demo as one self-contained HTML file.
 *
 *   cd ai-ui && node scripts/build-demo.ts --out ../../evolvingagentslabs.github.io/demo/index.html
 *
 * The output is the **real desk client** with an in-page fake backend
 * ([simulate.ts](../src/simulate.ts)). It is generated rather than hand-written
 * for one reason: a demo maintained separately from the product stops being true
 * within a week, quietly, while continuing to look right. Regenerate it whenever
 * the desk changes, and it cannot drift.
 *
 * No server, no database, no model. Open the file.
 */
import { writeFileSync } from "node:fs";
import { type DeskDoc, renderDeskHtml } from "../src/desk.ts";
import { digestOf } from "../src/zoom.ts";
import { actionsFor } from "../src/actions.ts";
import { DEMO_AT, demoWorld } from "../src/simulate.ts";
import { dspAgents, dspFlows } from "../src/dsp-demo.ts";
import { memoryAgents, memoryFlows } from "../src/memory-demo.ts";
import { cochleaAgents, cochleaFlows } from "../src/cochlea-demo.ts";
import { cochleaProjectFlows } from "../src/cochlea-project.ts";
import { hemoAgents, hemoFlows } from "../src/hemo-demo.ts";
import { channelsFor, workChannel } from "../../ai-flows/src/channels.ts";
import { propose } from "../src/layout.ts";
import { MEMORY_LEVELS } from "../src/memory.ts";
import { traceOf } from "../src/trace.ts";
import { agentOfIntent } from "../src/server.ts";

const outIdx = process.argv.indexOf("--out");
const out = outIdx >= 0 ? process.argv[outIdx + 1]! : "demo.html";

const world = demoWorld();

/**
 * Project one scope's raw flows the way the server would.
 *
 * Both scopes go through this, so the signal lab is built by the product's own
 * trace, digest and menu code rather than by anything that knows what a Fourier
 * transform is. That is the claim the second scope exists to make, and building
 * it any other way would quietly withdraw it.
 */
function projectDocs(
  rawDocs: Array<Record<string, unknown>>,
  agentNames: string[],
): DeskDoc[] {
  return rawDocs.map((d) => {
    const raw = d as unknown as Omit<DeskDoc, "trace" | "digest" | "actions"> & {
      steps: Parameters<typeof traceOf>[0];
    };
    const trace = traceOf(raw.steps, agentOfIntent);
    const digest = digestOf(
      { flowId: raw.id, title: raw.title, state: raw.state, updatedAt: raw.updatedAt, trace },
      "step",
      DEMO_AT,
    );
    return {
      ...raw,
      trace,
      digest,
      actions: actionsFor({
        flowId: raw.id,
        state: raw.state,
        digest,
        trace,
        availableAgents: agentNames,
      }),
    };
  });
}

const layoutFor = (
  scopeId: string,
  rawDocs: Array<Record<string, unknown>>,
  agentNames: string[],
) =>
  propose(
    {
      scopeId,
      flows: rawDocs.map((d) => ({
        id: d["id"] as string,
        title: d["title"] as string,
        state: d["state"] as string,
        agents: (d["steps"] as Array<{ agent: string }>).map((s) => s.agent),
      })),
      agents: agentNames,
    },
    null,
    // A little wider than the default: the demo is embedded, and two documents
    // side by side is the picture. A third row would need scrolling nobody does.
    { width: 1180 },
  );

/**
 * The system agent, in every scope.
 *
 * ## Why it is an agent and not a feature
 *
 * The desk could have grown an "explain this" button. It would have been less
 * code and it would have been the wrong shape, because a button is a capability
 * of the tool and this is a *participant*: `INSPECTOR` has a name, a file, a
 * declared set of tools, and it shows up on the desk next to the agents whose
 * work it reads. If it could do something no other agent could, the claim
 * "everything is an agent" would be decoration on a special case.
 *
 * Its tool list is the argument in miniature. `read` and nothing else: it may
 * open what it is pointed at, and it may not run anything, write anything, or
 * publish anything. An inspector that could change what it inspects is not an
 * inspector.
 */
const INSPECTOR = {
  name: "INSPECTOR",
  description:
    "Reads a hop, an agent or a flow and says what the record supports — and says unknown when the record supports nothing.",
  tools: ["read"],
  child: false,
  missing: false,
};

/** The signal lab: the same desk, on numbers instead of prose. */
const dsp = {
  scopeId: "group:signal-lab",
  agents: [...dspAgents(), INSPECTOR],
  raw: dspFlows(DEMO_AT) as unknown as Array<Record<string, unknown>>,
};

// The same projection the server does, so the first frame of the demo is built
// by the product's own code rather than written by hand.
//
// Typed as `DeskDoc[]` rather than cast to `never`. The cast that used to be
// here is why adding a required field to `DeskDoc` did not fail this script:
// the demo would have shipped documents with no digest and no menu, and the
// only symptom would have been a page that looked slightly emptier than the
// product. A cast that silences the compiler on the one file nobody runs in CI
// is the drift this repository keeps finding by hand.
const docs: DeskDoc[] = projectDocs(
  world.docs,
  world.agents.map((a) => a["name"] as string),
);

const layout = layoutFor(
  "group:web-project-demo",
  world.docs,
  world.agents.map((a) => a["name"] as string),
);

/**
 * The cochlea lab: the same desk, on a research project with an external oracle.
 *
 * The other three scopes are about whether a step did its work. This one is about
 * whether a *result* may be published: two identical-looking chains, one frozen
 * and one held at `blocked` by a gate. Its numbers come from an independent
 * eigensolver in `cochlea-demo.ts` and are checked against the Python suite in
 * `projects/coclea-sr/` by `test/cochlea-demo.test.ts`, so neither half can drift
 * from the other.
 */
const coc = {
  scopeId: "group:cochlea-lab",
  agents: [...cochleaAgents(), ...projectAgents(), INSPECTOR],
  /**
   * The two gate flows first, then the three that show the project being built
   * rather than judged.
   *
   * This order is reversed from what it was, and the reason is the layout rather
   * than recency. A document is now as tall as its flow is long, so three per row
   * is what fits, and whatever comes fourth lands below the fold behind the Play
   * bar. The two membrane chains — visibly identical, one frozen, one held at a
   * red gate — are the single picture this whole scope exists to show, and they
   * were the two that fell off the bottom.
   *
   * "Newest first" was a good rule for a list. It is the wrong rule for a
   * surface where position decides what a visitor sees at all.
   */
  raw: [...cochleaFlows(DEMO_AT), ...cochleaProjectFlows(DEMO_AT)] as unknown as Array<
    Record<string, unknown>
  >,
};

/**
 * The two roles the project half needs and the gate half does not.
 *
 * `INDEXER` and `COVERAGE-AUDITOR` are `group:memory-lab`'s agents, working here
 * on this project's own decisions. Naming them the same thing is the point: the
 * memory agents are not a feature of the memory scope, they are agents, and a
 * research project is a corpus like any other.
 */
function projectAgents() {
  return [
    {
      name: "INDEXER",
      description:
        "Writes one note per decision against an index that has to keep fitting a small window.",
      tools: ["read", "write"],
      child: true,
      missing: false,
    },
    {
      name: "COVERAGE-AUDITOR",
      description:
        "Asks what a reader would be told. Lints the index, and knows the corpus has an order.",
      tools: ["read"],
      child: true,
      missing: false,
    },
  ];
}

/** The knowledge base being built: the same desk, pointed at reading. */
const mem = {
  scopeId: "group:memory-lab",
  agents: [...memoryAgents(), INSPECTOR],
  raw: memoryFlows(DEMO_AT) as unknown as Array<Record<string, unknown>>,
};

/**
 * The second real project: the one where truth is not derivable.
 *
 * See [hemo-demo.ts](../src/hemo-demo.ts) for why two projects rather than one.
 * In short: the cochlea scope shows what to do when the answer has a closed
 * form, and a repository that only showed that half would be making a claim
 * about a narrow world. This is the other half — no oracle exists, so the judge
 * itself is measured and the measurement is published with the hash of what
 * produced it.
 */
const hem = {
  scopeId: "group:hemo-verified",
  agents: [...hemoAgents(), INSPECTOR],
  raw: hemoFlows(DEMO_AT) as unknown as Array<Record<string, unknown>>,
};

const dspNames = dsp.agents.map((a) => a.name);
const dspDocs = projectDocs(dsp.raw, dspNames);
const dspLayout = layoutFor(dsp.scopeId, dsp.raw, dspNames);

const memNames = mem.agents.map((a) => a.name);
const memDocs = projectDocs(mem.raw, memNames);
const memLayout = layoutFor(mem.scopeId, mem.raw, memNames);

const hemNames = hem.agents.map((a) => a.name);
const hemDocs = projectDocs(hem.raw, hemNames);
const hemLayout = layoutFor(hem.scopeId, hem.raw, hemNames);

const cocNames = coc.agents.map((a) => a.name);
const cocDocs = projectDocs(coc.raw, cocNames);
const cocLayout = layoutFor(coc.scopeId, coc.raw, cocNames);

/**
 * What the desk offers, in the order it offers it.
 *
 * The two real projects are first and the invented one is last, which is the
 * opposite of how this shipped. The demo used to land on `group:web-project-demo`
 * — *Ledger currency rewrite*, *Duplicate ledger rows* — a project that does not
 * exist, while `coclea-sr` (135 gate checks, green on a GitHub runner in 23m27s)
 * was the fourth option in a dropdown and `hemo-verified` was not there at all.
 * A visitor's first screen was fiction and everything real was behind a select.
 *
 * The labels are what the things are called, not their internal ids. A scope
 * called `group:cochlea-lab` tells a stranger nothing; `coclea-sr` is a
 * directory they can go and read.
 */
const SCOPES = [
  { scopeId: coc.scopeId, label: "coclea-sr — truth is derivable" },
  { scopeId: hem.scopeId, label: "hemo-verified — truth is not derivable" },
  { scopeId: mem.scopeId, label: "memory lab — green and wrong" },
  { scopeId: dsp.scopeId, label: "signal lab — ran and carried nothing" },
  { scopeId: "group:web-project-demo", label: "a made-up web project" },
];

/**
 * The first screen is a real project.
 *
 * Rendered with the cochlea scope rather than the invented one, because the
 * first screen is the only one most visitors will see and it should be work that
 * happened. `coclea-sr` over `hemo-verified` for the landing for one reason: its
 * two chains are visibly identical and one of them is wrong, which is a picture.
 * H0's argument is a table, and a table is the second thing you show somebody.
 */
const html = renderDeskHtml({
  // The demo's own hole, and it is the true one: there is no conformation
  // behind this page. A published demo that showed an empty holes panel would
  // be asserting "nothing unanswered" about a backend that answers nothing —
  // the exact silence `conformation.ts` says is worse than no view at all.
  holes: [
    {
      question: "Which scopes exist, and who is in them?",
      why: "This page runs a simulated backend. No store is behind it, so every answer here is arranged rather than read.",
    },
  ],
  scopeId: coc.scopeId,
  scopeLabel: SCOPES[0]!.label,
  harness: "simulated",
  // DEMO_AT, not 0. The desk renders this as `new Date(at).toISOString()`, so a
  // zero here published `1970-01-01T00:00:00.000Z` in the chrome while every
  // flow beneath it correctly said "43 hours ago" -- a page that exists to show
  // state, showing a state nobody could have been in.
  at: DEMO_AT,
  // When this file was generated, so a reader can tell a new build from a cached
  // one without opening the network tab.
  builtAt: Date.now(),
  docs: cocDocs,
  agents: coc.agents as never,
  people: ["matias", "ada", "priya"],
  notes: [],
  memoryLevels: MEMORY_LEVELS,
  layout: cocLayout,
  scopes: SCOPES,
  simulate: true,
});

/**
 * The other scope's starting world, embedded beside the first.
 *
 * The desk's scope selector navigates (`?scope=…`) because against a real server
 * that is a fresh read. A static file has no server, so every scope it offers
 * has to be in the file, and the shim swaps them on load. Injected next to the
 * embedded state rather than appended, because the shim runs before the client
 * and would not see a script that came after it.
 *
 * The marker is asserted rather than assumed: a silent no-op here would ship a
 * scope selector that switches to an empty desk.
 */
const marker = "<script>window.__DESK__ = ";
if (!html.includes(marker)) {
  throw new Error("the embedded state moved; the second scope was not injected");
}
/**
 * Each world carries its own living documents.
 *
 * They were shipped once for the first scope and not swapped, so every scope
 * listed the first one's documents -- a panel of living documents that belonged
 * to a project you were not looking at. Found by switching scope and reading the
 * panel, which is the only way it could have been found.
 */
const channelsOf = (scopeId: string, docs: DeskDoc[]) => [
  ...docs.map((d) => workChannel({ id: d.id, title: d.title, scopeId, steps: d.steps })),
  ...channelsFor(scopeId, scopeId),
];

const worlds = {
  "group:web-project-demo": {
    docs,
    agents: [...(world.agents as unknown as typeof INSPECTOR[]), INSPECTOR],
    layout,
    notes: [],
    channels: channelsOf("group:web-project-demo", docs),
  },
  [hem.scopeId]: {
    docs: hemDocs,
    agents: hem.agents,
    layout: hemLayout,
    notes: [],
    channels: channelsOf(hem.scopeId, hemDocs),
  },
  [dsp.scopeId]: {
    docs: dspDocs,
    agents: dsp.agents,
    layout: dspLayout,
    notes: [],
    channels: channelsOf(dsp.scopeId, dspDocs),
  },
  [mem.scopeId]: {
    docs: memDocs,
    agents: mem.agents,
    layout: memLayout,
    notes: [],
    channels: channelsOf(mem.scopeId, memDocs),
  },
};
const withWorlds = html.replace(
  marker,
  `<script>window.__WORLDS__ = ${JSON.stringify(worlds).replace(/</g, "\\u003c")};\nwindow.__DESK__ = `,
);

writeFileSync(out, withWorlds);
console.log(
  `wrote ${out} — ${(withWorlds.length / 1024).toFixed(0)} kB, self-contained`,
);
console.log(
  `  ${world.docs.length} document(s), ${world.agents.length} agent(s) in the web project`,
);
console.log(
  `  ${dspDocs.length} document(s), ${dsp.agents.length} agent(s) in the signal lab`,
);
console.log(
  `  ${memDocs.length} document(s), ${mem.agents.length} agent(s) in the memory lab, no server`,
);
console.log(
  `  ${cocDocs.length} document(s), ${coc.agents.length} agent(s) in coclea-sr — the landing scope`,
);
console.log(
  `  ${hemDocs.length} document(s), ${hem.agents.length} agent(s) in hemo-verified`,
);
