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

/** The signal lab: the same desk, on numbers instead of prose. */
const dsp = {
  scopeId: "group:signal-lab",
  agents: dspAgents(),
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

const dspNames = dsp.agents.map((a) => a.name);
const dspDocs = projectDocs(dsp.raw, dspNames);
const dspLayout = layoutFor(dsp.scopeId, dsp.raw, dspNames);

const SCOPES = [
  { scopeId: "group:web-project-demo", label: "group:web-project-demo" },
  { scopeId: dsp.scopeId, label: dsp.scopeId },
];

const html = renderDeskHtml({
  scopeId: "group:web-project-demo",
  scopeLabel: "group:web-project-demo",
  harness: "simulated",
  at: 0,
  docs,
  agents: world.agents as never,
  people: ["matias", "ada", "priya"],
  notes: [],
  memoryLevels: MEMORY_LEVELS,
  layout,
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
const worlds = {
  [dsp.scopeId]: {
    docs: dspDocs,
    agents: dsp.agents,
    layout: dspLayout,
    notes: [],
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
  `  ${dspDocs.length} document(s), ${dsp.agents.length} agent(s) in the signal lab, no server`,
);
