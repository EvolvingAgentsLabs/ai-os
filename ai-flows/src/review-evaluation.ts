/**
 * Does adding a reviewer help?
 *
 * The g-AMIE shape ([arXiv:2507.15743](https://arxiv.org/abs/2507.15743),
 * [13-degradation](../../doc/13-degradation.md)). A supervising physician edited
 * an agent's differential diagnosis and the result was **not** uniformly better:
 * edits improved 6.7% of scenarios, changed nothing in 71.6%, and *reduced*
 * quality in 21.7%. The lesson is not that review is bad; it is that **a review
 * stage has to be measured like any other change, and its effect can be
 * negative.**
 *
 * `evaluation.ts` compares two arrangements on a final score. That cannot see
 * this at all: a configuration that fixes two answers and breaks two answers
 * scores identically to one that touches nothing. **The damage and the repair
 * cancel, and the number says "no effect".** So this scores each scenario
 * *twice* — before the reviewer and after — and reports the transition.
 *
 * ## The three outcomes, and why the middle one is not "neutral"
 *
 *   improved   the producer was wrong, the reviewer made it right
 *   unchanged  the verdict did not move
 *   reduced    **the producer was right, the reviewer made it wrong**
 *
 * `reduced` is the whole reason this exists. It is invisible in a final score,
 * it is invisible in a flow that reports `done`, and it is the outcome a review
 * stage is added specifically to prevent.
 *
 * ## What is measured is the STEP, not the flow
 *
 * The before/after readings are individual step results, never the concatenated
 * output. Concatenating puts the producer's answer and the reviewer's answer in
 * one string, so a check looking for the right number finds it whenever *either*
 * was right — which scores every damaged answer as a pass and makes `reduced`
 * unobservable by construction.
 */
import type { FlowStore } from "./flow-store.ts";
import type { FlowEngine } from "./engine.ts";
import type { FlowWithSteps } from "./types.ts";

export interface ReviewScenario {
  id: string;
  goal: string;
  /** Computed ground truth. Applied identically to both readings. */
  check: (produced: string) => boolean;
}

export type ReviewOutcome = "improved" | "unchanged" | "reduced" | "unreadable";

export interface ReviewResult {
  scenarioId: string;
  outcome: ReviewOutcome;
  beforeCorrect: boolean;
  afterCorrect: boolean;
  before: string;
  after: string;
  flowId: string;
  flowState: string;
}

export function classify(beforeCorrect: boolean, afterCorrect: boolean): ReviewOutcome {
  if (beforeCorrect === afterCorrect) return "unchanged";
  return afterCorrect ? "improved" : "reduced";
}

export interface ReviewReport {
  at: number;
  scenarios: number;
  improved: number;
  unchanged: number;
  reduced: number;
  unreadable: number;
  /** Correct before the reviewer ran, and after. The pair a final score collapses. */
  beforeRate: number;
  afterRate: number;
  results: ReviewResult[];
  notes: string[];
}

export interface RunReviewOptions {
  store: FlowStore;
  /** Runs every step unless `producerEngine` is given, in which case it runs the reviewer. */
  engine: FlowEngine;
  /**
   * Optional engine for step 0 only, so the producer and the reviewer can be
   * **different models** rather than the same model under different prompts.
   *
   * Three scenario sets in a row hit the ceiling because the two arrangements
   * being compared differed in prompt and not in capability: a single step with
   * `execute` and a capable model behind it is not a handicap, so a treatment
   * telling it to compute had nothing to add. Varying the model is the change
   * that can actually differ ([14](../../doc/14-review-study.md)).
   */
  producerEngine?: FlowEngine;
  scenarios: readonly ReviewScenario[];
  /** Must produce a flow whose FIRST step answers and whose LAST step reviews. */
  createFlow: (scenario: ReviewScenario) => Promise<string | null>;
  maxAdvances?: number;
  now?: () => number;
}

function readings(flow: FlowWithSteps): { before: string; after: string } | null {
  const settled = flow.steps.filter((s) => s.state === "done" && s.result).sort((a, b) => a.index - b.index);
  if (settled.length < 2) return null;
  return { before: settled[0]!.result ?? "", after: settled[settled.length - 1]!.result ?? "" };
}

