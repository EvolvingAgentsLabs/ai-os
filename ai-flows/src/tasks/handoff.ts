/**
 * Sequential tasks: one physical question split across a handoff between two agents.
 *
 * **Why this family exists.** The atomic suite has no headroom left. Scored through
 * the agent path at L2, deepseek-v4-flash passed 12 of 12 with relative errors from
 * 1e-6 to 1e-13 **[ran]** — with Python available, the arithmetic is simply not hard,
 * so there is no procedure left for a learned strategy to supply. The failure mode
 * that survives tools is not computational, it is **informational**: the first agent
 * does not record what the second one needs.
 *
 * That is the failure worth measuring, because it is the one that does not go away as
 * models improve. A first-version agent that works alone is not thereby fit to be part
 * of a multi-agent system, and nothing about being better at arithmetic fixes it.
 *
 * **The trap is natural, not engineered.** The explorer is asked for an intermediate
 * quantity and is told nothing about what the finisher will need. Left to itself it
 * reports a number, because that is what was asked. The finisher then has a number and
 * no way to use it: which quantity it is, what units, which parameters produced it,
 * whether it is the exact or the first-order form. Nobody wrote a trap — the trap is
 * that reporting an answer and enabling a successor are different jobs, and only the
 * first one was requested.
 *
 * **What makes it gradable.** Both halves have exact oracles, so the two failures can
 * be told apart. If the explorer's intermediate is wrong the chain was broken before
 * the handoff, and that says nothing about handoffs. The measurement this family is for
 * is `handoffLoss`: the explorer got its part RIGHT and the finisher still failed. That
 * is the trap firing, and it is what a distilled strategy — "when closing a step
 * another agent continues, record the quantity, its units and the parameters" — should
 * reduce. Reducing it is the claim; the slope of it over a sequence is the evidence.
 */
import {
  ellipticK,
  fallWithDrag,
  logistic,
  pendulumPeriod,
  relativisticKE,
  significantFiguresFor,
  type Level,
  type Outcome,
  type Structure,
} from "./physics.ts";

const G = 9.80665;
const C = 299_792_458;

export interface HandoffTask {
  id: string;
  system: string;
  structure: Structure;
  /** What the first agent is asked for, and nothing about who reads it next. */
  explorerPrompt: string;
  /** What the second agent is asked for, given only the handoff note. */
  finisherPrompt: string;
  /**
   * The parameters the finisher needs, as data.
   *
   * A consumer that wants them must not read them back out of the prompt: the first
   * version of the composition test did, and a regex swallowed a sentence-ending
   * period into a number, producing NaN. Prose is for the model; this is for code.
   */
  params: Readonly<Record<string, number>>;
  /**
   * Every quantity the finisher needs, with its oracle value.
   *
   * The explorer computes all of them — none can be recovered from the finisher's own
   * prompt, which carries no task numbers at all. So a note that omits one leaves the
   * finisher genuinely unable to proceed, and THAT omission is what this family
   * measures. The earlier design gave the finisher the parameters as well, which made
   * the note optional and drove the loss rate to zero by construction **[ran]**.
   */
  required: ReadonlyArray<{ name: string; value: number }>;
  /** Oracle for the final answer the finisher must produce. */
  answer: number;
  units: string;
  tolerance: number;
  level: Level;
}

export interface HandoffGrade {
  /** Which required quantities the note actually carries, within tolerance. */
  present: string[];
  missing: string[];
  /** The note carries everything the finisher needs. */
  noteComplete: boolean;
  finisher: Outcome;
  finisherRelativeError: number | null;
  /**
   * The recording failure, and the one this family exists for: the explorer computed
   * what it was asked and the note still does not carry everything its successor
   * needs. Measured on the note itself rather than inferred from the finisher, because
   * a finisher can fail for its own reasons and a note can be incomplete while a lucky
   * finisher still lands the answer.
   */
  noteOmission: boolean;
  /**
   * The reading failure: the note had everything and the finisher failed anyway —
   * ambiguous labels, two numbers it could not tell apart, or a misread.
   */
  handoffLoss: boolean;
}

const NUMBER_RE = /-?\d[\d,]*\.?\d*(?:[eE][-+]?\d+)?/;

function gradeOne(
  reply: string,
  oracle: number,
  tolerance: number,
): { outcome: Outcome; relativeError: number | null } {
  const trimmed = reply.trim();
  if (/^unsure$/i.test(trimmed)) return { outcome: "detected", relativeError: null };
  const match = NUMBER_RE.exec(trimmed);
  if (!match) return { outcome: "detected", relativeError: null };
  const value = Number(match[0].replace(/,/g, ""));
  if (!Number.isFinite(value)) return { outcome: "detected", relativeError: null };
  const relativeError = Math.abs(value - oracle) / Math.abs(oracle);
  return { outcome: relativeError <= tolerance ? "pass" : "undetected", relativeError };
}

