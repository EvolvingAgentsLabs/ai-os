/**
 * A task suite of physical systems, each with a first approximation that is
 * wrong, an exact model that is less wrong, and an oracle that knows both.
 *
 * The design borrows its shape from Asimov's *The Relativity of Wrong*: a flat
 * earth is wrong, a sphere is wrong, an oblate spheroid is wrong — and the
 * wrongness shrinks. Newtonian kinetic energy is not false, it is the leading
 * term of the relativistic one. A pendulum is not a harmonic oscillator, but at
 * five degrees you cannot tell.
 *
 * That structure buys four things no hand-labelled suite gives:
 *
 * **Difficulty is derived, not asserted.** A task is "which model do you need to
 * answer within tolerance τ", and whether the linear approximation clears τ is
 * *computed*, not judged. `level` is a fact about the task, so the difficulty
 * stratification that decides where the interaction term flips sign
 * ([doc/11](../../../doc/11-choosing-a-model.md)) rests on arithmetic instead of
 * on someone's opinion of what is hard.
 *
 * **One system generates the whole ladder.** Sweeping the tolerance moves the
 * same physical question from L1 to L3 without changing the subject, so
 * difficulty varies while domain, phrasing and answer format stay fixed. That is
 * the confound most difficulty stratifications cannot rule out.
 *
 * **The oracle is exact and testable.** Every closed form here is checked
 * against a known value in the tests, so a failed evaluation cannot be blamed on
 * the grader without the grader's own tests failing first.
 *
 * **The tools become load-bearing.** These answers need arithmetic a model
 * cannot reliably do in prose — elliptic integrals, exponentials to four
 * figures. A bare condition genuinely cannot do what a sandboxed one can, so the
 * harness lift being measured is real rather than simulated.
 *
 * **Known limitation, stated because it bounds every conclusion:** these are
 * textbook systems, and a model may have memorised the standard results.
 * Parameters are randomised per task so the *answer* is not memorisable, but the
 * *method* certainly is. This is a calibration suite for the instrument and a
 * first read on where the crossing point sits — it is not a legal or literary
 * workload and results here transfer to those only as a hypothesis.
 */

/** Relative error at which we stop calling an approximation adequate. */
export type Level = "L1" | "L2" | "L3";

export type Structure = "atomic" | "sequential" | "decomposable";

export interface PhysicsTask {
  id: string;
  system: string;
  prompt: string;
  /** High-fidelity answer. The oracle. */
  answer: number;
  units: string;
  /** Relative tolerance the answer must land within. */
  tolerance: number;
  /** What the first-order model would have answered. Kept so error reduction is visible. */
  approximation: number;
  /** |approximation − answer| / |answer|. Derived; this is what sets `level`. */
  approximationError: number;
  /**
   * L1 — the linear model already clears the tolerance.
   * L2 — it does not, but only just: within 10× the tolerance.
   * L3 — the linear model is off by more than 10× the tolerance; only the full
   *      model will do.
   */
  level: Level;
  structure: Structure;
}

// --- Oracles. Each one is checked against a published value in the tests. ---

/**
 * Complete elliptic integral of the first kind, K(m), by the
 * arithmetic-geometric mean. Quadratic convergence: eight iterations is already
 * past double precision.
 */
