/**
 * The [ran] for the conformation projector.
 *
 * `src/conformation.ts` takes ports and is proven against fixtures. That proves
 * the projection and proves nothing about whether the base will answer the
 * questions. This wires it to real `ai-base` stores and reports what came back —
 * including, and especially, what did not.
 *
 *   cd ai-flows && node --env-file-if-exists=../ai-base/.env scripts/conformation-probe.ts
 *   ... --json           emit the document instead of the rendering
 *   ... --data <dir>     read an existing dataDir rather than the configured one
 *   ... --seed           write a small fixture first, so the probe has something to see
 *
 * Two limits of the base are known before running. They are wired as holes
 * rather than worked around, because working around them is how a projection
 * starts flattering itself:
 *
 *   1. Scope enumeration is a SESSION fact, not a workspace one.
 *      `WorkspaceStore` has `list(scopeId)` and nothing that lists scope ids
 *      (`workspace-store.ts:6-14`), so a scope is discoverable only once it has
 *      held a session — `SessionStore.distinctScopes()`. A scope with a
 *      materialised workspace and no conversation is invisible, and that is
 *      reported rather than hidden.
 *   2. `ProjectStore` has `listForMember(principalId)` and no list-all, so
 *      projects are found only through scopes that already surfaced in (1).
 *
 * Both are properties of the base, not of the projector. Stating them is the
 * point: ADR-0008 asks for the holes as output.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";
import { scopeStorageKey } from "../../ai-base/src/util/scope-storage-key.ts";
import { parseAgentDefinition } from "../../ai-base/src/agents/agent-definition.ts";
import { isProjectGroupRef, projectGroupRef, projectScopeId } from "../../ai-base/src/projects/project-store.ts";
import {
  type ConformationSources,
  type Hole,
  type TapeMessage,
  type Participation,
  PROJECT_GROUP_PREFIX as PROJECTED_PREFIX,
  projectConformation,
  renderConformation,
} from "../src/conformation.ts";

const argv = process.argv;
const asJson = argv.includes("--json");
const seed = argv.includes("--seed");
const dataArg = argv.indexOf("--data");

const config = loadConfig();
const dataDir = dataArg >= 0 ? argv[dataArg + 1]! : config.dataDir;

const built = buildApp({ ...config, port: 0, dataDir });
const { workspace, projects, sessions } = built;

/** Holes found while wiring, as opposed to while projecting. */
const wiringHoles: Hole[] = [];

/**
 * `src/` duplicates the reserved prefix as a string rather than importing core
 * (ADR-0006). That duplication is only safe if something checks it, and this is
 * the something: a silent divergence here would make every project in the system
 * project as a plain collective scope.
 */
const upstreamPrefix = projectGroupRef("");
if (PROJECTED_PREFIX !== upstreamPrefix) {
  throw new Error(`project prefix drifted: ai-flows has '${PROJECTED_PREFIX}', ai-base has '${upstreamPrefix}'`);
}

/**
 * `--converse` exists for one claim: that a real turn writes a tape record whose
 * `meta.author` identifies the speaker. Everything about the communication graph
 * rests on that field, and it was READ off the `TapeMeta` type rather than
 * observed. A type says a field may be present; it does not say the turn
 * pipeline fills it. Two cheap turns settle it.
 */
if (argv.includes("--converse")) {
  // Two actors differing in ONE field. The first run of this probe used only the
  // left-hand case and every record came back unattributed; the pair is what
  // turns that into a located finding rather than a puzzle.
  const actors = [
    { externalId: "U1" },
    { externalId: "U2", displayName: "Ada" },
  ];
  for (const actor of actors) {
    const r = await built.app.turn({
      surface: "conformation-probe",
      actor,
      conversation: { kind: "dm", threadRef: `conformation-probe-${process.pid}-${actor.externalId}` },
      text: "Reply with the single word: ok.",
    });
    const named = "displayName" in actor ? `displayName='${actor.displayName}'` : "no displayName";
    console.log(`turn ${String(r.status)} (${named}): ${(r.reply ?? r.reason ?? "").trim().slice(0, 40)}`);
  }
  console.log("");
}

if (seed) {
  // A fixture that exercises each branch worth seeing: a system agent that
  // cannot be reached, a project agent that can, one definition that does not
  // parse, and a membership-shaped path that must be reported and not believed.
  const AGENT = (desc: string) => `---\ndescription: ${desc}\ntools: [execute, read]\n---\nDo the thing.`;
  const org = `org:${config.orgId ?? "local"}`;
  const project = projectScopeId("seed");
  await workspace.ensureScope(org);
  await workspace.ensureScope(project);
  await workspace.write(org, "agents/reviewer.md", AGENT("Reviews a change against org policy."));
  await workspace.write(project, "agents/calculator.md", AGENT("Computes an exact numeric answer."));
  await workspace.write(project, "agents/broken.md", "no frontmatter at all");
  await workspace.write(project, "memory/MEMORY.md", "- seeded\n");
  await workspace.write(project, "users/alice.md", "alice is on this project\n");
  console.log(`seeded ${org} and ${project}\n`);
}

