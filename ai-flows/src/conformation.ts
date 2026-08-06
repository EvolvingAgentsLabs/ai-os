/**
 * What shape is this system in, and who has been talking to whom?
 *
 * An operating system lets you see itself: the process list, the filesystem, who
 * is logged in. ai-os could answer none of those about itself. The information
 * exists — scopes, project rosters, workspace agent files, the session tape —
 * and nothing projected it.
 *
 * This module projects it, and the design rule is the whole point:
 *
 *   **Conformation is READ. It is never stored.**
 *
 * The tempting alternative was a folder hierarchy — `users/` inside each project,
 * `agents/` beside it, `subagents/` under each orchestrator. Six of those seven
 * structures already exist as the layered workspace and upstream's `ProjectStore`
 * (doc/12-conformation.md). The seventh, `users/`, is the one that must never be
 * built: it is an ACL that no ACL function reads, and it diverges from the roster
 * the moment someone is removed. ADR-0005 rejected that object one layer up;
 * ADR-0008 rejects it here.
 *
 * So this module reads membership from the roster port and, if it finds a
 * membership-shaped file sitting in a workspace, reports it as a FINDING rather
 * than believing it. See `membershipInFolders`.
 *
 * ## Holes are output
 *
 * The failure mode of any projection is silence: a view that renders cleanly
 * because it did not ask is worse than no view. Every question this module asks
 * and cannot answer becomes a `Hole` in the result, and the holes are the
 * deliverable — they are the evidence for whether any new folder is needed at
 * all. A run that returns no holes falsifies the case for building anything.
 *
 * ## Nothing here imports ai-base
 *
 * Per ADR-0006, `ai-flows/src` imports nothing from core; it takes ports. In
 * particular `parseAgent` is injected rather than reimplemented, so an agent file
 * is parsed by upstream's own `parseAgentDefinition` and this module cannot drift
 * from the contract it is describing. `scripts/` does the wiring.
 */
import { digestOf } from "./observability.ts";

export type ScopeKind = "personal" | "channel" | "team" | "org" | "group";

/**
 * Upstream's reserved prefix: a project IS a group scope, it is not a new object
 * (`projects/project-store.ts:47`, ADR-0005). Duplicated here as a string rather
 * than imported, because `src/` takes no core dependency — the probe asserts it
 * still matches upstream.
 */
export const PROJECT_GROUP_PREFIX = "web-project-";

/** Reserved directories inside a scope's workspace. */
export const AGENTS_DIR = "agents";
export const SKILLS_DIR = "skills";
export const MEMORY_FILE = "memory/MEMORY.md";

/**
 * Paths that would mean somebody is keeping membership in a folder.
 *
 * Not a guess about naming: this is the list of things that, if found, indicate
 * the mistake ADR-0008 exists to prevent. Matching is on the first path segment,
 * so `users/`, `users.md` and `members/alice.md` all trip it.
 */
const MEMBERSHIP_SHAPED = ["users", "members", "people", "roster", "principals"];

export type ScopeRole =
  /** `org:` — the system scope, mounted read-only into every other scope as `global/`. */
  | "system"
  /** `group:web-project-<id>` — a rostered project. */
  | "project"
  /** `group:` / `channel:` — shared, not a project. */
  | "collective"
  /** `personal:` — one person. */
  | "individual"
  /** `team:` — identity-provider teams, from `Principal.teamIds`. */
  | "team"
  /** The kind did not parse. Reported, never assumed benign — see `holes`. */
  | "unknown";

export interface AgentRecord {
  name: string;
  path: string;
  description: string;
  tools: string[];
  /** False when the file exists but does not parse; `error` then says why. */
  ok: boolean;
  error?: string;
  /**
   * True when this definition cannot run on the harness in use.
   *
   * Workspace-defined agents are read by exactly one caller in the tree,
   * `pi-tools.ts` (doc/12-conformation.md § The inert folder). Under `claude`
   * the child agents are hardcoded; under `codex` / `opencode` delegation happens
   * inside the CLI. A folder of agents that silently does nothing on the harness
   * you are running is worse than no folder, so it is marked.
   */
  inert: boolean;
}

