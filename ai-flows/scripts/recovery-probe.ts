/**
 * Phase 2's falsification, run with the substitution stated up front.
 *
 * M5's condition is the **stopwatch test**: a person, a three-day-old flow, and
 * how long it takes them to say what it is and where it stopped — canvas against
 * transcript. That measures *human recovery time*, and it needs a human and three
 * days. Neither is available to an agent, and waiting for one is how a milestone
 * stays unfalsified forever.
 *
 * So this measures the **weaker claim that is checkable now**: not how *fast* a
 * reader recovers, but whether either representation contains enough to recover
 * at all. A cold reader — a model on a fresh thread, no history, no context — is
 * given one representation and asked three questions whose answers are known from
 * the flow record:
 *
 *   1. is it DONE, WAITING or STUCK?
 *   2. how many steps completed?
 *   3. did the last attempt SUCCESS or FAILURE?
 *
 * All three are objective, so nothing here is judged by a model grading prose.
 *
 * **What this does not establish, and it is most of what M5 asked.** Time is not
 * measured. Two representations that both score 3/3 are indistinguishable here
 * and could differ by minutes for a person. A representation that scores 0/3
 * is disqualified regardless of how pretty it is — which is the useful direction:
 * this can *fail* a representation, and cannot *pass* one.
 *
 *   cd ai-flows && node --env-file=/path/to/core.env scripts/recovery-probe.ts
 */
