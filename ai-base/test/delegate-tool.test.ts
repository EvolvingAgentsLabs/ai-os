import { test } from "node:test";
import assert from "node:assert/strict";
import { createPiTools, type RunChild } from "../src/harness/pi-tools.ts";
import { CHILD_POLICY } from "../src/agents/agent-definition.ts";

const RESEARCHER = `---
description: Research a bounded question and report evidence.
tools: [read, execute]
---
You research one question at a time. Report evidence, not conclusions.
`;

interface ChildCall {
  agent: string;
  systemPrompt: string;
  task: string;
  tools: readonly string[];
}

function toolsFor(opts: {
  files?: Record<string, string>;
  runChild?: RunChild;
  childTools?: readonly string[];
  readOnly?: boolean;
}) {
  const files = opts.files ?? {};
  const reads: string[] = [];
  const ref = {
    current: {
      read: async (path: string) => {
        reads.push(path);
        return { content: files[path] ?? null, sourceScopeId: null };
      },
    } as any,
    emit: () => {},
    scopeLabel: "personal:U1" as const,
  };
  const tools = createPiTools(ref, {
    ...(opts.runChild ? { runChild: opts.runChild } : {}),
    ...(opts.childTools ? { childTools: opts.childTools } : {}),
    ...(opts.readOnly ? { readOnly: true } : {}),
  });
  return { tools, reads };
}

function runner(tool: { execute: unknown }) {
  return (params: unknown) =>
    (tool.execute as unknown as (id: string, p: unknown) => Promise<{ content: { text: string }[] }>)("call1", params);
}

function scripted(reply: string | { error: string }): { runChild: RunChild; calls: ChildCall[] } {
  const calls: ChildCall[] = [];
  return {
    calls,
    runChild: async (input) => {
      calls.push(input);
      return typeof reply === "string" ? { text: reply } : { text: "", error: reply.error };
    },
  };
}

test("delegate is absent unless the harness can run a child", () => {
  const { tools } = toolsFor({});
  assert.equal(
    tools.find((t) => t.name === "delegate"),
    undefined,
  );
  const { tools: withChild } = toolsFor({ runChild: scripted("ok").runChild });
  assert.ok(withChild.find((t) => t.name === "delegate"));
});

test("a delegated run gets the definition's instructions plus the policy, and only its declared tools", async () => {
  const { runChild, calls } = scripted("The pendulum period is 2.0134 s.");
  const { tools, reads } = toolsFor({ files: { "agents/researcher.md": RESEARCHER }, runChild });
  const out = await runner(tools.find((t) => t.name === "delegate")!)({
    agent: "researcher",
    task: "Compute the exact period for L=1m, amplitude 40 degrees.",
  });

  assert.deepEqual(reads, ["agents/researcher.md"]);
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.equal(call.agent, "researcher");
  assert.match(call.systemPrompt, /Report evidence, not conclusions\./);
  assert.ok(call.systemPrompt.endsWith(CHILD_POLICY));
  assert.deepEqual(call.tools, ["read", "execute"]);
  assert.equal(call.task, "Compute the exact period for L=1m, amplitude 40 degrees.");
  assert.match(out.content[0]!.text, /The pendulum period is 2\.0134 s\./);
});

test("a missing agent file names the path and says how to fix it, without running a child", async () => {
  const { runChild, calls } = scripted("should not run");
  const { tools } = toolsFor({ runChild });
  const out = await runner(tools.find((t) => t.name === "delegate")!)({ agent: "ghost", task: "do something" });
  assert.match(out.content[0]!.text, /no agent 'ghost'/);
  assert.match(out.content[0]!.text, /agents\/ghost\.md/);
  assert.match(out.content[0]!.text, /List agents\//);
  assert.equal(calls.length, 0);
});

test("a malformed definition is reported and no child runs", async () => {
  const { runChild, calls } = scripted("should not run");
  const { tools } = toolsFor({
    files: { "agents/broken.md": "---\ntools: [read]\n---\nNo description.\n" },
    runChild,
  });
  const out = await runner(tools.find((t) => t.name === "delegate")!)({ agent: "broken", task: "go" });
  assert.match(out.content[0]!.text, /must carry a non-empty description/);
  assert.equal(calls.length, 0);
});

test("a definition asking for a tool a child may not have is refused", async () => {
  const { runChild, calls } = scripted("should not run");
  const { tools } = toolsFor({
    files: { "agents/greedy.md": "---\ndescription: Wants cron.\ntools: [read, cron]\n---\nDo it.\n" },
    runChild,
  });
  const out = await runner(tools.find((t) => t.name === "delegate")!)({ agent: "greedy", task: "go" });
  assert.match(out.content[0]!.text, /cron are not available/);
  assert.equal(calls.length, 0);
});

test("an agent name that would escape the agents directory is refused", async () => {
  const { runChild, calls } = scripted("should not run");
  const { tools, reads } = toolsFor({ runChild });
  const out = await runner(tools.find((t) => t.name === "delegate")!)({
    agent: "../../etc/passwd",
    task: "go",
  });
  assert.match(out.content[0]!.text, /agent name must be/);
  assert.equal(calls.length, 0);
  assert.deepEqual(reads, []);
});

test("a child that fails is reported as a failure, not as an empty report", async () => {
  const { runChild } = scripted({ error: "context window exceeded" });
  const { tools } = toolsFor({ files: { "agents/researcher.md": RESEARCHER }, runChild });
  const out = await runner(tools.find((t) => t.name === "delegate")!)({ agent: "researcher", task: "go" });
  assert.match(out.content[0]!.text, /\[error\]/);
  assert.match(out.content[0]!.text, /did not finish: context window exceeded/);
});

test("a child that reports nothing says so rather than returning blank", async () => {
  const { runChild } = scripted("   ");
  const { tools } = toolsFor({ files: { "agents/researcher.md": RESEARCHER }, runChild });
  const out = await runner(tools.find((t) => t.name === "delegate")!)({ agent: "researcher", task: "go" });
  assert.match(out.content[0]!.text, /finished without reporting anything/);
});

test("childTools bounds the tree: a child's tool set carries no delegate", () => {
  const { tools } = toolsFor({ childTools: ["read", "execute", "delegate"] });
  const names = tools.map((t) => t.name);
  assert.deepEqual(names.filter((n) => n === "read" || n === "execute").sort(), ["execute", "read"]);
  assert.ok(!names.includes("delegate"));
  assert.ok(!names.includes("publish"));
});

test("childTools composes with readOnly rather than overriding it", () => {
  const { tools } = toolsFor({ childTools: ["read", "memory", "execute"], readOnly: true });
  const names = tools.map((t) => t.name);
  assert.deepEqual(names, ["memory"]);
});
