import { createHash } from "node:crypto";

/**
 * Is a flow's progress readable from what it records?
 *
 * Every "it stopped moving" claim is a claim that two states are the same, and
 * that claim is only as good as the instrument making it. Model
 * non-determinism means identical work does not always produce an identical
 * fingerprint, so the instrument has a false-change rate, and it has to be
 * measured before anything is inferred from it.
 *
 * The comparison is a Z-channel, not a symmetric one:
 *
 *   state unchanged  ──(1-δ)──▶  digest equal
 *                    ──( δ )──▶  digest different      ← noise
 *   state changed    ──( 1 )──▶  digest different
 *
 * Digest equality is proof; digest difference is a rumour. That asymmetry is
 * the whole design: the failure this module exists to catch is not a false
 * alarm, it is the silent one — a stuck flow whose fingerprint keeps moving.
 *
 * Nothing here consumes a flow's state. It reports; the engine decides.
 */

/** One candidate fingerprint, not the decision. Which digest to use is settled by measurement. */
export function digestOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * δ — the instrument's false-change rate, estimated from repeated identical work.
 *
 * Each group is one piece of work run several times from the same starting
 * state, so every observed difference inside a group is noise by construction.
 * Pooled pairwise disagreement across groups. Groups with fewer than two
 * entries carry no information and are ignored.
 */
export function divergenceRate(groups: readonly (readonly string[])[]): number {
  let differing = 0;
  let pairs = 0;
  for (const group of groups) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        pairs++;
        if (group[i] !== group[j]) differing++;
      }
    }
  }
  if (pairs === 0) return Number.NaN;
  return differing / pairs;
}

/**
 * Capacity of the Z-channel above, in bits per attempt.
 *
 *   C(δ) = log₂(1 + (1-δ)·δ^(δ/(1-δ)))
 *
 * C(0) = 1 bit — a perfect instrument. C(1) = 0 — one that says "different"
 * whatever happens, and therefore says nothing. Reported so the number that
 * bounds every downstream claim is visible rather than implied.
 */
export function channelCapacity(delta: number): number {
  if (!(delta >= 0 && delta <= 1)) return Number.NaN;
  if (delta === 0) return 1;
  if (delta === 1) return 0;
  return Math.log2(1 + (1 - delta) * Math.pow(delta, delta / (1 - delta)));
}

/**
 * P(a stuck flow is caught within `window` attempts) = (1-δ)^window.
 *
 * This is the curve that decides whether the module is worth running at all. A
 * stuck flow only announces itself by repeating its fingerprint, and noise
 * breaks the repeat. At δ = 0.8 and a window of 3, roughly eight stuck flows
 * in a thousand are ever noticed — no amount of extra waiting changes that,
 * because waiting is what the noise is destroying.
 */
export function detectionProbability(delta: number, window: number): number {
  if (!(delta >= 0 && delta <= 1) || window < 1) return Number.NaN;
  return Math.pow(1 - delta, window);
}

export interface ObservabilityOpts {
  /** δ from `divergenceRate`, measured on this harness. Required — there is no safe default. */
  floor: number;
  /** Consecutive identical fingerprints that count as not moving. */
  window?: number;
  /** Below this detection probability the instrument cannot see a stuck flow at all. */
  minDetect?: number;
}

export type ObservabilityVerdict =
  /** Fewer observations than the window needs. Not a finding. */
  | "insufficient"
  /**
   * The instrument cannot distinguish a stuck flow from a working one at this
   * window. More steps do not help; the fingerprint source is wrong.
   */
  | "unreadable"
  /** Fingerprints repeating: observable, and not moving. */
  | "drift"
  /** Fingerprints changing, and a stuck flow would have been caught. */
  | "progressing";

export interface Observability {
  verdict: ObservabilityVerdict;
  /** True unless the verdict is `unreadable` or `insufficient`. */
  observable: boolean;
  /** Attempts of evidence used. */
  window: number;
  /** δ echoed back, so a verdict is never read without the number that bounds it. */
  floor: number;
  /** (1-δ)^window. */
  detection: number;
  /** Bits per attempt this instrument can carry. */
  capacity: number;
  /** Index of the first attempt in the unchanging run, when the verdict is `drift`. */
  sinceIndex: number | null;
}

/**
 * `digests` are the fingerprints of successive attempts, oldest first, with
 * attempts that recorded no observation already dropped by the caller — an
 * absent observation is not evidence of sameness.
 */
export function observabilityOf(digests: readonly string[], opts: ObservabilityOpts): Observability {
  const window = opts.window ?? 3;
  const minDetect = opts.minDetect ?? 0.05;
  const floor = opts.floor;
  const detection = detectionProbability(floor, window);
  const capacity = channelCapacity(floor);
  const base = { window, floor, detection, capacity };

  if (digests.length < window) {
    return { ...base, verdict: "insufficient", observable: false, sinceIndex: null };
  }

  const tail = digests.slice(-window);
  const unchanged = tail.every((d) => d === tail[0]);

  // Checked after the unchanged test on purpose: a run of identical fingerprints
  // is proof of sameness whatever δ is, because noise only ever manufactures
  // difference. Only the *absence* of a repeat is what a noisy instrument
  // cannot be trusted about.
  if (unchanged) {
    let sinceIndex = digests.length - window;
    while (sinceIndex > 0 && digests[sinceIndex - 1] === tail[0]) sinceIndex--;
    return { ...base, verdict: "drift", observable: true, sinceIndex };
  }

  if (!(detection >= minDetect)) {
    return { ...base, verdict: "unreadable", observable: false, sinceIndex: null };
  }

  return { ...base, verdict: "progressing", observable: true, sinceIndex: null };
}

/**
 * The second axis. Controllability is always relative to a named input set;
 * upstream offers exactly two, `abort` and `steer`
 * (`ai-base/src/runs/run-signal-store.ts:3`), and a flow engine may add more.
 * A claim about controllability that does not name its inputs is describing a
 * system that does not exist.
 */
export interface ControlSurface {
  inputs: readonly string[];
}

export type Quadrant =
  /** Observable and controllable — it runs unattended. */
  | "autonomous"
  /** Observable, not controllable — visibly stuck, and no available input moves it. Escalate with a specific ask. */
  | "escalate"
  /** Controllable, not observable — steering blind. Fix the instrument, not the step count. */
  | "instrument"
  /** Neither — abandon, and record which half was missing. */
  | "abandon";

export function quadrantOf(o: Observability, control: ControlSurface): Quadrant {
  const controllable = control.inputs.length > 0;
  if (o.observable) return controllable ? "autonomous" : "escalate";
  return controllable ? "instrument" : "abandon";
}
