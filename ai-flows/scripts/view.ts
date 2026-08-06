/**
 * Render the whole system — flows and conformation — to one self-contained page.
 *
 *   cd ai-flows && node --env-file=/path/to/core.env scripts/view.ts [--out page.html] [--open]
 *
 * Phase 2 of [08-roadmap](../../doc/08-roadmap.md): the control arm for M5. If a
 * person can pick a three-day-old flow up from this page, the canvas is not the
 * next thing to build.
 *
 * It reads only what is durable. With `SESSION_STORE=memory` the conformation
 * half comes back mostly holes, and that is left visible rather than hidden —
 * a page that renders cleanly because it could not ask is the failure mode.
 */
import { writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";
import { scopeStorageKey } from "../../ai-base/src/util/scope-storage-key.ts";
import { parseAgentDefinition } from "../../ai-base/src/agents/agent-definition.ts";
import { isProjectGroupRef } from "../../ai-base/src/projects/project-store.ts";
import {
  type ConformationSources,
  type Hole,
  type Participation,
  type TapeMessage,
  projectConformation,
} from "../src/conformation.ts";
import { createPostgresFlowStore } from "../src/postgres-flow-store.ts";
import type { FlowWithSteps } from "../src/types.ts";
import { renderViewHtml } from "../src/view.ts";

const argv = process.argv;
const outIdx = argv.indexOf("--out");
const out = outIdx >= 0 ? argv[outIdx + 1]! : "ai-os-view.html";

const config = loadConfig();
const built = buildApp({ ...config, port: 0 });
const { workspace, projects, sessions } = built;
const wiringHoles: Hole[] = [];

const sources: ConformationSources = {
  async scopes() {
    const distinct = await sessions.distinctScopes();
    const ids = new Set(distinct.map((d) => d.scopeId));
    const fromSessions = ids.size;
    let recovered = 0;
    try {
      const root = join(config.dataDir, "workspaces");
      for (const d of await readdir(root, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const sep = d.name.indexOf("__");
        const guess = sep < 0 ? null : `${d.name.slice(0, sep)}:${d.name.slice(sep + 2)}`;
        if (guess && scopeStorageKey(guess) === d.name && !ids.has(guess)) {
          ids.add(guess);
          recovered += 1;
        }
      }
    } catch {
      /* no workspaces on disk yet */
    }
    wiringHoles.push({
      question: "Which scopes exist?",
      why: `distinctScopes() found ${fromSessions} (session storage '${config.sessionStore ?? "memory"}'); ${recovered} more recovered from workspace directory names. No store answers this directly`,
    });
    return [...ids].sort();
  },
  async roster(scopeId) {
    const ref = scopeId.slice(scopeId.indexOf(":") + 1);
    if (!isProjectGroupRef(ref)) return null;
    const [members, version] = await Promise.all([projects.members(ref), projects.version(ref)]);
    return members ? { members, version: version ?? "(unversioned)" } : null;
  },
  async workspaceFiles(scopeId) {
    const root = workspace.scopeDir(scopeId);
    return (await workspace.list(scopeId))
      .filter((p) => p.startsWith(`${root}/`))
      .map((p) => p.slice(root.length + 1));
  },
  readFile: (scopeId, path) => workspace.read(scopeId, path),
  parseAgent(name, raw) {
    const d = parseAgentDefinition(name, raw);
    return { description: d.description, tools: d.tools };
  },
  async messages(scopeId): Promise<TapeMessage[]> {
    const acc: TapeMessage[] = [];
    for (const s of await sessions.listAll()) {
      if (s.scopeId !== scopeId) continue;
      const declared = new Map<number, string>();
      for (const rec of await sessions.getTape(s.id)) {
        if (rec.kind === "message" && rec.meta?.author && rec.entrySeq !== undefined) {
          declared.set(rec.entrySeq, rec.meta.author);
        }
      }
      for (const e of await sessions.getEntries(s.id)) {
        if (e.type !== "user" && e.type !== "assistant") continue;
        const author = declared.get(e.seq);
        acc.push({ scopeId, sessionId: s.id, role: e.type, at: e.createdAt, ...(author ? { author } : {}) });
      }
    }
    return acc;
  },
  participants: (): Promise<Participation[]> => sessions.listParticipants(),
};

const conformation = await projectConformation(sources, { harness: config.harness });
conformation.holes.unshift(...wiringHoles);

// Flows live in their own `flow_` tables and only exist durably on Postgres.
let flows: FlowWithSteps[] = [];
if (config.databaseUrl) {
  const store = createPostgresFlowStore(config.databaseUrl);
  const summaries = (await Promise.all(conformation.scopes.map((s) => store.listFlows(s.scopeId)))).flat();
  // A flow in a scope nobody has conversed in is invisible to the scope list, so
  // the personal scope of the smoke tests is checked explicitly rather than lost.
  const extra = await store.listFlows("personal:U1");
  const byId = new Map([...summaries, ...extra].map((f) => [f.id, f]));
  flows = (await Promise.all([...byId.keys()].map((id) => store.getFlow(id)))).filter(
    (f): f is FlowWithSteps => f !== null,
  );
} else {
  conformation.holes.push({
    question: "What flows exist?",
    why: "no DATABASE_URL — flow_ tables are Postgres-only, so nothing above the turn can be shown",
  });
}

const html = renderViewHtml({
  conformation,
  flows,
  source: `${config.dataDir} · ${config.databaseUrl ? "postgres" : "no database"}`,
});
writeFileSync(out, html);
console.log(`wrote ${out}`);
console.log(`  ${flows.length} flow(s), ${conformation.scopes.length} scope(s), ${conformation.holes.length} hole(s)`);
for (const f of flows) console.log(`  - ${f.state.padEnd(8)} ${f.title} (${f.steps.length} steps)`);
process.exit(0);
