/**
 * Seed a demonstrable system: an org with system agents, a project with a real
 * roster, and agent trees declared in markdown.
 *
 * This exists because the first version of that demo lived only in a runtime
 * data directory. It rendered, and it was **unreproducible** — the files were
 * created by hand, gitignored as runtime state, and would have vanished with the
 * container. A demo nobody else can recreate is a screenshot, not a feature.
 *
 *   cd ai-flows && node --env-file=/path/to/core.env scripts/seed-demo.ts
 *
 * Idempotent: rerunning it overwrites the same files and reuses the project if
 * one with the same name already exists.
 *
 * ## Two write paths, and each is the only one that works for its layer
 *
 * `ro-layers.ts` opens with `if (layer.mode === "rw") continue;` — it materialises
 * **read-only layers only**, from the WorkspaceStore, on every turn. So:
 *
 * - **System agents (`org:`) are written to the STORE.** The org scope mounts as
 *   the read-only `global/` layer and is rebuilt from the store each turn. It is
 *   also the *only* way in: `scopeFor` returns `personal`, `group` or `channel`
 *   and never `org`, so no conversation resolves to the system scope and a turn
 *   cannot write there. An earlier version of this script tried, and quietly
 *   created a group scope called `seed-org` containing the kernel agents.
 * - **Project agents are written through a TURN.** The read-write layer is the
 *   persisted sandbox workspace and is never materialised from the store.
 *
 * ## Why project files cannot go through WorkspaceStore
 *
 * The first version of this called `workspace.write()`, which is the obvious API
 * and produces a demo that is **visible and unusable**. Measured directly:
 * after writing six agent files to the store, `ls -1 agents/` inside that scope's
 * sandbox returned two. A seventh file written and listed in the same minute did
 * not appear either.
 *
 * The materialisation runs sandbox → store, not store → sandbox: `write` from
 * inside a turn is persisted back, and a store write does not reach the running
 * workspace. So the conformation view — which reads the store — would show a
 * project full of agents that `delegate` cannot open. That is the failure this
 * repository keeps finding, and it was in the seed script for this feature.
 *
 * Writing through a turn is also how upstream's own `delegate-smoke.ts` does it
 * ("the parent authors `agents/calculator.md`"), which should have been the hint.
 *
 * ## What the `subagents:` key is, and is not
 *
 * Upstream's `parseAgentDefinition` validates `name`, `description`, `tools` and
 * the body, and ignores every other frontmatter key — so `subagents:` rides along
 * in a file that stays a valid, delegatable agent. It declares **composition**,
 * not a runtime hierarchy: a delegated child is built without `runChild`
 * (`pi-harness.ts:1313-1318`), so an agent cannot delegate to its own subagent.
 * The orchestrating session reads the tree and delegates to each named agent
 * itself, which is the pattern llmunix's SystemAgent uses.
 */
