/**
 * Run the flow API and the live view.
 *
 *   cd ai-flows && node --env-file=/path/to/core.env scripts/serve.ts
 *
 * Env:
 *   DATABASE_URL              required — flow_ tables are Postgres-only
 *   CORE_API_URL              default http://localhost:8080
 *   CORE_SIGNING_SECRET       used to SIGN calls to the core, if it enforces them
 *   FLOWS_SIGNING_SECRET      used to VERIFY calls to this server
 *   FLOWS_ALLOW_UNAUTHENTICATED=1   start open, and say so out loud
 *   FLOWS_PORT                default 8097
 *
 * `GET /` renders the same page `scripts/view.ts` writes to a file, so the
 * control arm for M5 is reachable without a build step or a second process.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";
import { scopeStorageKey } from "../../ai-base/src/util/scope-storage-key.ts";
import { parseAgentDefinition } from "../../ai-base/src/agents/agent-definition.ts";
import { parseFrontmatter } from "../../ai-base/src/skills/frontmatter.ts";
import { isProjectGroupRef } from "../../ai-base/src/projects/project-store.ts";
import { createCoreClient } from "../src/core-client.ts";
import { createEngine } from "../src/engine.ts";
import { createPostgresFlowStore } from "../src/postgres-flow-store.ts";
import { createFlowServer } from "../src/server.ts";
import { renderViewHtml } from "../src/view.ts";
import {
  type ConformationSources,
  type Hole,
  type Participation,
  type TapeMessage,
  projectConformation,
} from "../src/conformation.ts";
import type { FlowWithSteps } from "../src/types.ts";

const config = loadConfig();
const DB = config.databaseUrl;
if (!DB) throw new Error("DATABASE_URL is required — flows are not durable without it");

const PORT = Number(process.env.FLOWS_PORT ?? 8097);
/** Must be a member of every shared scope this server advances flows in. */
const FLOWS_ACTOR = process.env.FLOWS_ACTOR ?? "flows";
const store = createPostgresFlowStore(DB);
const core = createCoreClient({
  baseUrl: process.env.CORE_API_URL ?? "http://localhost:8080",
  ...(process.env.CORE_SIGNING_SECRET ? { signingSecret: process.env.CORE_SIGNING_SECRET } : {}),
});
const engine = createEngine({
  store,
  core,
  /**
   * A step runs IN THE FLOW'S SCOPE, and getting this wrong is silent.
   *
   * Upstream derives a turn's scope from the conversation, not from anything the
   * caller declares: `kind: "dm"` resolves to `personal:<actor>`
   * (`resolution-service.ts:18-22`). The first version of this sent every step as
   * a DM, so a flow declaring `group:web-project-…` executed in the ai-flows
   * user's own personal scope — wrong workspace, wrong memory, and the project's
   * `agents/*.md` unreachable by `delegate`, which is most of what composition
   * needs. Nothing failed; the work just happened somewhere else.
   *
   * So the flow's `scopeId` is mapped back to the conversation that resolves to
   * it. A `personal:` flow stays a DM because that is what personal means.
   */
  turnFor: (flow, step) => {
    const sep = flow.scopeId.indexOf(":");
    const kind = flow.scopeId.slice(0, sep);
    const ref = flow.scopeId.slice(sep + 1);
    // One thread per step: runs are serialised per session upstream, so steps
    // sharing a thread would queue behind each other.
    const threadRef = `flow-${flow.id}-${step.index}`;
    const conversation =
      kind === "group"
        ? ({ kind: "group", threadRef, channelRef: ref } as const)
        : kind === "channel"
          ? ({ kind: "channel", threadRef, channelRef: ref } as const)
          : ({ kind: "dm", threadRef } as const);
    return {
      surface: "ai-flows",
      // For a personal flow the actor IS the scope's owner, or the turn would
      // resolve to a different person's private scope.
      /**
       * Who the step acts AS, and this turned out to be a real hole rather than a
       * configuration detail.
       *
       * A shared scope refuses a turn from a non-member — `"you're not a member of
       * that context"`, upstream's roster guard doing exactly its job. So a flow
       * in a project must run as somebody on that project's roster. But **a flow
       * records no actor**: it has a `scopeId` and nothing about who it acts for,
       * so there is nobody to be.
       *
       * `FLOWS_ACTOR` is the stopgap — one configured principal who must be a
       * member of every scope this server runs flows in. It is wrong in the way
       * shared service accounts are always wrong: every flow in the audit log is
       * attributed to the same person regardless of who asked for it.
       *
       * This is [ADR-0008](../../doc/adr/0008-conformation-is-projected.md)'s
       * condition for agent principals firing: *an agent that must appear in a
       * roster*. See doc/08-roadmap § Phase 3.
       */
      actor:
        kind === "personal"
          ? { externalId: ref, displayName: ref }
          : { externalId: FLOWS_ACTOR, displayName: FLOWS_ACTOR },
      conversation,
      text: step.intent,
    };
  },
  awaitOptions: { intervalMs: 1000, timeoutMs: 20_000 },
});

