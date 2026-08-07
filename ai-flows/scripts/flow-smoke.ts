/**
 * The [ran] for M2 — a flow that survives the process that started it.
 *
 * The unit tests drive the engine against a fake core and a memory store, which
 * proves the state machine and proves nothing about the promise M2 actually
 * makes: *a flow started on Monday resumes on Wednesday, after a restart, with
 * its state intact.* Nothing in a single-process test can fail the way a
 * restart fails.
 *
 * So this exercises the whole chain against the real core, the real model, and
 * Postgres:
 *
 *   1. a flow is created in `flow_` tables with two steps
 *   2. step 1 is advanced through `POST /v1/turns?async=1` on the running core
 *   3. **Monday ends mid-step**: the engine and its store handle are thrown away
 *      while step 2's run is in flight, with only its `runId` on disk
 *   4. **Wednesday**: a brand-new store handle and a brand-new engine, holding no
 *      memory of Monday, pick the flow up by id
 *   5. the in-flight run is settled from the core rather than relaunched, and the
 *      flow reaches `done`
 *
 * The check that carries the claim is not "it finished". It is **the run count**:
 * if resumption relaunched instead of resuming, the core would have executed
 * more runs than the flow has steps, and the answer would still look correct.
 *
 *   cd ai-flows && node --env-file=/path/to/core.env scripts/flow-smoke.ts
 *
 * Requires: a core reachable at CORE_API_URL (default :8080), and DATABASE_URL.
 * If the core enforces signatures, set CORE_SIGNING_SECRET to the same value.
 */
import { createCoreClient, replyOf } from "../src/core-client.ts";
import { createEngine } from "../src/engine.ts";
import { createPostgresFlowStore } from "../src/postgres-flow-store.ts";
import type { FlowStore } from "../src/flow-store.ts";

const CORE = process.env.CORE_API_URL ?? "http://localhost:8080";
const DB = process.env.DATABASE_URL;
if (!DB) throw new Error("DATABASE_URL is required — M2's definition of done is unreachable on memory stores");

const core = createCoreClient({
  baseUrl: CORE,
  ...(process.env.CORE_SIGNING_SECRET ? { signingSecret: process.env.CORE_SIGNING_SECRET } : {}),
});

const THREAD = `flow-smoke-${process.pid}`;
const engineOn = (store: FlowStore, timeoutMs = 90_000) =>
  createEngine({
    store,
    core,
    turnFor: (flow, step) => ({
      surface: "flow-smoke",
      actor: { externalId: "U1", displayName: "Flow Smoke" },
      // One thread per step: runs are serialised per session upstream
      // (postgres-run-store.ts:149), so two steps sharing a thread would queue
      // behind each other rather than exercise the resume path.
      conversation: { kind: "dm", threadRef: `${THREAD}-${flow.id.slice(0, 8)}-${step.index}` },
      text: step.intent,
    }),
    awaitOptions: { intervalMs: 700, timeoutMs },
  });

const STEPS = [
  "Reply with exactly the word: alpha. Nothing else.",
  "Reply with exactly the word: beta. Nothing else.",
];

console.log(`core ${CORE} · db ${DB.replace(/:[^:@]*@/, ":***@")}`);

// ---- Monday -----------------------------------------------------------------
const monday = createPostgresFlowStore(DB);
const flow = await monday.createFlow({ actorId: "U1", scopeId: "personal:U1",
  title: "flow smoke",
  goal: "two steps, one restart",
});
for (const intent of STEPS) await monday.appendStep({ flowId: flow.id, intent });
console.log(`\n[monday] flow ${flow.id} with ${STEPS.length} steps`);

const first = await engineOn(monday).advance(flow.id);
console.log(`[monday] step 1 -> ${first.kind}`);

/**
 * Step 2 is advanced with a deliberately impatient poller. The point is not to
 * make it fail — it is to end Monday *while the run is genuinely still executing
 * in the core*, which is the only state resumption is about. The first version of
 * this script used one generous timeout for both steps, both finished, and the
 * resume path reported "resumed 0" while every check passed. A restart test in
 * which nothing was in flight tests nothing.
 */