const sources: ConformationSources = {
  async scopes() {
    const distinct = await sessions.distinctScopes();
    const ids = new Set(distinct.map((d) => d.scopeId));
    const fromSessions = ids.size;

    /**
     * Fallback: read the directory the local workspace store keys.
     *
     * `scopeStorageKey` is lossy — every character outside `[a-zA-Z0-9_.-]`
     * becomes `__`, so `personal:a:b` and `personal:a__b` collide. A directory
     * name is therefore DECODED BY GUESSING and then CONFIRMED by re-encoding;
     * a guess that does not round-trip is reported as undecodable rather than
     * shown as a scope. Guessing without the round-trip would put scopes in the
     * output that do not exist, which is the one thing worse than missing some.
     */
    let dirs: string[] = [];
    try {
      const root = join(dataDir, "workspaces");
      dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      dirs = [];
    }
    let recovered = 0;
    for (const dir of dirs) {
      const sep = dir.indexOf("__");
      const guess = sep < 0 ? null : `${dir.slice(0, sep)}:${dir.slice(sep + 2)}`;
      if (guess && scopeStorageKey(guess) === dir) {
        if (!ids.has(guess)) recovered += 1;
        ids.add(guess);
      } else {
        wiringHoles.push({
          question: `Which scope is the directory '${dir}'?`,
          why: "scopeStorageKey is lossy, so this name does not round-trip to a unique scope id; it is not guessed at",
        });
      }
    }

    wiringHoles.push({
      question: "Which scopes exist?",
      why:
        `SessionStore.distinctScopes() found ${fromSessions} — it lists only scopes that have held a conversation, ` +
        `and session storage is '${config.sessionStore ?? "memory"}'. WorkspaceStore cannot enumerate scope ids at all, ` +
        `so the remaining ${recovered} were recovered by decoding workspace directory names and confirming the round-trip. ` +
        "No store answers this question directly",
    });
    return [...ids].sort();
  },

  async roster(scopeId) {
    const ref = scopeId.slice(scopeId.indexOf(":") + 1);
    if (!isProjectGroupRef(ref)) return null;
    const [members, version] = await Promise.all([projects.members(ref), projects.version(ref)]);
    if (!members) return null;
    return { members, version: version ?? "(unversioned)" };
  },

  /**
   * `WorkspaceStore.list` returns ABSOLUTE paths — `join(e.parentPath, e.name)`
   * over a recursive readdir (`workspace-store.ts:61-68`) — and the projector
   * works in paths relative to the layer root, because that is what `agents/x.md`
   * means to `delegate`. Wiring it through unconverted is what the first run of
   * this probe did, and it rendered a clean, empty, entirely wrong view: two
   * seeded scopes with no agents, no memory and no findings.
   *
   * Worth stating twice, because the same function has a second silent failure:
   * it is wrapped in `catch { return [] }`, so an unreadable scope and an empty
   * scope are the same answer. Neither is distinguishable from outside, which is
   * why the mismatch below is reported rather than trimmed away quietly.
   */
  async workspaceFiles(scopeId) {
    const root = workspace.scopeDir(scopeId);
    const absolute = await workspace.list(scopeId);
    const relative: string[] = [];
    for (const abs of absolute) {
      if (abs.startsWith(`${root}/`)) relative.push(abs.slice(root.length + 1));
      else {
        wiringHoles.push({
          scopeId,
          question: `What is the path '${abs}' relative to?`,
          why: `it does not sit under this scope's workspace root ${root}, so it is not projected`,
        });
      }
    }
    return relative;
  },
  readFile: (scopeId, path) => workspace.read(scopeId, path),

  /** Upstream's own parser, so the projector cannot drift from the contract. */
  parseAgent(name, raw) {
    const d = parseAgentDefinition(name, raw);
    return { description: d.description, tools: d.tools };
  },

  /**
   * The durable substrate, and only it. The audit log is in-memory and capped at
   * 50,000; `run_activity` is TTL-swept. Either would yield a graph that loses
   * records without saying so.
   *
   * Session ENTRIES are the spine rather than tape records, because an entry
   * carries `type` — user or assistant — which attributes the agent's own half of
   * every conversation with no ambiguity whatsoever. The tape is then joined in
   * by `entrySeq` for the cases where upstream did write `meta.author`.
   */
  async messages(scopeId): Promise<TapeMessage[]> {
    const out: TapeMessage[] = [];
    for (const session of await sessions.listAll()) {
      if (session.scopeId !== scopeId) continue;
      const declared = new Map<number, string>();
      for (const rec of await sessions.getTape(session.id)) {
        if (rec.kind === "message" && rec.meta?.author && rec.entrySeq !== undefined) {
          declared.set(rec.entrySeq, rec.meta.author);
        }
      }
      for (const entry of await sessions.getEntries(session.id)) {
        if (entry.type !== "user" && entry.type !== "assistant") continue;
        const author = declared.get(entry.seq);
        out.push({
          scopeId,
          sessionId: session.id,
          role: entry.type,
          at: entry.createdAt,
          ...(author ? { author } : {}),
        });
      }
    }
    return out;
  },

  /**
   * Membership windows — the same join upstream uses behind `attributedTurns`,
   * kept per record instead of aggregated by day.
   */
  async participants(): Promise<Participation[]> {
    return sessions.listParticipants();
  },
};

const conformation = await projectConformation(sources, { harness: config.harness });
conformation.holes.unshift(...wiringHoles);

if (asJson) {
  console.log(JSON.stringify(conformation, null, 2));
} else {
  console.log(`dataDir ${dataDir}  ·  workspaces ${join(dataDir, "workspaces")}`);
  console.log(renderConformation(conformation));
  console.log("");
  console.log(
    conformation.holes.length === 0
      ? "NO HOLES — per ADR-0008 that falsifies the case for any new folder."
      : `${conformation.holes.length} holes. Each is the specification for whatever would fill it.`,
  );
}

process.exit(0);