/**
 * The explorer is graded against a deliberately looser bar than the finisher.
 *
 * Its intermediate only has to be good enough for the final answer to land inside
 * tolerance, and it is graded one order of magnitude tighter than the final tolerance
 * rather than at machine precision. Grading it exactly would classify a perfectly
 * usable handoff as a broken chain, and then every `handoffLoss` figure would be
 * measuring the explorer's rounding instead of the handoff.
 */
export function noteCarries(note: string, value: number, tolerance: number): boolean {
  const numbers = note.match(/-?\d[\d,]*\.?\d*(?:[eE][-+]?\d+)?/g) ?? [];
  for (const raw of numbers) {
    const parsed = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed === 0) continue;
    if (Math.abs(parsed - value) / Math.abs(value) <= tolerance) return true;
  }
  return false;
}

export function gradeHandoff(task: HandoffTask, note: string, finisherReply: string): HandoffGrade {
  const present: string[] = [];
  const missing: string[] = [];
  for (const q of task.required) {
    (noteCarries(note, q.value, task.tolerance / 10) ? present : missing).push(q.name);
  }
  const noteComplete = missing.length === 0;
  const finisher = gradeOne(finisherReply, task.answer, task.tolerance);
  return {
    present,
    missing,
    noteComplete,
    finisher: finisher.outcome,
    finisherRelativeError: finisher.relativeError,
    noteOmission: !noteComplete,
    handoffLoss: noteComplete && finisher.outcome !== "pass",
  };
}

/**
 * What the explorer is told to leave behind, and the reason it is this bare.
 *
 * It names a file and asks for the intermediate. It does NOT say what to include, what
 * the next agent needs, or that a next agent exists in any useful detail — because the
 * treatment arm's whole content is a strategy that supplies exactly that, and putting
 * it in the control prompt would leave nothing to learn. Anything added here has to be
 * added to both arms or the comparison is over before it starts.
 */
export const HANDOFF_FILE = "handoff/note.md";

export function explorerInstruction(task: HandoffTask): string {
  return (
    `${task.explorerPrompt}\n\n` +
    `Compute it with the execute tool. Write your result to \`${HANDOFF_FILE}\`, ` +
    "overwriting whatever is there. Another agent will pick up from that file to finish the job."
  );
}

