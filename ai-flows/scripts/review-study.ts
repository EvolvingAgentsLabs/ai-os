/**
 * The g-AMIE study, run on our own system.
 *
 * A producer answers; a reviewer checks and issues the final answer. Both
 * readings are scored against ground truth computed in `src/scenarios.ts`, and
 * the transition is classified: improved, unchanged, or **reduced** — a right
 * answer the reviewer made wrong.
 *
 * The producer is deliberately the WEAK configuration, the one measured at 9–10
 * of 12 over three runs. A producer that is right on everything leaves the
 * reviewer nothing to repair, and the study can then only observe damage — which
 * is the headroom trap this repository has recorded four times. The harness says
 * so if it happens.
 *
 *   cd ai-flows && node --env-file=/path/to/core.env scripts/review-study.ts
 *   ... --strict-reviewer   a reviewer told to be sceptical and rewrite freely
 */
import { createCoreClient } from "../src/core-client.ts";
import { carryPriorResults, createEngine } from "../src/engine.ts";
import { createPostgresFlowStore } from "../src/postgres-flow-store.ts";
import { NUMERIC_SCENARIOS, statesNumber } from "../src/scenarios.ts";
import { type ReviewScenario, renderReviewStudy, runReviewStudy } from "../src/review-evaluation.ts";
import { loadConfig } from "../../ai-base/src/config.ts";

const config = loadConfig();
const DB = config.databaseUrl;
if (!DB) throw new Error("DATABASE_URL is required");
const store = createPostgresFlowStore(DB);
const core = createCoreClient({ baseUrl: process.env.CORE_API_URL ?? "http://localhost:8080" });

/**
 * `PRODUCER_CORE_URL` points step 0 at a different core, and therefore a
 * different model, from the reviewer.
 *
 * Three scenario sets in a row tied at the ceiling because the arrangements being
 * compared differed in prompt and not in capability. Varying the model is the
 * change that can differ, and it is configuration rather than code: two cores,
 * two `PI_MODEL` values ([14](../../doc/14-review-study.md)).
 */
const PRODUCER_URL = process.env.PRODUCER_CORE_URL;
const producerCore = PRODUCER_URL ? createCoreClient({ baseUrl: PRODUCER_URL }) : null;

const engineOn = (client: typeof core) =>
  createEngine({
    store,
    core: client,
    carry: carryPriorResults(),
    turnFor: (flow, step) => ({
      surface: "review-study",
      actor: { externalId: "evalbot", displayName: "evalbot" },
      conversation: { kind: "dm", threadRef: `rev-${flow.id}-${step.index}` },
      text: step.intent,
    }),
    awaitOptions: { intervalMs: 900, timeoutMs: 90_000 },
  });

const engine = engineOn(core);
const producerEngine = producerCore ? engineOn(producerCore) : null;

const SCENARIOS: ReviewScenario[] = NUMERIC_SCENARIOS.map((s) => ({
  id: s.id,
  goal: s.goal,
  check: (produced) => statesNumber(produced, s.expect),
}));

/**
 * Two reviewers, differing in one instruction: whether to defer to the answer it
 * was given, or to treat it as a draft and rewrite freely. g-AMIE's reviewers had
 * the second posture — full authority to edit — and that is where the 21.7%
 * came from.
 */
const STRICT = process.argv.includes("--strict-reviewer");
const reviewInstruction = (goal: string) =>
  STRICT
    ? `You are reviewing a draft answer to this question: ${goal}\n\n` +
      `Do not assume the draft is correct. Work the problem out yourself and issue the final answer. ` +
      `State the final answer plainly as a number.`
    : `You are reviewing a draft answer to this question: ${goal}\n\n` +
      `Check it. If it is right, restate it. If it is wrong, correct it. ` +
      `State the final answer plainly as a number.`;

const report = await runReviewStudy({
  store,
  engine,
  ...(producerEngine ? { producerEngine } : {}),
  scenarios: SCENARIOS,
  async createFlow(scenario) {
    const flow = await store.createFlow({
      actorId: "evalbot",
      scopeId: process.env.EVAL_SCOPE ?? "personal:evalbot",
      title: `review/${scenario.id}`,
      goal: scenario.goal,
    });
    // Step 0 is the producer, deliberately the weak one. Step 1 is the reviewer.
    await store.appendStep({ flowId: flow.id, intent: `${scenario.goal}. Answer directly and briefly.` });
    await store.appendStep({ flowId: flow.id, intent: reviewInstruction(scenario.goal) });
    return flow.id;
  },
});

console.log(
  `producer: ${PRODUCER_URL ?? "same core as reviewer"} · reviewer: ${process.env.CORE_API_URL ?? "http://localhost:8080"}`,
);
console.log(`reviewer posture: ${STRICT ? "sceptical (rework it yourself)" : "deferential (check and correct)"}\n`);
console.log(renderReviewStudy(report));
process.exit(0);
