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
import { randomUUID } from "node:crypto";
import { createCoreClient } from "../src/core-client.ts";
import { carryPriorResults, createEngine } from "../src/engine.ts";
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
import { createGateVerdict } from "./gate-verdict.ts";

const store = createPostgresFlowStore(DB);
const core = createCoreClient({
  baseUrl: process.env.CORE_API_URL ?? "http://localhost:8080",
  ...(process.env.CORE_SIGNING_SECRET ? { signingSecret: process.env.CORE_SIGNING_SECRET } : {}),
});
const engine = createEngine({
  store,
  core,
  /**
   * Whether a gated flow may finish. Unset when `GATE_REPORTS_DIR` is not
   * configured, and the engine then blocks every gated flow — a deployment that
   * cannot check is not a deployment where everything passes.
   */
  ...(() => {
    const g = createGateVerdict(process.env.GATE_REPORTS_DIR);
    return g ? { gateVerdict: g } : {};
  })(),
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
       * The step runs as the person the flow was created for.
       *
       * This replaced `FLOWS_ACTOR`, a single configured principal every flow ran
       * as. That worked and made the audit trail useless: every flow in every
       * project attributed to the same person regardless of who asked. Upstream's
       * roster guard now decides whether this flow may proceed by exactly the rule
       * it applies to that person's own turns
       * ([ADR-0009](../../doc/adr/0009-a-flow-records-who-it-acts-for.md)).
       *
       * `advance` refuses a flow with no actor, so this is never a fallback.
       */
      actor: { externalId: flow.actorId ?? "", displayName: flow.actorId ?? "" },
      conversation,
      text: step.intent,
    };
  },
  // Each step is shown what the ones before it produced. Without it a composed
  // flow is three agents that ran, not a pipeline — measured: a ReviewAgent
  // asked to review a schema it had never been shown.
  carry: carryPriorResults(),
  awaitOptions: { intervalMs: 1000, timeoutMs: 25_000 },
});

// The conformation half of the page, rebuilt per render. Cheap, and it means the
// page can never show a scope list from a previous process.
const built = buildApp({ ...config, port: 0 });
const { workspace, projects, sessions, sandbox } = built;

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
  // The canvas reads the shape of the system from here rather than projecting
  // its own. Two projections would be two answers to "what does this system
  // look like", and the desk would draw cubes the explorer does not have.
  conformation,
  /**
   * Where a project starts.
   *
   * The scope id is derived the same way `scripts/seed-cochlea.ts` derives it —
   * `group:<slug>-<projectId>` — rather than invented here. A second rule for
   * naming scopes would mean a project created from the desk and one created by
   * a seed script land in namespaces that only look alike.
   */
  /**
   * Furnish a scope. `workspace.write` directly rather than through a turn —
   * the file is the artefact, and asking a model to type it back spends a turn
   * to produce a file we already have.
   */
  async writeAgent(scopeId, path, markdown) {
    await workspace.write(scopeId, path, markdown);
  },
  /**
   * Material goes into the sandbox and is verified from inside it.
   *
   * `wc -c` run in the sandbox, compared against the bytes sent. Reading it
   * back through the writer's own API would confirm nothing — that is exactly
   * how this route reported `bytes: 37691` for a file the agent could not see.
   */
  /** Read back out of the sandbox — where an agent's own output lands. */
  async readMaterial(scopeId, path) {
    const handle = await sandbox.provision([{ scopeId, mode: "rw", mountPath: "" }]);
    const res = await sandbox.run(handle, `cat ${JSON.stringify(path)}`, { timeoutMs: 60_000 });
    return res.code === 0 ? (res.stdout ?? "") : null;
  },
  async putMaterial(scopeId, path, content) {
    const handle = await sandbox.provision([{ scopeId, mode: "rw", mountPath: "" }]);
    const bytes = new TextEncoder().encode(content);
    await sandbox.writeFileBytes(handle, path, bytes);
    const res = await sandbox.run(handle, `wc -c < ${JSON.stringify(path)}`, { timeoutMs: 60_000 });
    const seen = Number.parseInt((res.stdout ?? "").trim(), 10);
    return {
      verified: res.code === 0 && seen === bytes.length,
      detail:
        res.code === 0
          ? `${seen} of ${bytes.length} bytes present`
          : `exit ${res.code}: ${(res.stderr ?? "").trim().slice(0, 200)}`,
    };
  },
  async createProject({ name, ownerId }) {
    const project = await projects.create({ name, ownerId });
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "project";
    return { id: project.id, name: project.name, scopeId: `group:${slug}-${project.id}` };
  },
  /**
   * The model seam behind `POST /flows/:id/ask` ([ask.ts](../src/ask.ts)).
   *
   * A synchronous turn rather than the queued one a step uses: a person is
   * waiting for this answer, and there is nothing to resume if they close the
   * tab. It is the same shape `scripts/*-smoke.ts` use.
   *
   * The conversation ref is per-question rather than per-flow, so one question
   * never inherits the last one's context. Answering "why did this stop?" from
   * a thread that already contains a summary of the flow is how the answer
   * stops coming from the trace.
   */
  async ask(prompt: string) {
    const r = await core.turn({
      surface: "ai-flows-ask",
      actor: { externalId: "desk", displayName: "the desk" },
      conversation: { kind: "dm", threadRef: `ask-${randomUUID()}` },
      text: prompt,
    });
    return r.reply ?? "The core answered with no reply.";
  },
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