export function ellipticK(m: number): number {
  let a = 1;
  let b = Math.sqrt(1 - m);
  for (let i = 0; i < 20 && Math.abs(a - b) > 1e-15; i++) {
    [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  }
  return Math.PI / (2 * a);
}

const G = 9.80665;
const C = 299_792_458;

/** Exact period of a simple pendulum at finite amplitude. */
export function pendulumPeriod(lengthM: number, amplitudeRad: number): number {
  return 4 * Math.sqrt(lengthM / G) * ellipticK(Math.sin(amplitudeRad / 2) ** 2);
}

/** The small-angle answer: the leading term, and wrong by a computable amount. */
export function pendulumPeriodSmallAngle(lengthM: number): number {
  return 2 * Math.PI * Math.sqrt(lengthM / G);
}

/**
 * Relativistic kinetic energy per unit mass. Asimov's case, exactly.
 *
 * Written as `β²/(s(1+s))` with `s = √(1−β²)` rather than the textbook
 * `(1/s − 1)`. The two are identical on paper and not in floating point: at low
 * speed `1/s` is a number just above 1, subtracting 1 destroys about eleven
 * significant digits, and multiplying the wreckage by `c²` produces a confident
 * wrong answer. **[ran]** — the naive form failed a test asserting Newton is its
 * low-speed limit.
 *
 * The regime it fails in is the low-β one, which is precisely where the
 * Newtonian approximation is good — so the broken oracle would have mislabelled
 * exactly the L1 tasks and graded them against noise.
 */
export function relativisticKE(v: number): number {
  const beta2 = (v / C) ** 2;
  const s = Math.sqrt(1 - beta2);
  return (beta2 / (s * (1 + s))) * C * C;
}

/** Newtonian kinetic energy per unit mass — the leading term of the above. */
export function newtonianKE(v: number): number {
  return 0.5 * v ** 2;
}

/** Logistic growth: bounded, and exact. */
export function logistic(n0: number, r: number, k: number, t: number): number {
  return k / (1 + ((k - n0) / n0) * Math.exp(-r * t));
}

/** Unbounded exponential growth — logistic's small-population limit. */
export function exponentialGrowth(n0: number, r: number, t: number): number {
  return n0 * Math.exp(r * t);
}

/**
 * Distance fallen in time t with linear drag, terminal velocity vT.
 *
 * The textbook form `vT·t − (vT²/g)(1 − e^{−gt/vT})` subtracts two nearly equal
 * large numbers as drag weakens: at vT = 10⁹ it differences two values around
 * 3×10⁹ to recover a distance of 44 m, and returns 42.05. **[ran]** — caught by
 * a test asserting the vacuum result is the zero-drag limit.
 *
 * Factored as `(vT²/g)·(x − 1 + e^{−x})` with `x = gt/vT`, the bracket is a
 * quantity of order `x²/2` computed directly: by its series where x is small,
 * and via `expm1` otherwise. Same failure mode as the relativistic case, in the
 * same place — the limit where the simple model is nearly right.
 */
export function fallWithDrag(vT: number, t: number): number {
  const x = (G * t) / vT;
  // x - 1 + e^{-x}, to full relative precision either side of the crossover.
  const bracket = x < 1e-3 ? ((x * x) / 2) * (1 - x / 3 + (x * x) / 12) : x + Math.expm1(-x);
  return ((vT * vT) / G) * bracket;
}

/** Distance fallen in a vacuum — the zero-drag limit. */
export function fallInVacuum(t: number): number {
  return 0.5 * G * t ** 2;
}

// --- Task construction ---

function levelOf(approximationError: number, tolerance: number): Level {
  if (approximationError <= tolerance) return "L1";
  if (approximationError <= 10 * tolerance) return "L2";
  return "L3";
}

const round = (x: number, sig: number) => Number(x.toPrecision(sig));

/**
 * How many significant figures a task must be answered to.
 *
 * Derived from the task's own tolerance, which is the fix for a defect the first real
 * run exposed. The protocol used to demand a flat six figures while `tolerance` ranged
 * over 1e-1 … 1e-5, so a task needing two figures to pass still asked for six — and a
 * model that reasons "I cannot give six figures, therefore UNSURE" declined tasks it
 * could have passed. **[ran]** 24 of 24 L2 tasks came back `detected` under the flat
 * protocol, at every tolerance including the loosest. That measured obedience to an
 * impossible instruction, not capability.
 *
 * To decide |x − a|/|a| ≤ τ the reported value needs relative precision better than τ,
 * and d significant figures give about 10^(1−d). So d > 1 − log10(τ), plus two figures
 * of margin so a rounded answer cannot straddle the boundary: 3 figures at τ=1e-1,
 * 7 at τ=1e-5. The old flat six was simultaneously too many for a loose task and, at
 * τ=1e-5, only barely enough.
 */
export function significantFiguresFor(tolerance: number): number {
  return Math.ceil(-Math.log10(tolerance)) + 2;
}

/**
 * The instruction each task carries, at its own precision.
 *
 * `UNSURE` is not politeness. A wrong answer given confidently is an *undetected*
 * error, and a wrong answer flagged `UNSURE` is a detected one — which is the
 * difference between a liability and a nuisance. Offering the escape hatch is
 * what makes the undetected-error rate measurable at all in a domain where
 * everything else is exactly gradable.
 *
 * It is already appended to `PhysicsTask.prompt`; a caller sending a task should send
 * `task.prompt` as it stands. Appending this a second time doubles the precision
 * demand and biases the run toward `UNSURE` — which is how the run above was taken.
 */
export function answerProtocolFor(tolerance: number): string {
  return (
    `Reply with the numeric value only, in the stated units, to at least ${significantFiguresFor(tolerance)} ` +
    "significant figures. No words, no units, no formatting. If you cannot compute it to that precision, " +
    "reply with exactly: UNSURE"
  );
}

export interface GenOpts {
  seed?: number;
  /** Relative tolerances to sweep. Each one turns the same system into a different level. */
  tolerances?: readonly number[];
  perSystem?: number;
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

/**
 * Four systems, each swept across tolerances so the same physical question
 * appears at several levels. Parameters are randomised so the answer cannot be
 * recalled, only computed.
 */
export function physicsSuite(opts: GenOpts = {}): PhysicsTask[] {
  const { seed = 1, tolerances = [1e-1, 1e-2, 1e-3, 1e-5], perSystem = 8 } = opts;
  const r = rng(seed);
  const tasks: PhysicsTask[] = [];
  const pick = (lo: number, hi: number) => lo + r() * (hi - lo);
  // The parameter that decides how wrong the first approximation is spans orders
  // of magnitude — a pendulum at 0.5° and one at 100° are 10^4 apart in error.
  // Drawn log-uniformly, the suite populates all three levels; drawn uniformly it
  // piles up at L3 and leaves nothing to stratify against. **[ran]**
  const logPick = (lo: number, hi: number) => Math.exp(Math.log(lo) + r() * (Math.log(hi) - Math.log(lo)));

  for (let i = 0; i < perSystem; i++) {
    // Amplitude drives how wrong the small-angle model is: at 5° it is 0.05%,
    // at 90° it is 18%. One system, the whole ladder.
    const lengthM = round(pick(0.4, 2.5), 4);
    const degrees = round(logPick(0.4, 100), 3);
    const exact = pendulumPeriod(lengthM, (degrees * Math.PI) / 180);
    const approx = pendulumPeriodSmallAngle(lengthM);
    for (const tolerance of tolerances) {
      tasks.push(
        task({
          system: "pendulum-period",
          prompt:
            `A simple pendulum of length ${lengthM} m swings with angular amplitude ${degrees}°, ` +
            `with g = ${G} m/s². Give its period, accurate to a relative error below ${tolerance}.`,
          answer: exact,
          approximation: approx,
          units: "s",
          tolerance,
          structure: "atomic",
        }),
      );
    }
  }

  for (let i = 0; i < perSystem; i++) {
    const fraction = round(logPick(2e-4, 0.85), 4);
    const v = fraction * C;
    const exact = relativisticKE(v);
    for (const tolerance of tolerances) {
      tasks.push(
        task({
          system: "relativistic-energy",
          prompt:
            `A particle moves at ${fraction} times the speed of light (c = ${C} m/s). ` +
            `Give its kinetic energy per unit mass in J/kg, accurate to a relative error below ${tolerance}.`,
          answer: exact,
          approximation: newtonianKE(v),
          units: "J/kg",
          tolerance,
          structure: "atomic",
        }),
      );
    }
  }

  for (let i = 0; i < perSystem; i++) {
    const n0 = round(pick(20, 400), 4);
    const rate = round(pick(0.05, 0.9), 4);
    const k = round(n0 * logPick(2, 5000), 5);
    const t = round(logPick(0.05, 12), 4);
    const exact = logistic(n0, rate, k, t);
    for (const tolerance of tolerances) {
      tasks.push(
        task({
          system: "logistic-growth",
          prompt:
            `A population starts at ${n0}, grows at intrinsic rate ${rate} per unit time, ` +
            `and its environment supports at most ${k}. Give the population at t = ${t}, ` +
            `accurate to a relative error below ${tolerance}.`,
          answer: exact,
          approximation: exponentialGrowth(n0, rate, t),
          units: "individuals",
          tolerance,
          structure: "atomic",
        }),
      );
    }
  }

  for (let i = 0; i < perSystem; i++) {
    const vT = round(logPick(12, 40_000), 4);
    const t = round(pick(1, 14), 4);
    const exact = fallWithDrag(vT, t);
    for (const tolerance of tolerances) {
      tasks.push(
        task({
          system: "drag-fall",
          prompt:
            `A body falls from rest through air with terminal velocity ${vT} m/s and linear drag, ` +
            `with g = ${G} m/s². Give the distance fallen after ${t} s, ` +
            `accurate to a relative error below ${tolerance}.`,
          answer: exact,
          approximation: fallInVacuum(t),
          units: "m",
          tolerance,
          structure: "atomic",
        }),
      );
    }
  }

  return tasks.map((t, i) => ({ ...t, id: `${t.system}-${i}` }));
}

function task(spec: Omit<PhysicsTask, "id" | "approximationError" | "level">): PhysicsTask {
  const approximationError = Math.abs(spec.approximation - spec.answer) / Math.abs(spec.answer);
  return {
    ...spec,
    id: "",
    approximationError,
    level: levelOf(approximationError, spec.tolerance),
    prompt: `${spec.prompt}\n\n${answerProtocolFor(spec.tolerance)}`,
  };
}

// --- Grading ---

export type Outcome = "pass" | "detected" | "undetected";

/**
 * `undetected` is the expensive one: a confidently stated wrong number. A model
 * that says `UNSURE` was wrong too, but it said so, and a system built on it can
 * route around that. The two are counted separately everywhere.
 */
export function grade(task: PhysicsTask, reply: string): { outcome: Outcome; relativeError: number | null } {
  const trimmed = reply.trim();
  if (/^unsure$/i.test(trimmed)) return { outcome: "detected", relativeError: null };

  const match = trimmed.match(/-?\d[\d,]*\.?\d*(?:[eE][-+]?\d+)?/);
  if (!match) return { outcome: "detected", relativeError: null };

  const value = Number(match[0].replace(/,/g, ""));
  if (!Number.isFinite(value)) return { outcome: "detected", relativeError: null };

  const relativeError = Math.abs(value - task.answer) / Math.abs(task.answer);
  return { outcome: relativeError <= task.tolerance ? "pass" : "undetected", relativeError };
}

/**
 * How much less wrong an answer is than the first approximation.
 *
 * Above 1 the model beat the linear model; at 1 it merely reproduced it; below 0
 * it did worse than not modelling the nonlinearity at all. This is the quantity
 * Asimov's essay is about, and it separates *wrong* from *less wrong* where a
 * pass/fail grade cannot.
 */
export function errorReduction(task: PhysicsTask, relativeError: number | null): number | null {
  if (relativeError === null || task.approximationError === 0) return null;
  return 1 - relativeError / task.approximationError;
}

export function levelCounts(tasks: readonly PhysicsTask[]): Record<Level, number> {
  const out: Record<Level, number> = { L1: 0, L2: 0, L3: 0 };
  for (const t of tasks) out[t.level]++;
  return out;
}
