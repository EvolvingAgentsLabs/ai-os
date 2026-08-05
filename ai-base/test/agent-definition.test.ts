import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentDefinitionPath,
  agentNameFromPath,
  CHILD_POLICY,
  childSystemPrompt,
  parseAgentDefinition,
} from "../src/agents/agent-definition.ts";

const VALID = `---
name: researcher
description: Research a bounded question and report evidence.
tools: [read, execute]
---
You research one question at a time. Report evidence, not conclusions.
`;

test("a well-formed definition parses into name, description, tools and instructions", () => {
  const d = parseAgentDefinition("researcher", VALID);
  assert.equal(d.name, "researcher");
  assert.equal(d.description, "Research a bounded question and report evidence.");
  assert.deepEqual(d.tools, ["read", "execute"]);
  assert.match(d.instructions, /^You research one question at a time\./);
  assert.ok(!d.instructions.includes(CHILD_POLICY));
});

test("the child prompt is the body plus the delegation policy", () => {
  const prompt = childSystemPrompt(parseAgentDefinition("researcher", VALID));
  assert.match(prompt, /Report evidence, not conclusions\./);
  assert.ok(prompt.endsWith(CHILD_POLICY));
});

test("omitting tools grants the full delegated set, not nothing", () => {
  const d = parseAgentDefinition(
    "consult",
    `---
description: Provide an independent expert analysis.
---
Give one independent read on the question.
`,
  );
  assert.ok(d.tools.includes("read"));
  assert.ok(d.tools.includes("memory"));
  assert.ok(d.tools.length > 1);
});

test("a tool outside the delegated set is refused, and the message names the allowed ones", () => {
  assert.throws(
    () =>
      parseAgentDefinition(
        "escalator",
        `---
description: Tries to reach further than a child may.
tools: [read, cron, delegate]
---
Do the thing.
`,
      ),
    /cron, delegate are not available.*allowed: background, execute, history, memory, publish, read, write/s,
  );
});

test("a frontmatter name that contradicts the file name is refused", () => {
  assert.throws(
    () =>
      parseAgentDefinition(
        "researcher",
        `---
name: impostor
description: Claims to be another agent.
---
Do the thing.
`,
      ),
    /does not match its file name/,
  );
});

test("a missing description or empty body is refused", () => {
  assert.throws(
    () => parseAgentDefinition("x", "---\ntools: [read]\n---\nBody.\n"),
    /must carry a non-empty description/,
  );
  assert.throws(
    () => parseAgentDefinition("x", "---\ndescription: Has no body.\n---\n\n"),
    /body must carry the agent's instructions/,
  );
});

test("an unsafe agent name is refused before the file is even parsed", () => {
  assert.throws(() => parseAgentDefinition("../escape", VALID), /agent name must be/);
  assert.throws(() => parseAgentDefinition("", VALID), /agent name must be/);
});

test("a file without a frontmatter fence is refused", () => {
  assert.throws(() => parseAgentDefinition("x", "no fence here\n"), /must start with a --- fence/);
});

test("building the path validates the name, so traversal never reaches the read layer", () => {
  assert.throws(() => agentDefinitionPath("../../etc/passwd"), /agent name must be/);
  assert.throws(() => agentDefinitionPath("nested/agent"), /agent name must be/);
  assert.throws(() => agentDefinitionPath(""), /agent name must be/);
});

test("paths round-trip, and only well-formed agent paths yield a name", () => {
  assert.equal(agentDefinitionPath("researcher"), "agents/researcher.md");
  assert.equal(agentNameFromPath("agents/researcher.md"), "researcher");
  assert.equal(agentNameFromPath("agents/nested/researcher.md"), undefined);
  assert.equal(agentNameFromPath("skills/researcher.md"), undefined);
  assert.equal(agentNameFromPath("agents/../escape.md"), undefined);
  assert.equal(agentNameFromPath("agents/researcher.txt"), undefined);
});

test("duplicate tool names collapse", () => {
  const d = parseAgentDefinition(
    "dup",
    `---
description: Declares the same tool twice.
tools: [read, read, execute]
---
Do the thing.
`,
  );
  assert.deepEqual(d.tools, ["read", "execute"]);
});