import { createCoreClient } from "../src/core-client.ts";
import { loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";

const config = loadConfig();
const { projects, workspace } = buildApp({ ...config, port: 0 });
const core = createCoreClient({
  baseUrl: process.env.CORE_API_URL ?? "http://localhost:8080",
  ...(process.env.CORE_SIGNING_SECRET ? { signingSecret: process.env.CORE_SIGNING_SECRET } : {}),
});
const OWNER = process.env.SEED_OWNER ?? "matias";
const MEMBERS = (process.env.SEED_MEMBERS ?? "ada,priya").split(",").map((s) => s.trim()).filter(Boolean);

type Conv = { kind: "dm" | "group"; threadRef: string; channelRef?: string };

/**
 * Write one file into a scope's live workspace, by asking a turn to do it —
 * and then **read it back**, because the reply is not evidence.
 *
 * The first version scored the write by testing whether the model's reply
 * mentioned the filename. That is the failure this repository has a rule
 * against — a check that measures phrasing rather than the mechanism — and it
 * failed in the direction that costs the most: it reports `ok` for a write that
 * never happened, because a model that says "I created LedgerLead.md" passes
 * whether or not it did. **Measured 2026-08-09: five files reported `ok`, two
 * existed on disk.** The demo it produced looked seeded and was half empty, and
 * the conformation view rendered it without complaint.
 *
 * So the check is now the file. `scopeFor` is not reachable from here, but the
 * WorkspaceStore is the same store the view reads, which makes it the right
 * question to ask: not "did the turn claim success" but "can the thing that
 * renders the demo see the file".
 */
async function writeInScope(conversation: Conv, actor: string, scopeId: string, path: string, content: string) {
  await core.turn({
    surface: "seed-demo",
    actor: { externalId: actor, displayName: actor },
    conversation,
    text:
      `Use your write tool to create the file at exactly \`${path}\` with exactly this content ` +
      `and nothing else, then reply with just the path you wrote:\n\n${content}`,
  });
  const written = await workspace.read(scopeId, path);
  const ok = written !== null;
  console.log(`  ${ok ? "ok     " : "MISSING"} ${path}${ok ? "" : "  — the turn replied, the file is not there"}`);
  return ok;
}

function agent(desc: string, tools: string[], subagents: string[], body: string): string {
  return [
    "---",
    `description: ${desc}`,
    `tools: [${tools.join(", ")}]`,
    ...(subagents.length ? [`subagents: [${subagents.join(", ")}]`] : []),
    "---",
    body.trim(),
    "",
  ].join("\n");
}

// ---- system scope: the kernel agents, mounted read-only into every scope ------
// Written in the org scope's own conversation, so they land where global/ is served from.
console.log(`system agents (org scope, via WorkspaceStore — the ro layer is rebuilt from it)`);

const SYSTEM: Array<[string, string]> = [
  [
    "agents/SystemAgent.md",
    agent(
      "Org-wide orchestrator. Decomposes a goal into bounded pieces and hands each to the agent that owns it.",
      ["read", "write", "execute", "history", "memory"],
      ["MemoryAnalysisAgent", "MemoryConsolidationAgent"],
      "You are the system orchestrator. Decompose the goal into pieces each finishable by one agent, hand each to the agent named in your subagents list, and report what came back.",
    ),
  ],
  [
    "agents/MemoryAnalysisAgent.md",
    agent(
      "Reads execution traces and turns raw events into structured entries.",
      ["read", "write", "memory"],
      [],
      "Read the traces and produce structured entries: what was attempted, what happened, what is durable. Record observations; draw no conclusion the trace does not support.",
    ),
  ],
  [
    "agents/MemoryConsolidationAgent.md",
    agent(
      "Consolidates short-term entries into long-term learnings.",
      ["read", "write", "memory"],
      [],
      "Consolidate short-term entries. Keep only what will still be true next month.",
    ),
  ],
];

// ---- a project: a group scope with a real roster ----------------------------
const existing = (await projects.listForMember(OWNER)).find((p) => p.name === "Ledger Rewrite");
const project = existing ?? (await projects.create({ name: "Ledger Rewrite", ownerId: OWNER }));
for (const m of MEMBERS) await projects.addMember(project.id, OWNER, m);
const groupRef = `web-project-${project.id}`;
const projConv: Conv = { kind: "group", threadRef: `seed-proj-${Date.now()}`, channelRef: groupRef };

const PROJECT_AGENTS: Array<[string, string]> = [
  [
    "agents/LedgerLead.md",
    agent(
      "Owns the ledger rewrite. Splits work and routes it to the specialists.",
      ["read", "write", "execute"],
      ["SchemaAgent", "MigrationAgent", "ReviewAgent"],
      "You lead the ledger rewrite. Split the goal, route each piece to the agent in your subagents list, and report what came back.",
    ),
  ],
  ["agents/SchemaAgent.md", agent("Designs and checks the ledger schema.", ["read", "write"], [], "Propose or verify schema changes. State the migration cost of each.")],
  [
    "agents/MigrationAgent.md",
    agent("Writes and dry-runs migrations.", ["read", "write", "execute"], [], "Write the migration and dry-run it. Never run it against a live database."),
  ],
  ["agents/ReviewAgent.md", agent("Reviews a change against the ledger invariants.", ["read"], [], "Review the change. Report only defects you can point at a line for.")],
  /**
   * Deliberately dangling: `AnomalyScanner` has no file.
   *
   * Kept because the interesting behaviour is what the view and the composer do
   * with a broken composition. A declared name is a claim and only a file is a
   * fact; a tree that renders a typo as working composition is worse than none.
   */
  [
    "agents/DataQualityAgent.md",
    agent("Checks the ledger for drift and duplicates.", ["read", "execute"], ["AnomalyScanner"], "Check for drift and duplicates. Delegate the scan to AnomalyScanner."),
  ],
];

const org = `org:${config.orgId}`;
await workspace.ensureScope(org);
for (const [path, content] of SYSTEM) {
  await workspace.write(org, path, content);
  console.log(`  ok   ${path}`);
}
console.log(`\nproject ${groupRef} — roster ${OWNER} + ${MEMBERS.join(", ")}`);
const projectScope = `group:${groupRef}`;
const missing: string[] = [];
for (const [path, content] of PROJECT_AGENTS) {
  // One retry, because the observed failure is a turn that answers without
  // writing rather than a turn that errors — and a second ask usually lands.
  let ok = await writeInScope(projConv, OWNER, projectScope, path, content);
  if (!ok) ok = await writeInScope(projConv, OWNER, projectScope, path, content);
  if (!ok) missing.push(path);
}

console.log(`\nseeded. LedgerLead -> SchemaAgent, MigrationAgent, ReviewAgent`);
console.log(`        DataQualityAgent -> AnomalyScanner (deliberately missing)`);
if (missing.length) {
  // Exit non-zero. A seed that half-worked and returned success is how the demo
  // came to show two agents where five were reported written.
  console.error(`\n${missing.length} project agent file(s) never landed: ${missing.join(", ")}`);
  console.error(`The system is under-seeded. Rerun — this script is idempotent.`);
  process.exit(1);
}
process.exit(0);
