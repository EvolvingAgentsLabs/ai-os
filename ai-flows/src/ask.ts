/**
 * Deixis — the question that says "this".
 *
 * A chat box has no pronouns. To ask about a step you have to describe it in
 * words, which means knowing enough about it to describe it, which is most of
 * what you were trying to find out. A canvas has selection, and **selection is
 * the pronoun**: the object is already identified, so the question can be three
 * words long.
 *
 * That is the whole of what this module enables, and it is why the interesting
 * part is not the model call — it is what gets put in front of the question.
 *
 * ## The answer comes from the trace, never from the goal
 *
 * The failure mode is specific and it is seductive. A flow's `goal` is
 * well-written prose that describes what was *intended*; its attempts are the
 * messy record of what *happened*. A model handed both will answer from the goal,
 * because the goal reads like an answer — and it will be fluent, plausible and
 * about work that was never done.
 *
 * So the context is built from attempts, states, observations and errors. The
 * goal appears once, labelled as intent, and the instruction says which one to
 * trust when they disagree.
 *
 * ## It has to be able to say "the trace does not show that"
 *
 * A step with no attempts contains no evidence. Answering anyway is the
 * confidently-wrong failure this repository keeps finding in its own
 * instruments, so the prompt names the refusal as an acceptable answer and
 * `evidenceCount` lets the caller see how much there was to work with. A
 * question asked against zero observations should be answered by the desk, not
 * by a model.
 */

export interface AskStep {
  index: number;
  state: string;
  intent: string;
  result?: string | null;
  attempts?: Array<{
    n: number;
    state: string;
    error: string | null;
    observation: { digest: string; source: string } | null;
  }>;
}

export interface AskInput {
  title: string;
  goal: string;
  state: string;
  steps: AskStep[];
  /** Which object the person had selected. The pronoun, resolved. */
  selection: { kind: "flow" } | { kind: "step"; index: number };
  question: string;
}

export interface AskPrompt {
  text: string;
  /**
   * Attempts and results actually available to answer from.
   *
   * Zero means there is nothing to reason over, and the caller should say so
   * rather than spend a model call to be told the same thing less clearly.
   */
  evidenceCount: number;
}

const INSTRUCTION = [
  "You are answering a question about one unit of work in an agent system.",
  "",
  "Answer only from the RECORD below. The RECORD is what happened.",
  "The INTENT is what somebody meant to happen and is frequently not what did —",
  "where they disagree, the RECORD is right and the INTENT is a wish.",
  "",
  'If the RECORD does not contain the answer, say "the trace does not show that"',
  "and name what would have to be recorded for it to. Do not infer, do not",
  "reconstruct a plausible history, and do not restate the INTENT as an outcome.",
  "",
  "Be brief. Three sentences is usually too many.",
].join("\n");

function stepLines(s: AskStep, focused: boolean): string[] {
  const head = `${focused ? ">> " : "   "}step ${s.index} [${s.state}] ${s.intent}`;
  const lines = [head];
  for (const a of s.attempts ?? []) {
    const bits = [`attempt ${a.n}: ${a.state}`];
    if (a.error) bits.push(`error: ${a.error}`);
    if (a.observation)
      bits.push(`observation ${a.observation.digest} (${a.observation.source})`);
    else bits.push("no observation captured");
    lines.push(`      ${bits.join(" · ")}`);
  }
  if (s.result) lines.push(`      produced: ${s.result.slice(0, 400)}`);
  if (!s.attempts?.length && !s.result) lines.push("      nothing ran");
  return lines;
}

/**
 * Build the prompt. Pure — no clock, no fetch, no model.
 *
 * Pure so the interesting claims about it are testable without buying a turn:
 * that the selected object is marked, that the record is present, and that the
 * goal is labelled as intent rather than smuggled in as fact.
 */
export function askPrompt(input: AskInput): AskPrompt {
  const focus =
    input.selection.kind === "step" ? input.selection.index : undefined;

  const record = input.steps.flatMap((s) => stepLines(s, s.index === focus));

  const evidenceCount = input.steps.reduce(
    (n, s) => n + (s.attempts?.length ?? 0) + (s.result ? 1 : 0),
    0,
  );

  const subject =
    focus === undefined
      ? `the flow "${input.title}" (state: ${input.state})`
      : `step ${focus} of the flow "${input.title}", marked >> below`;

  return {
    evidenceCount,
    text: [
      INSTRUCTION,
      "",
      `QUESTION (about ${subject}): ${input.question}`,
      "",
      `INTENT (what was asked for, not what happened): ${input.goal}`,
      "",
      "RECORD:",
      ...(record.length ? record : ["   (no steps)"]),
    ].join("\n"),
  };
}

/**
 * The answer the desk gives without asking anything.
 *
 * Returned when there is no evidence. Spending a turn to have a model say "there
 * is no information here" costs money to produce a worse version of a sentence
 * that is already known to be true.
 */
export function answerWithoutEvidence(input: AskInput): string {
  const what =
    input.selection.kind === "step"
      ? `Step ${input.selection.index} has no attempts and no result.`
      : `"${input.title}" has recorded no attempts.`;
  return `${what} There is nothing in the trace to answer from — this flow has not run, so any answer would be about the goal rather than the work.`;
}