export interface Roster {
  members: string[];
  /**
   * Upstream's per-roster version, and it is a `string` because upstream's
   * `ProjectStore.version()` returns `string | undefined` — not a counter to do
   * arithmetic on. A turn is refused when this moves mid-flight
   * (`app-turn.ts:102-106,337`), so it is the one field here that already has
   * teeth elsewhere in the system.
   */
  version: string;
}

export interface ScopeNode {
  scopeId: string;
  kind: ScopeKind | null;
  ref: string;
  role: ScopeRole;
  /** Present only for `role: "project"`. */
  projectId?: string;
  /** From the roster port. Absent means not asked or not answerable — see holes. */
  roster?: Roster;
  agents: AgentRecord[];
  skills: string[];
  hasMemory: boolean;
  /**
   * Membership-shaped paths found in this scope's workspace.
   *
   * Non-empty is a finding, not data. These paths are NOT read for membership,
   * and their presence is reported as a hole so it is argued rather than absorbed.
   */
  membershipInFolders: string[];
}

/** One actor speaking to another, within one scope. */
export interface Edge {
  from: string;
  to: string;
  scopeId: string;
  messages: number;
  lastAt: number;
  /** How `from` was established. An edge is only as good as this field. */
  via: Attribution;
}

export interface Hole {
  /** The question that was asked. */
  question: string;
  /** Why it could not be answered — the specification for whatever fills it. */
  why: string;
  scopeId?: string;
}

export interface Conformation {
  at: number;
  harness: string;
  scopes: ScopeNode[];
  edges: Edge[];
  holes: Hole[];
  /**
   * A fingerprint of the structure, excluding timestamps and message counts.
   *
   * Deliberately the same instrument as flow observability (`digestOf`): two
   * projections that agree are proof the shape did not move, and two that differ
   * are a rumour subject to the same measured δ. A conformation view needs the
   * repeat-versus-noise distinction for exactly the reason a flow does, and
   * building a second analyser for it would be the mistake doc/10 already names.
   */
  digest: string;
}

/**
 * The node an edge is drawn to when the message names no author.
 *
 * Not a formatting choice — it is the single most common node in a real graph.
 * See the hole raised in `projectConformation`.
 */
export const UNATTRIBUTED = "(unattributed)";

/** The node an assistant message is attributed to. */
export const AGENT = "(agent)";

/** How an edge's `from` was established. Carried so a reader can discount it. */
export type Attribution =
  /** `meta.author` was present — upstream wrote it from `actor.displayName`. */
  | "declared"
  /** The record is an assistant turn. Deterministic: the agent spoke. */
  | "role"
  /** Exactly one participant window covered this record. */
  | "window"
  /** Several windows covered it. Never resolved to one of them — see holes. */
  | "ambiguous"
  /** Nothing covered it. */
  | "none";

/** A message as the session log records it. */
export interface TapeMessage {
  scopeId: string;
  /**
   * Absent whenever the record carries no `meta.author`, which is more often
   * than the type suggests — measured, not assumed. See the hole.
   */
  author?: string;
  at: number;
  /** Which session, so participant windows can be applied. */
  sessionId?: string;
  /** Who structurally spoke. `assistant` attributes with no ambiguity at all. */
  role?: "user" | "assistant";
  /** Recipients, where the surface distinguishes them. Empty means broadcast to scope. */
  to?: string[];
  /** Upstream marks overheard records; they are not addressed to anyone. */
  overheard?: boolean;
}

/**
 * A principal's membership window on a session, as upstream exposes it.
 *
 * `ParticipantWindow` (`sessions/session-store.ts:195`) carries `validFrom` /
 * `validTo` as TIMESTAMPS, while upstream's own attribution — the join behind
 * `attributedTurns` — filters on `validFromSeq` / `validToSeq` instead
 * (`memory-session-store.ts:494`). The seq bounds are not exposed. So an
 * external reconstruction agrees with upstream's everywhere except at a window
 * boundary, and that residual is the reason the upstream proposal asks for the
 * seq pair rather than declaring this solved.
 */
export interface Participation {
  sessionId: string;
  principalId: string;
  validFrom: number;
  validTo: number | null;
}