export function finisherInstruction(task: HandoffTask): string {
  const figures = significantFiguresFor(task.tolerance);
  return (
    `Read \`${HANDOFF_FILE}\`. A previous agent left its work there, and it is your only source: ` +
    `you have no other values for this problem. ${task.finisherPrompt}\n\n` +
    `Compute it with the execute tool. Reply with the numeric value only, in ${task.units}, to at least ` +
    `${figures} significant figures. No words, no units, no formatting. If the note does not give you ` +
    "what you need, reply with exactly: UNSURE"
  );
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function levelOf(approximationError: number, tolerance: number): Level {
  if (approximationError <= tolerance) return "L1";
  if (approximationError <= 10 * tolerance) return "L2";
  return "L3";
}

const round = (x: number, sig: number) => Number(x.toPrecision(sig));

export interface HandoffGenOpts {
  seed?: number;
  tolerances?: readonly number[];
  perSystem?: number;
}

/**
 * Four splits, one per system, each chosen so the intermediate is genuinely
 * insufficient on its own — a bare number that could be several different quantities,
 * and that needs a parameter the finisher was never given.
 */
export function handoffSuite(opts: HandoffGenOpts = {}): HandoffTask[] {
  const { seed = 1, tolerances = [1e-2, 1e-3, 1e-5], perSystem = 4 } = opts;
  const r = rng(seed);
  const pick = (lo: number, hi: number) => lo + r() * (hi - lo);
  const logPick = (lo: number, hi: number) => Math.exp(Math.log(lo) + r() * (Math.log(hi) - Math.log(lo)));
  const tasks: HandoffTask[] = [];

  const push = (t: Omit<HandoffTask, "id" | "level" | "structure">, approximationError: number) =>
    tasks.push({
      ...t,
      id: "",
      structure: "sequential",
      level: levelOf(approximationError, t.tolerance),
    });

  for (let i = 0; i < perSystem; i++) {
    const lengthM = round(pick(0.4, 2.5), 4);
    const degrees = round(logPick(5, 100), 3);
    const amplitude = (degrees * Math.PI) / 180;
    const m = Math.sin(amplitude / 2) ** 2;
    const k = ellipticK(m);
    const exact = pendulumPeriod(lengthM, amplitude);
    const approxError = Math.abs(2 * Math.PI * Math.sqrt(lengthM / G) - exact) / Math.abs(exact);
    for (const tolerance of tolerances) {
      push(
        {
          system: "pendulum-handoff",
          explorerPrompt:
            `A simple pendulum of length ${lengthM} m swings with angular amplitude ${degrees}°, with ` +
            `g = ${G} m/s². Compute two quantities: P = √(L/g), and K(m), the complete elliptic ` +
            "integral of the first kind with m = sin²(amplitude/2).",
          finisherPrompt: "Give the pendulum's exact period in seconds, which is 4·P·K(m).",
          params: { lengthM, g: G },
          required: [
            { name: "P", value: Math.sqrt(lengthM / G) },
            { name: "K(m)", value: k },
          ],
          answer: exact,
          units: "s",
          tolerance,
        },
        approxError,
      );
    }
  }

  for (let i = 0; i < perSystem; i++) {
    const fraction = round(logPick(0.05, 0.85), 4);
    const v = fraction * C;
    const beta2 = fraction ** 2;
    const s = Math.sqrt(1 - beta2);
    const exact = relativisticKE(v);
    const approxError = Math.abs(0.5 * v ** 2 - exact) / Math.abs(exact);
    for (const tolerance of tolerances) {
      push(
        {
          system: "relativistic-handoff",
          explorerPrompt:
            `A particle moves at β = ${fraction} times the speed of light, c = ${C} m/s. Compute two ` +
            "quantities: β², and s = √(1 − β²).",
          finisherPrompt:
            "Give the particle's relativistic kinetic energy per unit mass in J/kg, which is " +
            "(β²/(s·(1+s)))·c², with c = 299792458 m/s.",
          params: { beta: fraction, c: C },
          required: [
            { name: "β²", value: beta2 },
            { name: "s", value: s },
          ],
          answer: exact,
          units: "J/kg",
          tolerance,
        },
        approxError,
      );
    }
  }

  for (let i = 0; i < perSystem; i++) {
    const n0 = round(pick(20, 400), 4);
    const rate = round(pick(0.05, 0.9), 4);
    const kCap = round(n0 * logPick(2, 500), 5);
    const t = round(pick(2, 40), 4);
    const decay = Math.exp(-rate * t);
    const exact = logistic(n0, rate, kCap, t);
    const approxError = Math.abs(n0 * Math.exp(rate * t) - exact) / Math.abs(exact);
    for (const tolerance of tolerances) {
      push(
        {
          system: "logistic-handoff",
          explorerPrompt:
            `A population grows logistically from N₀ = ${n0} with rate r = ${rate} per unit time and ` +
            `carrying capacity K = ${kCap}. Compute three quantities: K, A = (K−N₀)/N₀, and ` +
            `B = e^(−r·t) at t = ${t} time units.`,
          finisherPrompt: "Give the population at that time, which is K/(1 + A·B).",
          params: { n0, kCap },
          required: [
            { name: "K", value: kCap },
            { name: "A", value: (kCap - n0) / n0 },
            { name: "B", value: decay },
          ],
          answer: exact,
          units: "individuals",
          tolerance,
        },
        approxError,
      );
    }
  }

  for (let i = 0; i < perSystem; i++) {
    const vT = round(logPick(8, 400), 4);
    const t = round(pick(1.5, 25), 4);
    const x = (G * t) / vT;
    const bracket = x < 1e-3 ? ((x * x) / 2) * (1 - x / 3 + (x * x) / 12) : x + Math.expm1(-x);
    const exact = fallWithDrag(vT, t);
    const approxError = Math.abs(0.5 * G * t ** 2 - exact) / Math.abs(exact);
    for (const tolerance of tolerances) {
      push(
        {
          system: "drag-fall-handoff",
          explorerPrompt:
            `A body falls for ${t} s with terminal velocity vT = ${vT} m/s and g = ${G} m/s². Compute ` +
            "two quantities: C = vT²/g, and D = x − 1 + e^(−x) where x = g·t/vT.",
          finisherPrompt: "Give the distance the body has fallen in metres, which is C·D.",
          params: { vT, g: G },
          required: [
            { name: "C", value: (vT * vT) / G },
            { name: "D", value: bracket },
          ],
          answer: exact,
          units: "m",
          tolerance,
        },
        approxError,
      );
    }
  }

  return tasks.map((t, i) => ({ ...t, id: `${t.system}-${i}` }));
}

/** The recording failure rate: notes that omitted something their successor needed. */
export function noteOmissionRate(grades: readonly HandoffGrade[]): number {
  if (!grades.length) return 0;
  return grades.filter((g) => g.noteOmission).length / grades.length;
}

/** The reading failure rate, over the notes that were complete enough to read. */
export function handoffLossRate(grades: readonly HandoffGrade[]): number {
  const complete = grades.filter((g) => g.noteComplete);
  if (!complete.length) return 0;
  return complete.filter((g) => g.handoffLoss).length / complete.length;
}
