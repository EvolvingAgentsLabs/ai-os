import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeFromAgent } from "../src/compose.ts";
import type { AgentRecord, ScopeNode } from "../src/conformation.ts";

function agent(name: string, subagents: string[] = []): AgentRecord {
  return {
    name,
    path: `agents/${name}.md`,
    description: `${name} does its thing.`,
    tools: ["read"],
    ok: true,
    inert: false,
    subagents,
    missingSubagents: [],
  };
}

function scope(scopeId: string, agents: AgentRecord[]): ScopeNode {
  return {
    scopeId,
    kind: scopeId.startsWith("org") ? "org" : "group",
    ref: scopeId.slice(scopeId.indexOf(":") + 1),
    role: scopeId.startsWith("org") ? "system" : "project",
    agents,
    skills: [],
    hasMemory: false,
    membershipInFolders: [],
  };
}

const project = () =>
  scope("group:web-project-1", [
    agent("Lead", ["Schema", "Migration", "Review"]),
    agent("Schema"),
    agent("Migration"),
    agent("Review"),
  ]);

describe("composing a tree into steps", () => {
  it("makes one step per leaf, in declared order", () => {
    const plan = composeFromAgent({ scope: project(), root: "Lead", goal: "rewrite the ledger" })!;
    assert.deepEqual(
      plan.steps.map((s) => s.agent),
      ["Schema", "Migration", "Review"],
    );
    assert.ok(plan.steps.every((s) => s.via === "delegate"));
  });

  it("gives the orchestrator no step of its own — its work IS the sequence", () => {
    const plan = composeFromAgent({ scope: project(), root: "Lead", goal: "g" })!;
    assert.ok(!plan.steps.some((s) => s.agent === "Lead"));
  });

  it("asks the session to delegate by name, so the agent's own file governs", () => {
    // Not a prompt this module invents: the step invokes the real mechanism.
    const plan = composeFromAgent({ scope: project(), root: "Lead", goal: "g" })!;
    assert.match(plan.steps[0]!.intent, /`delegate` tool with agent="Schema"/);
    assert.match(plan.steps[0]!.intent, /agents\/Schema\.md/);
  });

  it("runs a childless agent as a single step rather than nothing", () => {
    const plan = composeFromAgent({ scope: project(), root: "Schema", goal: "g" })!;
    assert.equal(plan.steps.length, 1);
    assert.equal(plan.steps[0]!.agent, "Schema");
  });

  it("returns null for an agent that does not exist", () => {
    assert.equal(composeFromAgent({ scope: project(), root: "Nope", goal: "g" }), null);
  });
});

describe("what a declared tree gets wrong, and what happens then", () => {
  it("creates no step for a declared name with no file, and says so", () => {
    const s = scope("group:web-project-1", [agent("Lead", ["Schema", "Ghost"]), agent("Schema")]);
    const plan = composeFromAgent({ scope: s, root: "Lead", goal: "g" })!;
    assert.deepEqual(
      plan.steps.map((x) => x.agent),
      ["Schema"],
    );
    assert.deepEqual(plan.missing, ["Ghost"]);
    assert.ok(plan.notes.some((n) => /only a file is a fact/.test(n)));
  });

  it("does not run an agent twice when the tree cycles", () => {
    // Hand-declared composition makes cycles reachable, and an unguarded walk is
    // a hang rather than an error.
    const s = scope("group:web-project-1", [agent("A", ["B"]), agent("B", ["A"])]);
    const plan = composeFromAgent({ scope: s, root: "A", goal: "g" })!;
    assert.deepEqual(plan.cycles, ["A"]);
    assert.ok(plan.steps.length <= 1);
  });

  it("flattens a deeper tree and says that it flattened it", () => {
    const s = scope("group:web-project-1", [
      agent("Top", ["Mid"]),
      agent("Mid", ["Leaf1", "Leaf2"]),
      agent("Leaf1"),
      agent("Leaf2"),
    ]);
    const plan = composeFromAgent({ scope: s, root: "Top", goal: "g" })!;
    assert.deepEqual(
      plan.steps.map((x) => x.agent),
      ["Leaf1", "Leaf2"],
    );
    assert.ok(plan.steps.every((x) => x.depth === 2));
    assert.ok(plan.notes.some((n) => /flat sequence/.test(n)));
  });

  it("stops at the step ceiling and reports the truncation", () => {
    // Bounding coverage is fine; bounding it silently reads as full coverage.
    const many = Array.from({ length: 40 }, (_, i) => agent(`A${i}`));
    const s = scope("group:web-project-1", [agent("Wide", many.map((a) => a.name)), ...many]);
    const plan = composeFromAgent({ scope: s, root: "Wide", goal: "g", maxSteps: 5 })!;
    assert.equal(plan.steps.length, 5);
    assert.ok(plan.notes.some((n) => /stopped at 5 steps/.test(n)));
  });
});

describe("system agents cannot be delegated to, and are not pretended into it", () => {
  const system = scope("org:acme", [agent("SystemAgent", ["Analysis"]), agent("Analysis")]);

  it("marks an unreachable agent inline rather than dropping it or faking a delegation", () => {
    const s = scope("group:web-project-1", [agent("Lead", ["Analysis"])]);
    const plan = composeFromAgent({ scope: s, systemScope: system, root: "Lead", goal: "g" })!;
    assert.equal(plan.steps.length, 1);
    assert.equal(plan.steps[0]!.via, "inline");
    assert.match(plan.steps[0]!.intent, /cannot be delegated to from here/);
  });

  it("says an inlined step is worse, rather than letting it read as equivalent", () => {
    const s = scope("group:web-project-1", [agent("Lead", ["Analysis"])]);
    const plan = composeFromAgent({ scope: s, systemScope: system, root: "Lead", goal: "g" })!;
    assert.ok(plan.notes.some((n) => /no isolated context and no tool narrowing/.test(n)));
  });

  it("prefers the local agent when a name exists in both scopes", () => {
    // The workspace mounts the scope's own layer over global/, so a local file
    // shadowing a system one is the same precedence the OS itself applies.
    const s = scope("group:web-project-1", [agent("Lead", ["Analysis"]), agent("Analysis")]);
    const plan = composeFromAgent({ scope: s, systemScope: system, root: "Lead", goal: "g" })!;
    assert.equal(plan.steps[0]!.via, "delegate");
  });
});