/**
 * Recover who spoke, without inventing anyone.
 *
 * Upstream already knows this: `attributedTurns` joins `session_entries` to
 * `participants` within the membership window. It just aggregates the answer by
 * day and never exposes it per record. This applies the same join and keeps the
 * per-record result — which is the whole of the communication graph.
 *
 * The rule that matters is what it does when the join is not unique: **several
 * candidates resolve to `ambiguous`, never to a pick.** Upstream's aggregate can
 * count one turn under two principals because a usage metric tolerates that; a
 * communication graph that did it would draw an edge from somebody who did not
 * speak, which is worse than drawing none.
 */
export function attributeMessage(m: TapeMessage, windows: readonly Participation[]): {
  author: string;
  via: Attribution;
} {
  if (m.author !== undefined) return { author: m.author, via: "declared" };
  if (m.role === "assistant") return { author: AGENT, via: "role" };
  if (!m.sessionId) return { author: UNATTRIBUTED, via: "none" };

  const covering = windows.filter(
    (w) => w.sessionId === m.sessionId && m.at >= w.validFrom && (w.validTo === null || m.at < w.validTo),
  );
  if (covering.length === 1) return { author: covering[0]!.principalId, via: "window" };
  return { author: UNATTRIBUTED, via: covering.length > 1 ? "ambiguous" : "none" };
}

export interface ParsedAgent {
  description: string;
  tools: string[];
}

/**
 * Everything the projector reads. All optional except `scopes` — a source that
 * is absent produces holes rather than an exception, because a partial view that
 * says what it is missing is the useful artefact here.
 */
export interface ConformationSources {
  /** Every scope the caller can see. The projector adds no visibility of its own. */
  scopes(): Promise<string[]>;
  /** Upstream `ProjectStore`. Return null for a scope that is not a project. */
  roster?(scopeId: string): Promise<Roster | null>;
  /** Workspace listing for a scope, as paths relative to the layer root. */
  workspaceFiles?(scopeId: string): Promise<string[]>;
  /** Raw file read within a scope's workspace. */
  readFile?(scopeId: string, path: string): Promise<string | null>;
  /** Upstream's own parser, injected so this module cannot drift from it. */
  parseAgent?(name: string, raw: string): ParsedAgent;
  /** Durable session records. NOT the audit log and NOT `run_activity`. */
  messages?(scopeId: string): Promise<TapeMessage[]>;
  /** Membership windows, so an undeclared author can be recovered rather than lost. */
  participants?(): Promise<Participation[]>;
}

export interface ProjectOptions {
  /** Which harness the answer is about — decides whether agent files are inert. */
  harness: string;
  now?: () => number;
}

/** Harnesses on which a workspace-defined `agents/*.md` is actually loaded. */
const WORKSPACE_AGENTS_WORK_ON = new Set(["pi"]);

const SCOPE_KINDS: ReadonlySet<string> = new Set(["personal", "channel", "team", "org", "group"]);

export function parseScope(scopeId: string): { kind: ScopeKind | null; ref: string } {
  const sep = scopeId.indexOf(":");
  if (sep < 0) return { kind: null, ref: "" };
  const raw = scopeId.slice(0, sep);
  return { kind: SCOPE_KINDS.has(raw) ? (raw as ScopeKind) : null, ref: scopeId.slice(sep + 1) };
}

export function roleOf(scopeId: string): { role: ScopeRole; projectId?: string } {
  const { kind, ref } = parseScope(scopeId);
  if (kind === null) return { role: "unknown" };
  if (kind === "org") return { role: "system" };
  if (kind === "personal") return { role: "individual" };
  if (kind === "team") return { role: "team" };
  if (kind === "group" && ref.startsWith(PROJECT_GROUP_PREFIX)) {
    return { role: "project", projectId: ref.slice(PROJECT_GROUP_PREFIX.length) };
  }
  return { role: "collective" };
}

function firstSegment(path: string): string {
  const i = path.indexOf("/");
  return i < 0 ? path : path.slice(0, i);
}

/** `agents/foo.md` → `foo`. Anything else → null. */
function agentNameOf(path: string): string | null {
  if (!path.startsWith(`${AGENTS_DIR}/`) || !path.endsWith(".md")) return null;
  const rest = path.slice(AGENTS_DIR.length + 1, -3);
  return rest.length > 0 && !rest.includes("/") ? rest : null;
}

