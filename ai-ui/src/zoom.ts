/**
 * Semantic zoom — the aggregation [04-ai-ui](../../doc/04-ai-ui.md) already
 * requires and nothing implemented.
 *
 * That document does not ask for this as a feature. It derives it, from
 * sampling:
 *
 * > A viewer sampling at `f_s` can only faithfully observe change slower than
 * > `f_s/2`. Everything faster does not vanish: it **aliases**, and comes back
 * > disguised as a slow trend that is not there.
 *
 * A person looks at a flow once or twice a day. The flow produces attempts
 * several times an hour. So the desk is already sampling far below the rate of
 * the thing it draws, and the two rules that fall out of it are the whole
 * content of this module:
 *
 *   1. **A projection declares the rate of change it represents.** A digest that
 *      does not say what window it covers invites the reader to infer a trend
 *      from noise. Every `Digest` here carries `covering`.
 *   2. **Faster-than-sampled change is aggregated, never dropped.** Dropping is
 *      what produces aliasing; summarising is what avoids it. Fifteen attempts
 *      since you last looked is one object saying *fifteen attempts, this is
 *      where it landed* — not the last one, and not all fifteen.
 *
 * Rule 2 is the one with teeth, and it is asserted directly:
 * `attemptsRepresented` is conserved across every level, so a digest can compress
 * but can never quietly lose an attempt. A summary that drops is the failure this
 * module exists to prevent, and it is invisible unless something counts.
 *
 * ## Why this is deterministic, with no model in it
 *
 * The obvious version of "semantic zoom" asks a model to summarise. This one
 * does not, for a reason the workspace keeps relearning: the falsifiable part is
 * cheap and the expensive part is an enrichment. *How many attempts, where it
 * landed, is it moving, did anything carry nothing forward* are all computable
 * from the trace — and they are what the stopwatch in 04 actually times.
 *
 * A model can add prose on top ([projection.ts](projection.ts) is where that
 * lands, on state change rather than on render). It cannot be allowed underneath,
 * because then the counts that guard rule 2 would come from a sampler and no test
 * could hold them.
 */
import type { FlowTrace, TraceStep } from "./trace.ts";

/**
 * How far out the viewer is standing.
 *
 * `attempt` is the raw stream — the transcript shape, kept because at the bottom
 * of the zoom there is nowhere left to aggregate to. `flow` is the answer to
 * "where is this" from across the room.
 */
export const ZOOM_LEVELS = ["flow", "step", "attempt"] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export interface Digest {
  level: ZoomLevel;
  /**
   * What this digest is about — a flow id, or `${flowId}#${stepIndex}`.
   */
  subject: string;
  /** The headline. Never a truncation: always a statement about the whole. */
  headline: string;
  /**
   * The window this projection represents, in words.
   *
   * Rule 1. "state now" and "state over the last 6 hours" are different objects
   * and a projection that does not say which one it is, is not readable.
   */
  covering: string;
  /**
   * How many attempts this digest stands for.
   *
   * Rule 2, made countable. Conserved across levels: summing the children of a
   * digest must give the parent's number, or something was dropped.
   */
  attemptsRepresented: number;
  /** Where it landed. Not the last thing that happened — the settled state. */
  landedOn: string;
  /** Flags worth carrying up: drift, a step that used nothing it was given. */
  flags: string[];
  /** One level down. Empty at `attempt`. */
  children: Digest[];
}

/**
 * Words for a span, rather than a timestamp.
 *
 * "3 days" is the unit a person answering *is this stale* actually uses, and
 * `2026-08-09T18:51:43.212Z` is the unit that makes them do the subtraction.
 */