export async function runReviewStudy(opts: RunReviewOptions): Promise<ReviewReport> {
  const now = opts.now ?? Date.now;
  const maxAdvances = opts.maxAdvances ?? 8;
  const results: ReviewResult[] = [];
  const notes: string[] = [];

  for (const scenario of opts.scenarios) {
    const flowId = await opts.createFlow(scenario);
    if (!flowId) continue;
    for (let i = 0; i < maxAdvances; i += 1) {
      // Which engine runs this step is decided by which step is next, so the
      // producer and reviewer can sit on different models.
      const current = await opts.store.getFlow(flowId);
      const nextIndex = current?.steps.find((s) => s.state === "pending" || s.state === "running")?.index ?? -1;
      const engine = nextIndex === 0 && opts.producerEngine ? opts.producerEngine : opts.engine;
      await engine.resume(flowId);
      const outcome = await engine.advance(flowId);
      if (outcome.kind === "complete" || outcome.kind === "halted") break;
    }
    const flow = await opts.store.getFlow(flowId);
    if (!flow) continue;

    const read = readings(flow);
    if (!read) {
      // Fewer than two settled steps: there was no review to measure. Counted as
      // unreadable rather than dropped, because a study that silently discards
      // its incomplete runs reports on the subset that happened to work.
      results.push({
        scenarioId: scenario.id,
        outcome: "unreadable",
        beforeCorrect: false,
        afterCorrect: false,
        before: "",
        after: "",
        flowId,
        flowState: flow.state,
      });
      continue;
    }
    const beforeCorrect = scenario.check(read.before);
    const afterCorrect = scenario.check(read.after);
    results.push({
      scenarioId: scenario.id,
      outcome: classify(beforeCorrect, afterCorrect),
      beforeCorrect,
      afterCorrect,
      before: read.before,
      after: read.after,
      flowId,
      flowState: flow.state,
    });
  }

  const readable = results.filter((r) => r.outcome !== "unreadable");
  const count = (o: ReviewOutcome) => results.filter((r) => r.outcome === o).length;
  const report: ReviewReport = {
    at: now(),
    scenarios: opts.scenarios.length,
    improved: count("improved"),
    unchanged: count("unchanged"),
    reduced: count("reduced"),
    unreadable: count("unreadable"),
    beforeRate: readable.length ? readable.filter((r) => r.beforeCorrect).length / readable.length : 0,
    afterRate: readable.length ? readable.filter((r) => r.afterCorrect).length / readable.length : 0,
    results,
    notes,
  };

  if (report.beforeRate === 1) {
    notes.push(
      "NO HEADROOM FOR REPAIR — the producer was right on everything, so `improved` was impossible before the " +
        "reviewer ran. Only damage could be observed. Extend the scenarios until the producer fails some.",
    );
  }
  if (report.beforeRate === 0) {
    notes.push(
      "NO HEADROOM FOR DAMAGE — the producer was wrong on everything, so `reduced` was impossible. " +
        "This measures repair only.",
    );
  }
  if (report.unreadable) {
    notes.push(`${report.unreadable} run(s) produced fewer than two settled steps and could not be read.`);
  }
  if (opts.scenarios.length < 10) {
    notes.push(`${opts.scenarios.length} scenario(s): each is worth ${(100 / opts.scenarios.length).toFixed(0)} points.`);
  }
  /**
   * The headline this study exists to make visible: a final score cannot see a
   * reviewer that repairs and damages in equal measure.
   */
  if (report.improved > 0 && report.reduced > 0 && report.improved === report.reduced) {
    notes.push(
      `${report.improved} improved and ${report.reduced} reduced — the rate did not move, and a study ` +
        "reporting only the final score would have called this reviewer neutral.",
    );
  }
  return report;
}

export function renderReviewStudy(r: ReviewReport): string {
  const pct = (n: number) => `${((100 * n) / Math.max(1, r.scenarios)).toFixed(1)}%`;
  const lines = [
    `review study @ ${new Date(r.at).toISOString()} · ${r.scenarios} scenario(s)`,
    "",
    `  correct before the reviewer   ${(r.beforeRate * 100).toFixed(1)}%`,
    `  correct after the reviewer    ${(r.afterRate * 100).toFixed(1)}%`,
    "",
    `  improved   ${String(r.improved).padStart(3)}  ${pct(r.improved)}`,
    `  unchanged  ${String(r.unchanged).padStart(3)}  ${pct(r.unchanged)}`,
    `  reduced    ${String(r.reduced).padStart(3)}  ${pct(r.reduced)}   <- review made a right answer wrong`,
    ...(r.unreadable ? [`  unreadable ${String(r.unreadable).padStart(3)}  ${pct(r.unreadable)}`] : []),
    "",
  ];
  for (const x of r.results) {
    lines.push(`  ${x.outcome.padEnd(10)} ${x.scenarioId.padEnd(30)} ${x.beforeCorrect ? "✓" : "✗"} → ${x.afterCorrect ? "✓" : "✗"}`);
  }
  if (r.notes.length) {
    lines.push("", "read this before quoting the numbers above:");
    for (const n of r.notes) lines.push(`  - ${n}`);
  }
  return lines.join("\n");
}