function skillNameOf(path: string): string | null {
  if (!path.startsWith(`${SKILLS_DIR}/`)) return null;
  const rest = path.slice(SKILLS_DIR.length + 1);
  const name = firstSegment(rest);
  return name.length > 0 && !name.startsWith(".") ? name : null;
}

function membershipShaped(path: string): boolean {
  const head = firstSegment(path).toLowerCase().replace(/\.(md|json|ya?ml|txt|csv)$/, "");
  return MEMBERSHIP_SHAPED.includes(head);
}

async function projectScope(
  scopeId: string,
  sources: ConformationSources,
  harness: string,
  holes: Hole[],
): Promise<ScopeNode> {
  const { kind, ref } = parseScope(scopeId);
  const { role, projectId } = roleOf(scopeId);

  if (role === "unknown") {
    // A scope whose kind does not parse is the shape of the one fail-open this
    // organisation has actually found (doc/09-scales.md). It is never smoothed over.
    holes.push({
      scopeId,
      question: "What kind of scope is this?",
      why: "the id does not parse to one of the five upstream kinds; a permission fall-through on an unparseable scope is how the run-trigger fail-open happened",
    });
  }

  const node: ScopeNode = {
    scopeId,
    kind,
    ref,
    role,
    ...(projectId !== undefined ? { projectId } : {}),
    agents: [],
    skills: [],
    hasMemory: false,
    membershipInFolders: [],
  };

  if (role === "project") {
    if (!sources.roster) {
      holes.push({
        scopeId,
        question: "Who is on this project's roster?",
        why: "no roster source was wired; membership is upstream's ProjectStore and is never read from the workspace",
      });
    } else {
      const roster = await sources.roster(scopeId);
      if (roster) node.roster = roster;
      else {
        holes.push({
          scopeId,
          question: "Who is on this project's roster?",
          why: "the scope carries the reserved project prefix but ProjectStore returned nothing for it",
        });
      }
    }
  }

  if (!sources.workspaceFiles) {
    holes.push({
      scopeId,
      question: "What agents, skills and memory does this scope hold?",
      why: "no workspace source was wired",
    });
    return node;
  }

  const files = await sources.workspaceFiles(scopeId);
  const inert = !WORKSPACE_AGENTS_WORK_ON.has(harness);

  for (const path of files) {
    if (path === MEMORY_FILE) node.hasMemory = true;
    if (membershipShaped(path)) node.membershipInFolders.push(path);

    const skill = skillNameOf(path);
    if (skill && !node.skills.includes(skill)) node.skills.push(skill);

    const name = agentNameOf(path);
    if (!name) continue;

    if (!sources.readFile || !sources.parseAgent) {
      node.agents.push({
        name,
        path,
        description: "",
        tools: [],
        ok: false,
        error: "no reader or parser wired; the file exists but was not opened",
        inert,
      });
      continue;
    }
    const raw = await sources.readFile(scopeId, path);
    if (raw === null) {
      node.agents.push({ name, path, description: "", tools: [], ok: false, error: "unreadable", inert });
      continue;
    }
    try {
      const parsed = sources.parseAgent(name, raw);
      node.agents.push({ name, path, description: parsed.description, tools: parsed.tools, ok: true, inert });
    } catch (e) {
      // A definition that does not parse is invisible to `delegate` at call time
      // and produces a runtime error rather than a startup one. Surfacing it here
      // is most of the value of parsing at all.
      node.agents.push({
        name,
        path,
        description: "",
        tools: [],
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        inert,
      });
    }
  }

  if (node.membershipInFolders.length > 0) {
    holes.push({
      scopeId,
      question: "Why is there a membership-shaped path in this scope's workspace?",
      why: `found ${node.membershipInFolders.join(", ")} — not read as membership (ADR-0008). Either it is documentation, or it is a second answer to who may read this, and the second answer is the one that loses silently`,
    });
  }

  if (inert && node.agents.length > 0) {
    holes.push({
      scopeId,
      question: `Do this scope's ${node.agents.length} agent definitions run on harness '${harness}'?`,
      why: "no — workspace-defined agents are parsed only by pi-tools.ts; claude hardcodes three and codex/opencode delegate inside their CLI",
    });
  }

  return node;
}