export function spanWords(ms: number): string {
  if (ms < 0) return "the future — check the clock";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

function attemptsOf(step: TraceStep): number {
  return step.attempts.length;
}

/**
 * Where a step landed, as opposed to the last thing it did.
 *
 * These differ exactly when they matter. A step with four failed attempts and a
 * fifth that succeeded landed on `done`, and reporting "the last attempt" would
 * be right by luck. A step whose last attempt is still `running` has not landed
 * at all, and saying `running` as if it were an outcome is the aliasing this
 * module exists to stop.
 */
function landing(step: TraceStep): string {
  if (step.state === "running") return "still running";
  if (step.state === "waiting") return "waiting";
  return step.state;
}

function stepDigest(
  flowId: string,
  step: TraceStep,
  covering: string,
  level: ZoomLevel,
): Digest {
  const n = attemptsOf(step);
  const flags: string[] = [];
  if (step.ignoredInput)
    flags.push(
      `used nothing it was given (${step.ignoredInput.carried} of ${step.ignoredInput.inputTokens} tokens carried)`,
    );
  const failed = step.attempts.filter((a) => a.state === "failed").length;
  if (failed > 0 && step.state === "done")
    flags.push(`${failed} failed attempt(s) before it settled`);

  // The headline states the whole, and it never reads as "the latest thing".
  // `n` attempts is the fact that aliasing destroys, so it goes first.
  const who = step.agent ? `${step.agent}` : "unassigned";
  const headline =
    n === 0
      ? `${who} — not started`
      : n === 1
        ? `${who} — one attempt, ${landing(step)}`
        : `${who} — ${n} attempts, ${landing(step)}`;

  return {
    level: "step",
    subject: `${flowId}#${step.index}`,
    headline,
    covering,
    attemptsRepresented: n,
    landedOn: landing(step),
    flags,
    children:
      level === "attempt"
        ? step.attempts.map((a) => ({
            level: "attempt" as const,
            subject: `${flowId}#${step.index}@${a.n}`,
            headline: `attempt ${a.n} — ${a.state}${a.error ? `: ${a.error}` : ""}`,
            covering,
            attemptsRepresented: 1,
            landedOn: a.state,
            flags: a.digest ? [] : ["no observation captured"],
            children: [],
          }))
        : [],
  };
}

export interface DigestInput {
  flowId: string;
  title: string;
  state: string;
  /** When the flow last moved. Used only to say how stale this projection is. */
  updatedAt: number;
  trace: FlowTrace;
}

/**
 * Build the digest of one flow at one zoom level.
 *
 * Pure: no fetch, no clock of its own. `now` is passed so the window it declares
 * is the caller's, and so a test can state one.
 */
export function digestOf(
  input: DigestInput,
  level: ZoomLevel,
  now: number,
): Digest {
  const covering = `state as of ${spanWords(now - input.updatedAt)} ago`;
  const steps = input.trace.steps;
  const children =
    level === "flow"
      ? []
      : steps.map((s) => stepDigest(input.flowId, s, covering, level));

  // Conserved whether or not the children are built. Computing this from
  // `children` would make the flow level report zero, which is precisely the
  // silent drop rule 2 forbids.
  const attempts = steps.reduce((sum, s) => sum + attemptsOf(s), 0);

  const done = steps.filter((s) => s.state === "done").length;
  const flags: string[] = [];
  if (input.trace.movementTone === "warn") flags.push(input.trace.movement);
  if (input.trace.ignoredCount > 0)
    flags.push(
      `${input.trace.ignoredCount} step(s) used nothing they were given`,
    );

  const blocked = steps.find(
    (s) => s.state === "failed" || s.state === "waiting",
  );

  // "Where it landed" for a whole flow is the question the stopwatch asks:
  // what is the state, what is blocked, what did it produce.
  const landedOn = blocked
    ? `${blocked.state} at step ${blocked.index}${blocked.agent ? ` (${blocked.agent})` : ""}`
    : input.state;

  const headline =
    attempts === 0
      ? `${input.title} — nothing has run`
      : `${input.title} — ${attempts} attempt(s) across ${steps.length} step(s), ${done} done, ${landedOn}`;

  return {
    level,
    subject: input.flowId,
    headline,
    covering,
    attemptsRepresented: attempts,
    landedOn,
    flags,
    children,
  };
}

/**
 * The conservation check, exported because it is the property and not an
 * implementation detail.
 *
 * A digest with children must represent exactly what its children represent.
 * Anything else means the summary dropped an attempt, which is the failure mode
 * that reads as a clean number.
 */
export function conserves(d: Digest): boolean {
  if (d.children.length === 0) return true;
  const sum = d.children.reduce((n, c) => n + c.attemptsRepresented, 0);
  return sum === d.attemptsRepresented && d.children.every(conserves);
}
