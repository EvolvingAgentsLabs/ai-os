/**
 * The [ran] for M2's other half of deliverable 3: **a flow survives context
 * compaction**, not just a process restart.
 *
 * Restart and compaction fail differently. A restart destroys the process and
 * leaves the database intact; compaction leaves the process alone and rewrites
 * the *session* underneath a step — entries are summarised and replaced, and a
 * step holding a `sessionId` can find the conversation it was executing in
 * materially changed. Proving one says nothing about the other.
 *
 * Compaction fires at `MAX_CONTEXT_ENTRIES = 400` or `MAX_CONTEXT_TOKENS = 120k`
 * (`core/orchestrator/compaction.ts`), both hardcoded. So rather than configure
 * it, this drives a thread past the entry ceiling and then runs a flow step in
 * that same thread:
 *
 *   1. fill one thread with enough plain turns to cross 400 entries
 *   2. confirm from the session's own record that compaction actually happened —
 *      if it did not, the run proves nothing and says so rather than passing
 *   3. run a flow whose step executes in that compacted thread
 *   4. check the step settled, carried its reply, and kept its observation
 *
 * Step 2 is the guard that matters. Without it this is a slow way to run one
 * flow step and call it a compaction test.
 *
 *   cd ai-flows && CORE_API_URL=http://localhost:8081 \
 *     node --env-file=/path/to/mock-core.env scripts/compaction-smoke.ts
 *
 * Intended for `HARNESS=mock`: 400+ entries against a real model is a bill, and
 * compaction is a property of the session layer rather than of the model.
 */
import { createCoreClient, replyOf } from "../src/core-client.ts";
import { createEngine } from "../src/engine.ts";
import { createPostgresFlowStore } from "../src/postgres-flow-store.ts";
import { loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";

const config = loadConfig();
const DB = config.databaseUrl;
if (!DB) throw new Error("DATABASE_URL is required");

const CORE = process.env.CORE_API_URL ?? "http://localhost:8081";
const core = createCoreClient({
  baseUrl: CORE,
  ...(process.env.CORE_SIGNING_SECRET ? { signingSecret: process.env.CORE_SIGNING_SECRET } : {}),
});
const { sessions } = buildApp({ ...config, port: 0 });

const THREAD = `compaction-${process.pid}`;
const FILL_TURNS = Number(process.env.COMPACTION_FILL_TURNS ?? 230);

console.log(`core ${CORE} · harness ${config.harness} · thread ${THREAD}`);
if (config.harness !== "mock") {
  console.log("! not running on mock — this drives hundreds of turns and will cost money");
}

console.log(`\n[fill] driving ${FILL_TURNS} turns into one thread to cross the 400-entry ceiling`);
const started = Date.now();
for (let i = 0; i < FILL_TURNS; i += 1) {
  await core.turn({
    surface: "compaction-smoke",
    actor: { externalId: "U1", displayName: "Compaction" },
    conversation: { kind: "dm", threadRef: THREAD },
    text: `filler turn ${i}: remember that checkpoint ${i} happened.`,
  });
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${FILL_TURNS} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}

const session = await sessions.getByThread(THREAD);
if (!session) throw new Error(`no session for thread ${THREAD}`);
const entries = await sessions.getEntries(session.id);

/**
 * Did compaction actually happen? Upstream records it as a `context_event` on
 * the tape and as a summary entry in the log; either is proof. A run where
 * neither appears has not tested compaction, and reporting it as a pass would be
 * the exact "instrument that lies by rendering cleanly" this repository keeps
 * finding.
 */
const tape = await sessions.getTape(session.id);
const compactionMarks = tape.filter((t) => t.kind === "context_event").length;
const summaryEntries = entries.filter((e) => String(e.type).includes("summary")).length;
const compacted = compactionMarks > 0 || summaryEntries > 0;

console.log(
  `\n[session] ${entries.length} entries · ${compactionMarks} context_event(s) · ${summaryEntries} summary entrie(s)`,
);
if (!compacted) {
  console.log("\nINCONCLUSIVE — the session never compacted, so nothing about compaction was tested.");
  console.log(`Raise COMPACTION_FILL_TURNS above ${FILL_TURNS} and run again.`);
  process.exit(2);
}

/**
 * Wait out the rate-limit window before the step that is being measured.
 *
 * The first run of this failed all three content checks with
 * `rate limit exceeded — try again in 10s` on the attempt. The limiter is
 * per-thread, and driving 230 turns into one thread in eight seconds exhausts it
 * — so the flow step was rejected by MY OWN load, and the failure said nothing
 * about compaction. Reported as a compaction failure it would have been a
 * fabricated bug in the system under test.
 */
const COOLDOWN_MS = Number(process.env.COMPACTION_COOLDOWN_MS ?? 65_000);
console.log(`\n[cooldown] waiting ${Math.round(COOLDOWN_MS / 1000)}s for the per-thread rate window to reset`);
await new Promise((r) => setTimeout(r, COOLDOWN_MS));

console.log("\n[flow] running a step inside the compacted thread");
const store = createPostgresFlowStore(DB);
const flow = await store.createFlow({
  scopeId: session.scopeId,
  title: "compaction survival",
  goal: "one step, executed in a session that has been compacted",
});
await store.appendStep({ flowId: flow.id, intent: "Reply with exactly the word: survived." });

const engine = createEngine({
  store,
  core,
  // Deliberately the SAME thread: the point is a step running in a conversation
  // that was rewritten underneath it.
  turnFor: () => ({
    surface: "compaction-smoke",
    actor: { externalId: "U1", displayName: "Compaction" },
    conversation: { kind: "dm", threadRef: THREAD },
    text: "Reply with exactly the word: survived.",
  }),
  awaitOptions: { intervalMs: 700, timeoutMs: 60_000 },
});

const outcome = await engine.runToCompletion(flow.id);
const end = await store.getFlow(flow.id);
const step = end?.steps[0];
const attempt = step?.attempts[0];
const run = attempt?.runId ? await core.run(attempt.runId) : null;

console.log(`[flow] ${outcome.kind} · flow=${end?.state} · step=${step?.state}`);
console.log(`  result=${JSON.stringify((step?.result ?? "").slice(0, 120))}`);

const checks = [
  { name: "the session genuinely compacted before the step ran", ok: compacted, detail: `${compactionMarks} marks` },
  { name: "the flow reached done", ok: end?.state === "done", detail: `flow is ${end?.state}` },
  { name: "the step settled with a result", ok: (step?.result ?? "").length > 0, detail: `step is ${step?.state}` },
  {
    name: "the step's result is exactly what its run replied",
    ok: run !== null && (step?.result ?? "") === replyOf(run),
    detail: "compaction must not alter what the step recorded",
  },
  {
    name: "the attempt kept its observation",
    ok: attempt?.observation != null,
    detail: "ADR-0007 — captured at close, and compaction does not reach it",
  },
  {
    name: "one attempt — compaction did not cause a retry",
    ok: (step?.attempts.length ?? 0) === 1,
    detail: `${step?.attempts.length} attempt(s)`,
  },
];

console.log("");
let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : ` — ${c.detail}`}`);
  if (!c.ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