import { createCoreClient, replyOf } from "../src/core-client.ts";
import { createPostgresFlowStore } from "../src/postgres-flow-store.ts";
import { loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";
import type { FlowWithSteps } from "../src/types.ts";

const config = loadConfig();
const DB = config.databaseUrl;
if (!DB) throw new Error("DATABASE_URL is required");

const core = createCoreClient({
  baseUrl: process.env.CORE_API_URL ?? "http://localhost:8080",
  ...(process.env.CORE_SIGNING_SECRET ? { signingSecret: process.env.CORE_SIGNING_SECRET } : {}),
});
const { sessions } = buildApp({ ...config, port: 0 });
const store = createPostgresFlowStore(DB);

/** What the flat view shows, as text. Same fields, same ordering, same emphasis. */
function asView(flow: FlowWithSteps): string {
  const lines = [
    `FLOW: ${flow.title}`,
    `state: ${flow.state}`,
    `goal: ${flow.goal}`,
    `scope: ${flow.scopeId} · shape: ${flow.shape}`,
    `${flow.steps.filter((s) => s.state === "done").length}/${flow.steps.length} steps done`,
    "",
  ];
  for (const s of flow.steps) {
    lines.push(`step ${s.index} [${s.state}] ${s.intent}`);
    if (s.result) lines.push(`  result: ${s.result.slice(0, 300)}`);
    for (const a of s.attempts) {
      lines.push(
        `  attempt ${a.n} [${a.state}] run=${a.runId ?? "none"}` +
          `${a.error ? ` error: ${a.error.slice(0, 200)}` : ""}` +
          `${a.observation ? ` observation=${a.observation.digest}` : " observation: none"}`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * What a person has today without the view: the conversation the steps ran in.
 *
 * This is the honest control. It is not a strawman — it is every user and
 * assistant entry from the sessions the flow's attempts used, in order, which is
 * exactly what the chat UI would show.
 */
async function asTranscript(flow: FlowWithSteps): Promise<string> {
  const ids = [...new Set(flow.steps.flatMap((s) => s.attempts.map((a) => a.sessionId)).filter(Boolean))] as string[];
  const out: string[] = [];
  for (const id of ids) {
    for (const e of await sessions.getEntries(id)) {
      if (e.type !== "user" && e.type !== "assistant") continue;
      const text = (e.payload as { text?: string } | null)?.text ?? "";
      out.push(`${e.type}: ${text.slice(0, 400)}`);
    }
  }
  return out.length ? out.join("\n") : "(no conversation was recorded for this work)";
}

const QUESTIONS = `Answer with exactly three lines and nothing else:
STATE: one of DONE, WAITING, STUCK
COMPLETED: a number, how many steps finished successfully
LAST: one of SUCCESS, FAILURE — how the most recent attempt ended`;

function truth(flow: FlowWithSteps) {
  const completed = flow.steps.filter((s) => s.state === "done").length;
  const attempts = flow.steps.flatMap((s) => s.attempts);
  const last = attempts[attempts.length - 1];
  const state = flow.state === "done" ? "DONE" : flow.state === "blocked" ? "STUCK" : "WAITING";
  return { STATE: state, COMPLETED: String(completed), LAST: last?.state === "failed" ? "FAILURE" : "SUCCESS" };
}

function parse(reply: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of reply.split("\n")) {
    const m = /^\s*(STATE|COMPLETED|LAST)\s*:\s*(.+?)\s*$/i.exec(line);
    if (m) out[m[1]!.toUpperCase()] = m[2]!.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  return out;
}

async function askCold(label: string, flowId: string, representation: string): Promise<Record<string, string>> {
  const r = await core.turn({
    surface: "recovery-probe",
    actor: { externalId: "cold-reader", displayName: "Cold Reader" },
    // A fresh thread per question set: the reader must hold no memory of this
    // flow, of the other representation, or of the previous flow.
    conversation: { kind: "dm", threadRef: `recovery-${label}-${flowId}-${Date.now()}` },
    text: `You are shown a record of some work. You have never seen it before.\n\n---\n${representation}\n---\n\n${QUESTIONS}`,
  });
  return parse(replyOf(r as never) || (r as { reply?: string }).reply || "");
}

const flows = (
  await Promise.all(
    (await store.listFlows("personal:U1")).concat(await store.listFlows("personal:matias")).map((f) => store.getFlow(f.id)),
  )
).filter((f): f is FlowWithSteps => f !== null);

if (!flows.length) throw new Error("no flows to probe — run scripts/flow-smoke.ts first");

/**
 * The guard this probe needed and did not have.
 *
 * Its first run scored the flat view 30/30 against the transcript's 17/30, and
 * the number was worthless: every attempt had `sessionId: null`, so the
 * transcript arm was the string "(no conversation was recorded for this work)"
 * for all ten flows. A control arm given nothing loses, and the comparison
 * measured a defect in the engine rather than a difference between two
 * representations.
 *
 * So a flow whose transcript is empty is **excluded and counted**, never scored.
 * The count is printed: a run where most flows were excluded is a run to
 * distrust, and hiding the exclusions is what made the first result look solid.
 */
const scored: Array<{ flow: FlowWithSteps; transcript: string }> = [];
let excluded = 0;
for (const flow of flows) {
  const transcript = await asTranscript(flow);
  if (transcript.startsWith("(no conversation")) {
    excluded += 1;
    continue;
  }
  scored.push({ flow, transcript });
}

console.log(`cold-reader recovery probe · ${scored.length} scored, ${excluded} excluded for an empty transcript\n`);
if (!scored.length) {
  console.log("NOTHING TO COMPARE — every flow lacked a recorded conversation, so the control arm is empty.");
  process.exit(2);
}
const score = { view: 0, transcript: 0, total: 0 };
const perFlow: string[] = [];

for (const { flow, transcript: transcriptText } of scored) {
  const t = truth(flow);
  const view = await askCold("view", flow.id, asView(flow));
  const transcript = await askCold("transcript", flow.id, transcriptText);
  let v = 0;
  let x = 0;
  for (const k of ["STATE", "COMPLETED", "LAST"] as const) {
    if (view[k] === t[k]) v += 1;
    if (transcript[k] === t[k]) x += 1;
    score.total += 1;
  }
  score.view += v;
  score.transcript += x;
  perFlow.push(
    `${flow.title.padEnd(20)} ${flow.state.padEnd(8)} truth=${JSON.stringify(t)}\n` +
      `  view       ${v}/3 ${JSON.stringify(view)}\n` +
      `  transcript ${x}/3 ${JSON.stringify(transcript)}`,
  );
}

console.log(perFlow.join("\n\n"));
console.log(`\n=== totals over ${score.total} questions ===`);
console.log(`  flat view  ${score.view}/${score.total}`);
console.log(`  transcript ${score.transcript}/${score.total}`);
console.log(
  `\n${
    score.view > score.transcript
      ? "The view carries state the transcript does not. The canvas must beat THE VIEW, not the transcript."
      : score.view === score.transcript
        ? "No separation on this instrument. Either both suffice, or the questions are too easy."
        : "The transcript beat the view — the view is losing something it shows."
  }`,
);
console.log("\nNot measured: recovery TIME, which is what M5's stopwatch test is actually about.");
process.exit(0);
