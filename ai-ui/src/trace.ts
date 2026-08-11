/**
 * What actually happened, as opposed to what is scheduled to happen.
 *
 * The desk shipped a flow's *skeleton* — how many steps, which agent, what state
 * — and stopped there. That is enough to answer "where is this", which is what a
 * canvas is usually for, and it is not enough to answer the question this whole
 * system exists to answer: **what happened, and should I change the agents?**
 *
 * The two instruments built for that read attempts and observations:
 *
 *   - `contributionsOf` finds a step that ran, settled, reported — and used
 *     nothing it was handed ([13-degradation](../../doc/13-degradation.md)).
 *   - `observabilityOf` reads the fingerprints of successive attempts and says
 *     whether the flow is moving, repeating itself, or too quiet to tell
 *     ([10-observability](../../doc/10-observability.md)).
 *
 * Neither reached the canvas, because neither's input did. This module carries
 * them across, and it **reuses the modules rather than reimplementing them**: a
 * second copy of "is this drifting" is a second answer to it, and the one on the
 * screen would be the one nobody tested.
 *
 * ## This is real, not simulated
 *
 * Every field here comes from the flow store. Memory (`memory.ts`) is the
 * opposite and says so loudly. Keeping the two apart matters more than either:
 * a surface that mixes measured state with a sketch of state teaches its reader
 * to trust both equally.
 */
import { contributionsOf } from "../../ai-flows/src/contribution.ts";
import { observabilityOf } from "../../ai-flows/src/observability.ts";

/**
 * 95% upper bound on the false-change rate, measured on `pi` / `deepseek-v4-flash`
 * over 22 turns of repeated identical work. Same constant the explorer uses, and
 * for the same reason: quoting the 0% point estimate would claim the instrument
 * never lies, which 22 turns cannot establish.
 */
export const DELTA_UPPER_BOUND = 0.146;

export interface TraceAttempt {
  n: number;
  state: string;
  runId: string | null;
  /** The fingerprint captured when the attempt closed. Never inferred (ADR-0007). */
  digest: string | null;
  source: string | null;
  error: string | null;
}

export interface TraceStep {
  index: number;
  state: string;
  agent: string | null;
  /** Trimmed for the panel; the full text is one API call away. */
  result: string | null;
  attempts: TraceAttempt[];
  /**
   * Set only when this step used nothing its predecessor gave it.
   *
   * Absent means "not flagged", which includes "there was not enough input to
   * judge" — `contribution.ts` refuses to grade a handoff below
   * `MIN_INPUT_TOKENS`, and rendering that refusal as a pass would invent a
   * verdict it declined to give.
   *
   * `note` is set when the verdict came from the runner's own measurement rather
   * than from prose overlap, and it says which instrument spoke. A flag that
   * always claims to have counted distinctive tokens is lying the moment the
   * step's output was numbers.
   */
  ignoredInput?: { carried: number; inputTokens: number; note?: string };
  /**
   * The step's output as a shape, when the runner reported one.
   *
   * Numbers are the one kind of result that prose cannot summarise: "the band is
   * clean" and "the band is empty" are the same sentence, and only the picture
   * separates them. Optional everywhere — a flow of text steps carries none.
   */
  series?: number[];
}

export interface FlowTrace {
  /** progressing · drift · unreadable · not enough to say */
  movement: string;
  movementTone: "ok" | "warn" | "muted";
  /** Observations seen, and the bound they are read under. */
  detail: string;
  steps: TraceStep[];
  /** Steps that ran and carried nothing forward. The headline of doc/13. */
  ignoredCount: number;
}

export interface RawStep {
  index: number;
  state: string;
  intent: string;
  result?: string | null;
  /**
   * What the runner measured about this step's handoff, if it measured one.
   *
   * Prose overlap ([contribution.ts](../../ai-flows/src/contribution.ts)) is the
   * fallback for when nothing better exists, and it is the wrong instrument for
   * a step whose output is a waveform: two stages can share every word and one
   * of them can still have deleted the signal. When the thing that ran the step
   * can answer "does my output move when my input does", its answer wins.
   */
  contribution?: { carried: number; inputTokens: number; note?: string };
  /** The step's output as numbers, if it produced any. */
  series?: number[];
  attempts?: Array<{
    n: number;
    state: string;
    runId: string | null;
    error: string | null;
    observation: { digest: string; source: string } | null;
  }>;
}

/** Build the trace view of one flow. Pure: no fetch, no clock. */
export function traceOf(
  steps: RawStep[],
  agentOf: (intent: string) => string | null,
): FlowTrace {
  const digests = steps
    .flatMap((s) => s.attempts ?? [])
    .map((a) => a.observation?.digest)
    .filter((d): d is string => Boolean(d));

  let movement = "not enough to say";
  let tone: FlowTrace["movementTone"] = "muted";
  let detail = `${digests.length} observation(s)`;
  if (digests.length >= 2) {
    const o = observabilityOf(digests, { floor: DELTA_UPPER_BOUND });
    detail = `${digests.length} observations · δ ≤ ${(DELTA_UPPER_BOUND * 100).toFixed(1)}%`;
    if (o.verdict === "progressing") {
      movement = "progressing";
      tone = "ok";
    } else if (o.verdict === "drift") {
      movement = "drift — repeating itself";
      tone = "warn";
    } else if (o.verdict === "unreadable") {
      movement = "unreadable — fix the fingerprint";
      tone = "warn";
    }
  }

  // Measured beats inferred. Steps whose runner reported a contribution are not
  // handed to the prose instrument at all -- running both and picking would be
  // two verdicts about one handoff, and the screen would show whichever came
  // second.
  const measured = new Map(
    steps
      .filter((s) => s.contribution)
      .map((s) => [s.index, s.contribution!] as const),
  );

  const ignored = new Map(
    contributionsOf(
      steps
        .filter((s) => !s.contribution)
        .map((s) => ({
          index: s.index,
          state: s.state,
          result: s.result ?? null,
        })),
    )
      .filter((c) => c.verdict === "ignored-input")
      .map((c) => [c.stepIndex, c] as const),
  );

  let flaggedCount = ignored.size;
  for (const c of measured.values()) if (c.carried === 0) flaggedCount += 1;

  return {
    movement,
    movementTone: tone,
    detail,
    ignoredCount: flaggedCount,
    steps: steps.map((s) => {
      const own = measured.get(s.index);
      const flagged = own && own.carried === 0 ? own : ignored.get(s.index);
      return {
        index: s.index,
        state: s.state,
        agent: agentOf(s.intent),
        result: s.result ? s.result.slice(0, 600) : null,
        attempts: (s.attempts ?? []).map((a) => ({
          n: a.n,
          state: a.state,
          runId: a.runId,
          digest: a.observation?.digest ?? null,
          source: a.observation?.source ?? null,
          error: a.error,
        })),
        ...(s.series ? { series: s.series } : {}),
        ...(flagged
          ? {
              ignoredInput: {
                carried: flagged.carried,
                inputTokens: flagged.inputTokens,
                ...("note" in flagged && flagged.note ? { note: flagged.note } : {}),
              },
            }
          : {}),
      };
    }),
  };
}
