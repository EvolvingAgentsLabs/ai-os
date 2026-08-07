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
import { loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";

const config = loadConfig();
const { projects, workspace } = buildApp({ ...config, port: 0 });
const OWNER = process.env.SEED_OWNER ?? "matias";
const MEMBERS = (process.env.SEED_MEMBERS ?? "ada,priya").split(",").map((s) => s.trim()).filter(Boolean);

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
const org = `org:${config.orgId}`;
await workspace.ensureScope(org);

await workspace.write(
  org,
  "agents/SystemAgent.md",
  agent(
    "Org-wide orchestrator. Decomposes a goal into bounded pieces and hands each to the agent that owns it.",
    ["read", "write", "execute", "history", "memory"],
    ["MemoryAnalysisAgent", "MemoryConsolidationAgent"],
    `You are the system orchestrator for this organisation.

Decompose the goal into pieces that can each be finished by one agent, then hand
each piece to the agent named in your \`subagents\` list. Read that agent's own
markdown definition before delegating, so the task you write matches what it can
actually do.

Report what each piece returned. Do not do the work yourself if an agent exists
for it.`,
  ),
);

await workspace.write(
  org,
  "agents/MemoryAnalysisAgent.md",
  agent(
    "Reads execution traces and turns raw events into structured entries.",
    ["read", "write", "memory"],
    [],
    `Read the traces you are given and produce structured entries: what was
attempted, what happened, and what is durable enough to keep. Record
observations; do not draw conclusions the trace does not support.`,
  ),
);

await workspace.write(
  org,
  "agents/MemoryConsolidationAgent.md",
  agent(
    "Consolidates short-term entries into long-term learnings.",
    ["read", "write", "memory"],
    [],
    `Take short-term entries and consolidate them. Keep only what will still be
true next month. Drop anything that is a restatement of the task rather than a
learning.`,
  ),
);

// ---- a project: a group scope with a real roster ----------------------------
const existing = (await projects.listForMember(OWNER)).find((p) => p.name === "Ledger Rewrite");
const project = existing ?? (await projects.create({ name: "Ledger Rewrite", ownerId: OWNER }));
for (const m of MEMBERS) await projects.addMember(project.id, OWNER, m);

const scope = `group:web-project-${project.id}`;
await workspace.ensureScope(scope);

await workspace.write(
  scope,
  "agents/LedgerLead.md",
  agent(
    "Owns the ledger rewrite. Splits work and routes it to the specialists.",
    ["read", "write", "execute"],
    ["SchemaAgent", "MigrationAgent", "ReviewAgent"],
    `You lead the ledger rewrite. Split the goal, route each piece to the agent in
your subagents list, and report what came back.`,
  ),
);
await workspace.write(
  scope,
  "agents/SchemaAgent.md",
  agent("Designs and checks the ledger schema.", ["read", "write"], [], "Propose or verify schema changes. State the migration cost of each."),
);
await workspace.write(
  scope,
  "agents/MigrationAgent.md",
  agent(
    "Writes and dry-runs migrations.",
    ["read", "write", "execute"],
    [],
    "Write the migration and dry-run it. Never run it against a live database.",
  ),
);
await workspace.write(
  scope,
  "agents/ReviewAgent.md",
  agent("Reviews a change against the ledger invariants.", ["read"], [], "Review the change. Report only defects you can point at a line for."),
);

/**
 * Deliberately dangling: `AnomalyScanner` has no file.
 *
 * Kept in the seed rather than cleaned up, because the interesting behaviour is
 * what the view does with a broken composition. A declared name is a claim and
 * only a file is a fact, and a tree that renders a typo as a working composition
 * is worse than no tree at all. This is the fixture for that path.
 */
await workspace.write(
  scope,
  "agents/DataQualityAgent.md",
  agent(
    "Checks the ledger for drift and duplicates.",
    ["read", "execute"],
    ["AnomalyScanner"],
    "Check for drift and duplicates. Delegate the scan to AnomalyScanner.",
  ),
);

await workspace.write(scope, "memory/MEMORY.md", "- Ledger rewrite kicked off\n");

console.log(`system scope  ${org} — 3 agents (SystemAgent + 2 subagents)`);
console.log(`project       ${scope}`);
console.log(`  roster      ${OWNER} + ${MEMBERS.join(", ")}`);
console.log(`  agents      LedgerLead -> SchemaAgent, MigrationAgent, ReviewAgent`);
console.log(`              DataQualityAgent -> AnomalyScanner (deliberately missing)`);
process.exit(0);