const second = await engineOn(monday, 1).advance(flow.id);
console.log(`[monday] step 2 -> ${second.kind}`);
if (second.kind !== "in_flight") {
  console.log("  ! step 2 settled before Monday ended; the resume path is untested this run");
}

const mid = await monday.getFlow(flow.id);
console.log(`[monday] flow=${mid?.state} steps=${mid?.steps.map((s) => s.state).join(",")}`);

// Every run the core was asked to execute, before any resumption.
const runsBefore = new Set(
  (mid?.steps ?? []).flatMap((s) => s.attempts.map((a) => a.runId).filter((r): r is string => Boolean(r))),
);

// ---- Wednesday: nothing in memory survives ----------------------------------
const wednesday = createPostgresFlowStore(DB);
const resumed = await engineOn(wednesday).resume(flow.id);
console.log(`\n[wednesday] resumed ${resumed.resumed} in-flight attempt(s)`);

const finished = await engineOn(wednesday).runToCompletion(flow.id);
console.log(`[wednesday] -> ${finished.kind}`);

const end = await wednesday.getFlow(flow.id);
const runsAfter = new Set(
  (end?.steps ?? []).flatMap((s) => s.attempts.map((a) => a.runId).filter((r): r is string => Boolean(r))),
);

console.log(`\n[final] flow=${end?.state}`);
for (const s of end?.steps ?? []) {
  console.log(`  step ${s.index} ${s.state.padEnd(7)} attempts=${s.attempts.length} result=${JSON.stringify(s.result)}`);
  for (const a of s.attempts) {
    console.log(`    attempt ${a.n} ${a.state} run=${a.runId} obs=${a.observation ? a.observation.digest : "none"}`);
  }
}

const checks: Array<{ name: string; ok: boolean; detail: string }> = [
  {
    name: "the flow reached done across the restart",
    ok: end?.state === "done",
    detail: `flow is ${end?.state}`,
  },
  {
    name: "every step settled with a result",
    ok: (end?.steps ?? []).every((s) => s.state === "done" && (s.result ?? "").length > 0),
    detail: (end?.steps ?? []).map((s) => `${s.index}:${s.state}`).join(" "),
  },
  {
    /**
     * What the engine is actually responsible for: carrying the core's reply
     * through to the step, unaltered.
     *
     * This replaced a check that asserted the result *contained* the word the
     * prompt asked for. That check passed on `mock` -- whose reply is
     * "You said: Reply with exactly the word: alpha..." , which contains "alpha"
     * -- so it approved a run in which the model's answer was never tested at
     * all. It was measuring the prompt, not the mechanism. Comparing against what
     * the run itself reports is meaningful on every harness, and it is the
     * engine's job rather than the model's cleverness.
     */
    name: "each step's result is exactly what its run replied",
    ok: await (async () => {
      for (const s of end?.steps ?? []) {
        const a = s.attempts[0];
        if (!a?.runId) return false;
        const run = await core.run(a.runId);
        if ((s.result ?? "") !== replyOf(run)) return false;
      }
      return true;
    })(),
    detail: "the step result must equal the run's reply, byte for byte",
  },
  {
    /**
     * The check that carries the claim. Resumption must settle the run that was
     * already in flight, not start a new one — and a relaunch would still produce
     * a correct-looking transcript, which is exactly why this is counted rather
     * than eyeballed.
     */
    name: "resumption settled the in-flight run instead of relaunching it",
    ok: runsAfter.size === runsBefore.size && [...runsBefore].every((r) => runsAfter.has(r)),
    detail: `${runsBefore.size} run(s) before, ${runsAfter.size} after`,
  },
  {
    name: "one attempt per step — nothing was retried behind our back",
    ok: (end?.steps ?? []).every((s) => s.attempts.length === 1),
    detail: (end?.steps ?? []).map((s) => s.attempts.length).join(","),
  },
  {
    name: "every attempt captured an observation at close",
    ok: (end?.steps ?? []).every((s) => s.attempts.every((a) => a.observation !== null)),
    detail: "ADR-0007: upstream's telemetry is gone within the hour",
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
