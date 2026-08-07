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

/** Checkable without a model: the answer is a number, or it is not there. */
const SCENARIOS: Scenario[] = [
  {
    id: "fib-30",
    goal: "compute the 30th Fibonacci number, where F(1)=1 and F(2)=1",
    check: (p) => {
      const ok = p.replace(/[,_\s]/g, "").includes("832040");
      return { passed: ok, detail: ok ? "832040 present" : "832040 absent" };
    },
  },
  {
    id: "primes-below-50",
    goal: "count the prime numbers below 50",
    check: (p) => {
      const ok = /\b15\b/.test(p);
      return { passed: ok, detail: ok ? "15 present" : "15 absent" };
    },
  },
  /**
   * There was a fourth scenario here, asking whether 2100 is a leap year, checked
   * with `/not a leap year/`. Both configurations FAILED it and both were right:
   * the model answered "The year 2100 is **not** a leap year" and the markdown
   * asterisks broke the match.
   *
   * A check that fails while the capability works is measuring phrasing — written
   * into the very instrument built to avoid that. Replaced rather than loosened,
   * with a scenario whose answer is a number, because the two numeric checks in
   * this file never had the problem.
   */
  {
    id: "leap-years-in-century",
    goal: "count how many leap years there are from 2001 to 2100 inclusive, under the Gregorian rules",
    check: (p) => {
      const ok = /\b24\b/.test(p);
      return { passed: ok, detail: ok ? "24 present" : "24 absent" };
    },
  },
];

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
const report = await evaluate({
  store,
  engine,
  scenarios: SCENARIOS,
  configurations: [
    make("single-step-recall", (s) => [`${s.goal}. Answer directly and briefly.`]),
    make("verify-then-answer", (s) => [
      `Use your execute tool to run Python that computes this, and report only what the program printed: ${s.goal}`,
      `State the final answer plainly, using the computed result above. ${s.goal}`,
    ]),
  ],
});

console.log(renderEvaluation(report));
process.exit(0);