function edgesFrom(
  messages: TapeMessage[],
  windows: readonly Participation[],
): { edges: Edge[]; byVia: Record<Attribution, number>; total: number } {
  const byKey = new Map<string, Edge>();
  const byVia: Record<Attribution, number> = { declared: 0, role: 0, window: 0, ambiguous: 0, none: 0 };
  let total = 0;
  for (const m of messages) {
    // An overheard record is not addressed to anyone. Counting it as an edge
    // would invent a conversation out of proximity.
    if (m.overheard) continue;
    total += 1;
    const { author: from, via } = attributeMessage(m, windows);
    byVia[via] += 1;
    const targets = m.to && m.to.length > 0 ? m.to : ["*"];
    for (const to of targets) {
      if (to === from) continue;
      const key = `${m.scopeId} ${from} ${to} ${via}`;
      const found = byKey.get(key);
      if (found) {
        found.messages += 1;
        if (m.at > found.lastAt) found.lastAt = m.at;
      } else {
        byKey.set(key, { from, to, scopeId: m.scopeId, messages: 1, lastAt: m.at, via });
      }
    }
  }
  const edges = [...byKey.values()].sort((a, b) => b.messages - a.messages || a.from.localeCompare(b.from));
  return { edges, byVia, total };
}

/**
 * The structural fingerprint: scopes, roles, roster sizes, agent names, skills.
 *
 * Excludes timestamps and message counts on purpose — those move on every turn,
 * and a digest that moves on every turn cannot distinguish "the system changed
 * shape" from "somebody said something", which is the only question it is for.
 */
function digestOfStructure(scopes: ScopeNode[]): string {
  const parts = scopes
    .map((s) =>
      [
        s.scopeId,
        s.role,
        s.roster ? `roster:${s.roster.members.length}@${s.roster.version}` : "roster:none",
        `agents:${s.agents.map((a) => a.name).sort().join(",")}`,
        `skills:${[...s.skills].sort().join(",")}`,
        `memory:${s.hasMemory ? "1" : "0"}`,
      ].join("|"),
    )
    .sort();
  return digestOf(parts.join("\n"));
}

/**
 * Project the system's conformation and communication graph.
 *
 * Read-only by construction: there is no write port on `ConformationSources`.
 * ADR-0008's enforcing test is that this stays true — if answering a question
 * about conformation ever requires persisting a fact, the fact belongs to a
 * store that already exists.
 */
