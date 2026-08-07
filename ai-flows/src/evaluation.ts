/**
 * Did changing the agents make the work better?
 *
 * This is the instrument every claim about *evolving* agents needs and this
 * repository did not have. The organisation is called Evolving Agents Lab; until
 * now nothing here could tell whether a change to an agent tree improved
 * anything, which makes "the system learns from its traces" an intention rather
 * than a result.
 *
 * ## Why this exists, in one measured failure
 *
 * [13-degradation](../../doc/13-degradation.md) tried to detect a step that
 * contributed nothing **without any notion of a right answer** —
 * `contribution.ts`, built and falsified the same day. It could not separate
 * "used its input" from "mentioned a word from its input", because with no ground
 * truth there is nothing to be right or wrong *about*.
 *
 * The g-AMIE study ([arXiv:2507.15743](https://arxiv.org/abs/2507.15743)) could
 * report that oversight improved 6.7% of cases and reduced 21.7% for exactly one
 * reason: **60 scenarios with a gradeable outcome.** That is the missing piece,
 * and it is what a `Scenario` is here.
 *
 * ## The rule this harness is built around
 *
 * **A scenario whose answer needs a model to judge it is not in the first
 * version.** `05-ai-storage` already records what that costs: its memory bench
 * has deepseek grading deepseek's own summariser, which is the weakest form the
 * evidence can take. So a `check` is a plain function over the produced text —
 * it can be wrong, but it is wrong the same way for every configuration, which is
 * all a comparison needs.
 *
 * ## What it deliberately does not do
 *
 * It does not change any agent. Nothing here writes a markdown file or proposes
 * an edit. It answers *did this configuration do better than that one*, and the
 * decision to keep a change stays with whoever reads the number — because a loop
 * that both proposes and scores its own changes is a loop that will report
 * improvement.
 */
import type { FlowEngine } from "./engine.ts";
import type { FlowStore } from "./flow-store.ts";
import type { FlowWithSteps } from "./types.ts";

export interface Scenario {
  id: string;
  /** What the flow is asked to do. Identical across configurations. */
  goal: string;
  /**
   * Answers the only question that matters, from the work the flow produced.
   *
   * Deliberately a function and not a rubric: it must be checkable without a
   * model, so that a configuration cannot score well by being persuasive.
   */
  check: (produced: string, flow: FlowWithSteps) => { passed: boolean; detail: string };
}

export interface Configuration {
  /** How this arrangement of agents is referred to in the report. */
  id: string;
  /** Creates the flow, however this configuration composes it. Returns its id. */
  createFlow: (scenario: Scenario) => Promise<string | null>;
}

export interface ScenarioResult {
  scenarioId: string;
  configurationId: string;
  passed: boolean;
  detail: string;
  /** Present unless the flow could not be created. */
  flowId?: string;
  flowState?: string;
  steps?: number;
  /** Steps that settled with a result. Reported because a pass with fewer steps is a different fact. */
  settledSteps?: number;
  error?: string;
}

export type EvaluationVerdict =
  /** The configurations can be compared on this scenario set. */
  | "comparable"
  /**
   * Every arm scored the same, at the top or the bottom of the range. The set has
   * no room for a difference to appear in, so a tie here says nothing about the
   * configurations.
   */
  | "no-headroom"
  /** Fewer than two configurations, or no scenarios. Nothing was compared. */
  | "not-a-comparison";

export interface EvaluationReport {
  at: number;
  scenarios: number;
  /**
   * Whether these numbers can carry a conclusion at all.
   *
   * This exists because the repository has now hit the same wall four times: a
   * memory benchmark whose baseline scored 10/10, a physics suite that passed
   * 12/12, M4's original falsification condition which could not fire, and this
   * harness's own first run where both arms scored 3/3. **Every one of them read
   * as "no difference between the arms" when it meant "the instrument had no room
   * for one."** A tie at the ceiling is the most expensive result to misread,
   * because it looks like a finding.
   */
  verdict: EvaluationVerdict;
  byConfiguration: Array<{
    configurationId: string;
    passed: number;
    failed: number;
    errored: number;
    rate: number;
  }>;
  results: ScenarioResult[];
  notes: string[];
}

/** Everything a flow produced, in step order. What `check` is given. */
export function producedText(flow: FlowWithSteps): string {
  return flow.steps
    .filter((s) => s.state === "done" && s.result)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.result)
    .join("\n\n");
}

export interface EvaluateOptions {
  store: FlowStore;
  engine: FlowEngine;
  scenarios: readonly Scenario[];
  configurations: readonly Configuration[];
  /** Guard against a flow that keeps appending steps. */
  maxAdvances?: number;
  now?: () => number;
}

/**
 * Run every scenario through every configuration and report the pass rates.
 *
 * Sequential on purpose. Runs are serialised per session upstream, the point is a
 * comparison rather than throughput, and a parallel version would make one
 * configuration's failures depend on another's load.
 */
