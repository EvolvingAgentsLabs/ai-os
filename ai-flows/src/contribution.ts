/**
 * Did this step use what it was given?
 *
 * [13-degradation](../../doc/13-degradation.md) names the cheapest signal ai-os
 * is missing: a step that runs, reports cleanly and adds nothing, while every
 * other indicator says the flow succeeded. That document proposed comparing a
 * step's observation digest against its predecessor's.
 *
 * **That proposal does not work, and finding out cost one function.** The real
 * failure produced *different* text from its predecessor — `ReviewAgent`
 * answering "there are no files in the workspace to review" hashes nowhere near
 * a migration proposal. Digest equality catches a step that repeated itself. It
 * cannot catch a step that ignored its input, which is the failure that happened.
 *
 * ## What is actually measurable
 *
 * A step that builds on its input carries some of that input's distinctive
 * content into its output — the column name, the table, the error. A step that
 * ignored its input carries **none**. That is computable from two strings with no
 * model call, and it is the signal here.
 *
 * ## The threshold problem, and the refusal to invent one
 *
 * Overlap does not cleanly separate good from bad in general:
 *
 * - **zero overlap** — the step used nothing it was given. Unambiguous.
 * - **high overlap** — the step engaged with its input. It may still be merely
 *   restating it, which is *also* a non-contribution, and this cannot tell those
 *   apart. doc/13 predicted exactly this.
 *
 * So this flags **only the unambiguous end**, and refuses to place a threshold
 * anywhere in the middle. Two observations is not enough to calibrate one, and a
 * tuned cutoff on n=2 is how an instrument starts producing the answer its author
 * expected. The overlap figure is always reported; the *verdict* is only ever
 * `ignored-input`, `used-input` or `insufficient`.
 */

/**
 * Words too common to be evidence of anything. Deliberately short: a longer list
 * is a tuning knob, and every entry added is a chance to make the signal say what
 * one wants.
 */
const COMMON = new Set([
  "the","a","an","and","or","but","if","then","this","that","these","those","is","are","was","were","be","been",
  "to","of","in","on","at","for","with","from","by","as","it","its","not","no","yes","can","cannot","will","would",
  "there","here","have","has","had","do","does","did","you","your","i","we","they","he","she","them","us","me",
  "what","which","who","when","where","how","why","all","any","some","one","two","more","most","other","than",
  "so","up","out","about","into","over","after","before","only","also","just","should","could","may","might",
]);

/** Distinctive tokens: lowercase, alphanumeric-ish, at least four characters, not common. */
export function distinctiveTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9_]+/)) {
    if (raw.length < 4) continue;
    if (COMMON.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

export type ContributionVerdict =
  /** The step used none of what it was given. The unambiguous failure. */
  | "ignored-input"
  /** Some of the input's distinctive content appears in the output. */
  | "used-input"
  /** There was nothing to build on, or too little text to say anything. */
  | "insufficient";

export interface Contribution {
  verdict: ContributionVerdict;
  /** Share of the input's distinctive tokens that appear in the output, 0–1. */
  carried: number;
  /** How many distinctive tokens the input had. Small numbers make `carried` meaningless. */
  inputTokens: number;
  /** The tokens actually carried, so a verdict can be argued with rather than trusted. */
  overlap: string[];
}

/**
 * Minimum distinctive tokens in the input before a verdict is offered.
 *
 * Below this, "carried nothing" is as likely to mean the input was two words as
 * that the step ignored it, and a signal that fires on short inputs would fire
 * constantly on flows whose steps are terse by design.
 */
export const MIN_INPUT_TOKENS = 12;

export function contributionOf(priorOutput: string, stepOutput: string): Contribution {
  const input = distinctiveTokens(priorOutput);
  const output = distinctiveTokens(stepOutput);
  const overlap = [...input].filter((t) => output.has(t));
  const carried = input.size === 0 ? 0 : overlap.length / input.size;

  if (input.size < MIN_INPUT_TOKENS || stepOutput.trim().length === 0) {
    return { verdict: "insufficient", carried, inputTokens: input.size, overlap };
  }
  return {
    // Only the unambiguous end. See the header: no threshold is placed in the
    // middle, because two observations cannot calibrate one.
    verdict: overlap.length === 0 ? "ignored-input" : "used-input",
    carried,
    inputTokens: input.size,
    overlap: overlap.slice(0, 20),
  };
}

export interface StepContribution extends Contribution {
  stepIndex: number;
}

/**
 * Walk a settled flow and report which steps ignored what they were handed.
 *
 * Only consecutive settled steps are compared — an unfinished step has produced
 * nothing to judge, and a failed one produced no result to carry.
 */
export function contributionsOf(
  steps: ReadonlyArray<{ index: number; state: string; result: string | null }>,
): StepContribution[] {
  const out: StepContribution[] = [];
  const settled = [...steps].filter((s) => s.state === "done" && s.result).sort((a, b) => a.index - b.index);
  for (let i = 1; i < settled.length; i += 1) {
    const prior = settled[i - 1]!;
    const step = settled[i]!;
    out.push({ stepIndex: step.index, ...contributionOf(prior.result ?? "", step.result ?? "") });
  }
  return out;
}
