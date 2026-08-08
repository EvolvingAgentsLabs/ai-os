/**
 * The [ran] for evaluation: does changing the agent tree change the result?
 *
 * Two configurations, one goal, one check. The point is not which wins — with
 * three scenarios nothing wins — it is whether the harness can *see* a difference
 * that was deliberately introduced. An instrument that reports no difference
 * between an arrangement built to succeed and one built to fail cannot be used to
 * evolve anything.
 *
 *   cd ai-flows && node --env-file=/path/to/core.env scripts/evolve-probe.ts
 */
import { createCoreClient } from "../src/core-client.ts";
import { createEngine, carryPriorResults } from "../src/engine.ts";
import { createPostgresFlowStore } from "../src/postgres-flow-store.ts";
import { type Scenario, evaluate, renderEvaluation } from "../src/evaluation.ts";
import { loadConfig } from "../../ai-base/src/config.ts";

const config = loadConfig();
const DB = config.databaseUrl;
if (!DB) throw new Error("DATABASE_URL is required");
const SCOPE = process.env.EVAL_SCOPE ?? "personal:evalbot";
const store = createPostgresFlowStore(DB);
const core = createCoreClient({ baseUrl: process.env.CORE_API_URL ?? "http://localhost:8080" });

const engine = createEngine({
  store,
  core,
  carry: carryPriorResults(),
  turnFor: (flow, step) => ({
    surface: "evolve-probe",
    actor: { externalId: "evalbot", displayName: "evalbot" },
    conversation: { kind: "dm", threadRef: `eval-${flow.id}-${step.index}` },
    text: step.intent,
  }),
  awaitOptions: { intervalMs: 900, timeoutMs: 90_000 },
});

import { NUMERIC_SCENARIOS, SOURCE_SCENARIOS, statesNumber } from "../src/scenarios.ts";

/**
 * Checkable without a model: the number is stated as a whole word, or it is not.
 * Answers computed in `src/scenarios.ts`, never recalled.
 */
/**
 * `--source` selects the codebase questions instead of the arithmetic ones.
 * The arithmetic set has no headroom — the producer answers all twelve in one
 * step — so it is kept only as the control that demonstrated that.
 */
const SET = process.argv.includes("--source") ? SOURCE_SCENARIOS : NUMERIC_SCENARIOS;

const SCENARIOS: Scenario[] = SET.map((s) => ({
  id: s.id,
  goal: s.goal,
  check: (produced) => {
    const ok = statesNumber(produced, s.expect);
    return { passed: ok, detail: ok ? `${s.expect} stated` : `${s.expect} not stated` };
  },
}));

const make = (id: string, steps: (s: Scenario) => string[]) => ({
  id,
  async createFlow(scenario: Scenario) {
    const flow = await store.createFlow({
      actorId: "evalbot",
      scopeId: SCOPE,
      title: `${id}/${scenario.id}`,
      goal: scenario.goal,
    });
    for (const intent of steps(scenario)) await store.appendStep({ flowId: flow.id, intent });
    return flow.id;
  },
});

/**
 * The two arrangements differ in ONE property, deliberately: whether the agent is
 * told to verify by computing rather than answering from recall. That is the kind
 * of edit "evolving an agent" means in practice — a change to its instructions,
 * not to the code around it.
 */
const RECALL = make("single-step-recall", (s) => [`${s.goal}. Answer directly and briefly.`]);
const COMPUTE = make("verify-then-answer", (s) => [
  `Use your execute tool to run Python that computes this, and report only what the program printed: ${s.goal}`,
  `State the final answer plainly, using the computed result above. ${s.goal}`,
]);

/**
 * `--headroom` runs the BASELINE ALONE and stops.
 *
 * Buying the arms in sequence rather than as a grid: if the baseline already
 * answers everything, no treatment can move the number and every comparison
 * ties at the ceiling — which this repository has now mistaken for a finding
 * four times. One arm answers whether the second is worth paying for, and it is
 * the cheapest thing in the file.
 */
const headroomOnly = process.argv.includes("--headroom");

const report = await evaluate({
  store,
  engine,
  scenarios: SCENARIOS,
  configurations: headroomOnly ? [RECALL] : [RECALL, COMPUTE],
});

console.log(renderEvaluation(report));
process.exit(0);