export async function projectConformation(
  sources: ConformationSources,
  opts: ProjectOptions,
): Promise<Conformation> {
  const now = opts.now ?? Date.now;
  const holes: Hole[] = [];
  const scopeIds = await sources.scopes();

  const scopes: ScopeNode[] = [];
  for (const scopeId of scopeIds) {
    scopes.push(await projectScope(scopeId, sources, opts.harness, holes));
  }

  let edges: Edge[] = [];
  if (!sources.messages) {
    holes.push({
      question: "Who has been talking to whom?",
      why: "no message source was wired; the durable substrate is the session tape — the audit log is in-memory and capped, and run_activity is TTL-swept",
    });
  } else {
    const all: TapeMessage[] = [];
    for (const scopeId of scopeIds) all.push(...(await sources.messages(scopeId)));
    const windows = sources.participants ? await sources.participants() : [];
    if (!sources.participants) {
      holes.push({
        question: "Which principal spoke in each session?",
        why: "no participant source was wired, so nothing can be recovered from membership windows and attribution falls back to whatever the record declared",
      });
    }
    const built = edgesFrom(all, windows);
    edges = built.edges;

    /**
     * The finding that this projector was built to produce, and the reason it
     * reports rather than renders. **[ran]** 2026-08-06, two real turns on `pi`:
     *
     *   personal:U1, actor with no displayName  → 2 records, both unattributed
     *   personal:U2, actor displayName "Ada"    → 1 record "Ada", 1 unattributed
     *
     * `meta.author` is written from `actor.displayName` and from nothing else
     * (`core/orchestrator.ts:2170`), so authorship is a mutable human label, not
     * a principal id — and it is absent whenever the surface does not supply one.
     * The second unattributed record in U2's scope is the ASSISTANT's own reply:
     * the agent, the most active actor in any agent OS, is anonymous in its own
     * communication record.
     *
     * A graph that silently drew those as one node called "unattributed" would
     * have looked complete and merged every distinct speaker into one.
     */
    if (built.byVia.ambiguous > 0) {
      holes.push({
        question: `Which of several participants spoke in ${built.byVia.ambiguous} of ${built.total} messages?`,
        why: "more than one membership window covered the record and none was picked. Upstream's own attributedTurns join would count the turn under every candidate, which a usage metric tolerates and a communication graph must not — an edge from somebody who did not speak is worse than no edge",
      });
    }
    if (built.byVia.none > 0) {
      holes.push({
        question: `Who authored the ${built.byVia.none} of ${built.total} messages that stayed unattributed?`,
        why: "no declared author, not an assistant turn, and no membership window covered them. meta.author is written only from actor.displayName (core/orchestrator.ts:2170), never from the principal id the turn already holds — so a surface that supplies no display name leaves nothing to recover from",
      });
    }
    if (built.byVia.window > 0) {
      holes.push({
        question: `Are the ${built.byVia.window} window-attributed messages exactly right?`,
        why: "recovered by timestamp against ParticipantWindow.validFrom/validTo, while upstream attributes on validFromSeq/validToSeq (memory-session-store.ts:494) and does not expose the seq pair. The two agree except at a window boundary; the residual is unmeasured and is what the upstream proposal asks to close",
      });
    }

    if (all.length === 0) {
      holes.push({
        question: "Who has been talking to whom?",
        why: "the tape returned no message records for any visible scope",
      });
    }
  }

  if (!scopes.some((s) => s.role === "system")) {
    holes.push({
      question: "Where is the system scope?",
      why: "no org: scope is visible, so global/ — the read-only layer mounted into every other scope, and the natural home for a system agent repository — cannot be projected",
    });
  }

  // The system agent repository is mounted into every scope and unreachable by
  // `delegate`: agentDefinitionPath yields `agents/<name>.md` and isSafeSkillName
  // forbids `/`, so no name resolves into the `global` mount. Reported whenever
  // there is something there to reach, because the folder existing is what makes
  // the gap cost something.
  const system = scopes.find((s) => s.role === "system");
  if (system && system.agents.length > 0) {
    holes.push({
      scopeId: system.scopeId,
      question: `Can the ${system.agents.length} system agents be delegated to from another scope?`,
      why: "no — they mount at global/agents/<name>.md and agent names cannot contain '/', so no name addresses them (doc/12-conformation.md § The unreachable repository)",
    });
  }

  return {
    at: now(),
    harness: opts.harness,
    scopes,
    edges,
    holes,
    digest: digestOfStructure(scopes),
  };
}

/** A short human-readable rendering. The JSON is the artefact; this is for reading it. */
export function renderConformation(c: Conformation): string {
  const lines: string[] = [];
  lines.push(`conformation @ ${new Date(c.at).toISOString()}  harness=${c.harness}  digest=${c.digest}`);
  lines.push("");
  for (const s of c.scopes) {
    const roster = s.roster ? `  roster=${s.roster.members.length}@v${s.roster.version}` : "";
    lines.push(`${s.role.padEnd(10)} ${s.scopeId}${roster}`);
    for (const a of s.agents) {
      const flags = [a.ok ? null : `BROKEN: ${a.error}`, a.inert ? "INERT" : null].filter(Boolean).join(" ");
      lines.push(`  agent  ${a.name} [${a.tools.join(" ")}] ${a.description} ${flags}`.trimEnd());
    }
    if (s.skills.length) lines.push(`  skills ${s.skills.join(", ")}`);
    if (s.hasMemory) lines.push("  memory MEMORY.md");
    for (const p of s.membershipInFolders) lines.push(`  !! membership-shaped path: ${p}`);
  }
  lines.push("");
  lines.push(`edges (${c.edges.length}):`);
  for (const e of c.edges) {
    lines.push(`  ${e.from} -> ${e.to}  ${e.messages} msg  via:${e.via}  ${e.scopeId}`);
  }
  lines.push("");
  lines.push(`holes (${c.holes.length}) — these are the deliverable:`);
  for (const h of c.holes) lines.push(`  [${h.scopeId ?? "-"}] ${h.question}\n      ${h.why}`);
  return lines.join("\n");
}