// The conformation half of the page, rebuilt per render. Cheap, and it means the
// page can never show a scope list from a previous process.
const built = buildApp({ ...config, port: 0 });
const { workspace, projects, sessions } = built;

async function conformation() {
  const wiringHoles: Hole[] = [];
  const sources: ConformationSources = {
    async scopes() {
      const distinct = await sessions.distinctScopes();
      const ids = new Set(distinct.map((d) => d.scopeId));
      const fromSessions = ids.size;
      let recovered = 0;
      try {
        for (const d of await readdir(join(config.dataDir, "workspaces"), { withFileTypes: true })) {
          if (!d.isDirectory()) continue;
          const sep = d.name.indexOf("__");
          const guess = sep < 0 ? null : `${d.name.slice(0, sep)}:${d.name.slice(sep + 2)}`;
          if (guess && scopeStorageKey(guess) === d.name && !ids.has(guess)) {
            ids.add(guess);
            recovered += 1;
          }
        }
      } catch {
        /* nothing materialised yet */
      }
      wiringHoles.push({
        question: "Which scopes exist?",
        why: `distinctScopes() found ${fromSessions}; ${recovered} more decoded from workspace directory names. No store answers this directly`,
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
      // `subagents:` is ours; upstream validates name/description/tools and
      // ignores every other key, so the file stays delegatable and carries the tree.
      const { attrs } = parseFrontmatter(raw);
      const declared = Array.isArray(attrs.subagents)
        ? attrs.subagents.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
        : [];
      return { description: d.description, tools: d.tools, subagents: declared };
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
  const c = await projectConformation(sources, { harness: config.harness });
  c.holes.unshift(...wiringHoles);
  return c;
}

/**
 * Agents for the composer, resolved from the same projection the page renders,
 * so a tree that is drawn and a tree that is run can never disagree.
 */
async function scopeAgents(scopeId: string) {
  const c = await conformation();
  const scope = c.scopes.find((s) => s.scopeId === scopeId);
  if (!scope) return null;
  const systemScope = c.scopes.find((s) => s.role === "system");
  return { scope, ...(systemScope ? { systemScope } : {}) };
}

const server = createFlowServer({
  store,
  engine,
  scopeAgents,
  ...(process.env.FLOWS_SIGNING_SECRET
    ? { signingSecret: process.env.FLOWS_SIGNING_SECRET }
    : { allowUnauthenticated: process.env.FLOWS_ALLOW_UNAUTHENTICATED === "1" }),
  async renderView() {
    const c = await conformation();
    const scopeFlows = await Promise.all(c.scopes.map((s) => store.listFlows(s.scopeId)));
    const extra = await store.listFlows("personal:U1");
    const byId = new Map([...scopeFlows.flat(), ...extra].map((f) => [f.id, f]));
    const flows = (await Promise.all([...byId.keys()].map((id) => store.getFlow(id)))).filter(
      (f): f is FlowWithSteps => f !== null,
    );
    return renderViewHtml({ conformation: c, flows, source: `live · ${config.dataDir}` });
  },
});

const { port } = await server.listen(PORT);
console.log(
  `[ai-flows] api + view on http://localhost:${port} · core ${process.env.CORE_API_URL ?? "http://localhost:8080"} · ` +
    `${process.env.FLOWS_SIGNING_SECRET ? "signed" : "UNAUTHENTICATED"}`,
);
