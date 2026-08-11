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
import { demoWorld } from "../src/simulate.ts";
import { propose } from "../src/layout.ts";
import { MEMORY_LEVELS } from "../src/memory.ts";
import { traceOf } from "../src/trace.ts";
import { agentOfIntent } from "../src/server.ts";

const outIdx = process.argv.indexOf("--out");
const out = outIdx >= 0 ? process.argv[outIdx + 1]! : "demo.html";

const world = demoWorld();

// The same projection the server does, so the first frame of the demo is built
// by the product's own code rather than written by hand.
//
// Typed as `DeskDoc[]` rather than cast to `never`. The cast that used to be
// here is why adding a required field to `DeskDoc` did not fail this script:
// the demo would have shipped documents with no digest and no menu, and the
// only symptom would have been a page that looked slightly emptier than the
// product. A cast that silences the compiler on the one file nobody runs in CI
// is the drift this repository keeps finding by hand.
const DEMO_AT = 1_760_000_000_000;
const docs: DeskDoc[] = world.docs.map((d) => {
  const raw = d as unknown as Omit<
    DeskDoc,
    "trace" | "digest" | "actions"
  > & { steps: Parameters<typeof traceOf>[0] };
  const trace = traceOf(raw.steps, agentOfIntent);
  const digest = digestOf(
    {
      flowId: raw.id,
      title: raw.title,
      state: raw.state,
      updatedAt: raw.updatedAt,
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
      flowId: raw.id,
      state: raw.state,
      digest,
      trace,
      availableAgents: world.agents.map((a) => a["name"] as string),
    }),
  };
});

const layout = propose(
  {
    scopeId: "group:web-project-demo",
    flows: world.docs.map((d) => ({
      id: d["id"] as string,
      title: d["title"] as string,
      state: d["state"] as string,
      agents: (d["steps"] as Array<{ agent: string }>).map((s) => s.agent),
    })),
    agents: world.agents.map((a) => a["name"] as string),
  },
  null,
  // A little wider than the default: the demo is embedded, and two documents
  // side by side is the picture. A third row would need scrolling nobody does.
  { width: 1180 },
);

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
  scopes: [
    { scopeId: "group:web-project-demo", label: "group:web-project-demo" },
  ],
  simulate: true,
});

writeFileSync(out, html);
console.log(
  `wrote ${out} — ${(html.length / 1024).toFixed(0)} kB, self-contained`,
);
console.log(
  `  ${world.docs.length} document(s), ${world.agents.length} agent(s), no server`,
);
