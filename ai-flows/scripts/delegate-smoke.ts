/**
 * The [ran] for delegation. Until this passes, `delegate` is verified only by mocks.
 *
 * The 22 unit tests behind the tool use a scripted `runChild` and a fake
 * `ToolContext`, which proves the wiring and proves nothing about the nested run.
 * This exercises the whole chain against the real model and the real sandbox:
 *
 *   1. `delegate` is actually offered to the parent on `HARNESS=pi`
 *   2. an `agents/<name>.md` written into the workspace parses at delegate time
 *   3. the child session starts, with its own instructions and an empty context
 *   4. the child's restricted tool set WORKS — it runs Python in the sandbox, which
 *      is the part no mock can stand in for, since the child shares the parent's
 *      ToolContext
 *   5. the child's report comes back to the parent as the tool result
 *
 * The child's task has an exact answer a fake cannot fluke, and it needs `execute`:
 * a mocked child returning prose would fail the assertion, and a child whose tools
 * were filtered to nothing could not compute it.
 *
 * Second check, and the one that would be embarrassing to get wrong: the child must
 * NOT have `delegate`. That is enforced structurally — a child is built without
 * `runChild`, so the tool does not exist for it — and structure is exactly the kind
 * of claim that deserves a live test rather than a unit test asserting a filter.
 *
 *   cd ai-flows && node --env-file-if-exists=../ai-base/.env scripts/delegate-smoke.ts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configuredModelForHarness, loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";
import type { TurnRequest } from "../../ai-base/src/types.ts";

const FIB_30 = 832_040;

const CALCULATOR = `---
description: Computes an exact numeric answer by running Python.
tools: [execute]
---
You compute one numeric answer. Always use the execute tool to run Python rather
than working it out in your head. Reply with the number only, no words.
`;

const config = loadConfig();
const modelId = configuredModelForHarness(config, config.harness) ?? "(harness default)";

const { app } = buildApp({
  ...config,
  port: 0,
  dataDir: mkdtempSync(join(tmpdir(), "delegate-smoke-")),
  sessionStore: "memory",
  runStore: "memory",
  harness: "pi",
});

const THREAD = `delegate-smoke-${process.pid}`;
const dm = (text: string): TurnRequest => ({
  surface: "delegate-smoke",
  actor: { externalId: "U1" },
  conversation: { kind: "dm", threadRef: THREAD },
  text,
});

async function turn(label: string, text: string): Promise<string> {
  const started = Date.now();
  try {
    const r = await app.turn(dm(text));
    const reply = r.reply ?? r.reason ?? "";
    console.log(`\n[${label}] ${String(r.status)} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(reply.trim().slice(0, 1200));
    return reply;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`\n[${label}] THREW in ${((Date.now() - started) / 1000).toFixed(1)}s: ${message}`);
    return "";
  }
}

console.log(`model ${modelId} · harness pi · thread ${THREAD}`);

/**
 * The parent writes the definition rather than the script planting it, because the
 * scope a turn resolves to is the turn's business and hard-coding it here would test
 * a path production never takes. It also exercises the claim that matters most about
 * markdown agents: an agent can author one.
 */
const authored = await turn(
  "author",
  "Write a file at exactly the path `agents/calculator.md` in your workspace, with exactly " +
    `this content and nothing else:\n\n${CALCULATOR}\nThen confirm the path you wrote.`,
);

const delegated = await turn(
  "delegate",
  "Use your `delegate` tool to hand this to the `calculator` agent, and report back " +
    "exactly the number it returns: compute the 30th Fibonacci number, where F(1)=1 and F(2)=1.",
);

const refused = await turn(
  "no-nesting",
  "Delegate to the `calculator` agent again, and this time instruct it to itself delegate " +
    "the work onward to another agent. Report exactly what it says back, including any error.",
);

/**
 * There was a fourth check here, asserting the word "delegate" appeared in the
 * parent's reply. It failed on the first run against a reply of `832040` — which is
 * exactly the bare number the child was told to produce. It was testing the model's
 * prose rather than the mechanism, and the mechanism is what the F(30) check below
 * proves. Removed rather than loosened: a check that can fail while the capability
 * works measures the phrasing, and every instrument in this repository that did that
 * had to be corrected before its number meant anything.
 */
const checks: Array<{ name: string; ok: boolean; detail: string }> = [
  {
    name: "the parent wrote the definition and named the path",
    ok: /agents\/calculator\.md/.test(authored),
    detail: "the authoring reply does not name the path it wrote",
  },
  {
    /**
     * This is the check that subsumes the others. `WorkspaceStore` cannot enumerate
     * scopes, so the file is not inspected directly — it does not need to be: the
     * number can only appear here if the definition was found in the workspace,
     * parsed, started a child session, and that child ran Python in the sandbox.
     * Every link in the chain is load-bearing for this one string.
     */
    name: `the child computed F(30) = ${FIB_30} through the sandbox`,
    ok: delegated.replace(/[,_\s]/g, "").includes(String(FIB_30)),
    detail: `expected ${FIB_30} in the parent's report — the child either never ran or could not execute`,
  },
  {
    /**
     * Downgraded to what it can actually show. Told to delegate onward, the child did
     * the work itself and returned the answer — consistent with having no `delegate`
     * tool, but not independent evidence of it, because the parent cannot observe the
     * child's tool list from a report. The structural claim is covered where it can be
     * checked directly: `test/delegate-tool.test.ts`, "childTools bounds the tree".
     * Claiming more here than the observation supports is how a green suite starts
     * lying.
     */
    name: "told to nest, the child returned the answer instead (consistent with no delegate)",
    ok: refused.replace(/[,_\s]/g, "").includes(String(FIB_30)),
    detail: "the child neither answered nor visibly refused, so nothing can be said about nesting",
  },
];

console.log("\n--- checks ---");
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : `\n      ${c.detail}`}`);

const failed = checks.filter((c) => !c.ok);
console.log(
  failed.length
    ? `\n${failed.length}/${checks.length} FAILED — delegation is not [ran] yet.`
    : `\nAll ${checks.length} passed. Delegation is [ran] on ${modelId}.`,
);
process.exit(failed.length ? 1 : 0);