export async function evaluate(opts: EvaluateOptions): Promise<EvaluationReport> {
  const now = opts.now ?? Date.now;
  const maxAdvances = opts.maxAdvances ?? 12;
  const results: ScenarioResult[] = [];
  const notes: string[] = [];

  for (const configuration of opts.configurations) {
    for (const scenario of opts.scenarios) {
      let flowId: string | null = null;
      try {
        flowId = await configuration.createFlow(scenario);
      } catch (e) {
        results.push({
          scenarioId: scenario.id,
          configurationId: configuration.id,
          passed: false,
          detail: "the configuration could not create a flow",
          error: e instanceof Error ? e.message : String(e),
        });
        continue;
      }
      if (!flowId) {
        results.push({
          scenarioId: scenario.id,
          configurationId: configuration.id,
          passed: false,
          detail: "the configuration produced no flow",
          error: "no flow",
        });
        continue;
      }

      for (let i = 0; i < maxAdvances; i += 1) {
        await opts.engine.resume(flowId);
        const outcome = await opts.engine.advance(flowId);
        if (outcome.kind === "complete" || outcome.kind === "halted") break;
      }

      const flow = await opts.store.getFlow(flowId);
      if (!flow) {
        results.push({
          scenarioId: scenario.id,
          configurationId: configuration.id,
          passed: false,
          detail: "the flow disappeared",
          flowId,
          error: "not found",
        });
        continue;
      }

      const produced = producedText(flow);
      const verdict = scenario.check(produced, flow);
      results.push({
        scenarioId: scenario.id,
        configurationId: configuration.id,
        passed: verdict.passed,
        detail: verdict.detail,
        flowId,
        flowState: flow.state,
        steps: flow.steps.length,
        settledSteps: flow.steps.filter((s) => s.state === "done").length,
      });
    }
  }

  const byConfiguration = opts.configurations.map((c) => {
    const mine = results.filter((r) => r.configurationId === c.id);
    const errored = mine.filter((r) => r.error).length;
    const passed = mine.filter((r) => r.passed).length;
    return {
      configurationId: c.id,
      passed,
      failed: mine.length - passed - errored,
      errored,
      rate: mine.length ? passed / mine.length : 0,
    };
  });

  /**
   * A comparison this small cannot support a conclusion, and saying so in the
   * report is cheaper than saying it in a review. Two configurations over three
   * scenarios differ by one scenario at 33 percentage points; the number moves
   * that far on noise.
   */
  if (opts.scenarios.length < 10) {
    notes.push(
      `${opts.scenarios.length} scenario(s): a difference between configurations here is not evidence. ` +
        "One scenario is worth 100/n percentage points, so the rate moves further on noise than on a real effect.",
    );
  }
  if (opts.configurations.length < 2) {
    notes.push("one configuration: this is a pass rate, not a comparison. Nothing is being evaluated against anything.");
  }
  const errored = results.filter((r) => r.error).length;
  if (errored) {
    notes.push(`${errored} run(s) errored and are counted as failures — check whether the harness or the work broke.`);
  }

  const rates = byConfiguration.map((c) => c.rate);
  const allSame = rates.length > 1 && rates.every((r) => r === rates[0]);
  const atLimit = rates[0] === 1 || rates[0] === 0;
  let verdict: EvaluationVerdict = "comparable";
  if (opts.configurations.length < 2 || opts.scenarios.length === 0) {
    verdict = "not-a-comparison";
  } else if (allSame && atLimit) {
    verdict = "no-headroom";
    notes.unshift(
      `NO HEADROOM — every configuration scored ${(rates[0]! * 100).toFixed(0)}%. ` +
        "A tie at the limit of the range is not a finding about the configurations; it is a fact about the " +
        "scenarios, which leave nothing for a difference to appear in. Extend the set until at least one " +
        "configuration fails something before treating any number here as evidence.",
    );
  }

  return { at: now(), scenarios: opts.scenarios.length, verdict, byConfiguration, results, notes };
}

export function renderEvaluation(report: EvaluationReport): string {
  const lines = [
    `evaluation @ ${new Date(report.at).toISOString()} · ${report.scenarios} scenario(s) · ${report.verdict.toUpperCase()}`,
    "",
  ];
  for (const c of report.byConfiguration) {
    lines.push(
      `  ${c.configurationId.padEnd(24)} ${c.passed}/${c.passed + c.failed + c.errored} passed` +
        `  (${(c.rate * 100).toFixed(0)}%)${c.errored ? `  ${c.errored} errored` : ""}`,
    );
  }
  lines.push("");
  for (const r of report.results) {
    lines.push(
      `  ${r.passed ? "PASS" : "FAIL"}  ${r.configurationId.padEnd(24)} ${r.scenarioId.padEnd(22)} ` +
        `${r.settledSteps ?? 0}/${r.steps ?? 0} steps · ${r.detail}`,
    );
  }
  if (report.notes.length) {
    lines.push("", "read this before quoting the numbers above:");
    for (const n of report.notes) lines.push(`  - ${n}`);
  }
  return lines.join("\n");
}
