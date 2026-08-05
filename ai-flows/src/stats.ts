/**
 * Estimators for comparing a system against another system.
 *
 * The quantity that decides whether a small model behind a harness can replace a
 * frontier model is **not** the harness lift. A competitor running a frontier
 * model also runs a harness, so the comparison is `small+harness` against
 * `frontier+harness`, and the small model only closes the gap if the harness
 * lifts it *more*. That difference of differences is the interaction term.
 *
 * Three things about it are not obvious and are wired into the API here.
 *
 * **It is not a single number.** A pre-registered controlled comparison across
 * three scaffolds and five models on GAIA (arXiv:2606.08529) rejected in
 * direction the prediction that stronger models are less scaffold-sensitive: the
 * most capable model gained *most* from structured scaffolds at the harder
 * level, while tier-scaling held only at the easy level. The sign flips with
 * difficulty. `interactionByStratum` exists because reporting one pooled number
 * hides that flip, and the flip is the product boundary.
 *
 * **The scale matters at the edges.** Success rates are bounded, so a
 * difference-in-differences on raw probability with one arm near 0 or 1 measures
 * how much room was left rather than how much correction was applied. Harness
 * components are error-correction stages and compose multiplicatively on
 * per-step error, so they add in log-odds. `Scale.LogOdds` is the default for
 * decisions; `Scale.Probability` is kept because a reader understands 0.65 and
 * not +1.8 logits. Both are always reported. In the mid-range they agree — the
 * GAIA result above was found on the raw scale despite ceiling effects working
 * against it — so this is a correctness matter at the edges, not everywhere.
 *
 * **Per-step beats per-trajectory.** A trajectory of `h` hops is `h`
 * observations, not one. Taking the trajectory as the unit throws away that
 * structure and needs roughly `h`× more items for the same resolution. Agent
 * success on longer tasks is well modelled by a constant per-step failure rate
 * (arXiv:2505.05115), so `r^h` is the aggregation rule — and `calibrateCompounding`
 * exists to check that assumption on real data rather than inherit it.
 *
 * All comparisons are paired: every condition is scored on the same items, so
 * the bootstrap resamples the item index and carries each item's scores together.
 */

/** Deterministic PRNG. A bootstrap that cannot be replayed cannot be reviewed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CI {
  point: number;
  lo: number;
  hi: number;
}

export function clearsZero(ci: CI): boolean {
  return ci.lo > 0 || ci.hi < 0;
}

export function formatCI(ci: CI): string {
  const s = (x: number) => (x >= 0 ? `+${x.toFixed(3)}` : x.toFixed(3));
  return `${s(ci.point)} [${s(ci.lo)}, ${s(ci.hi)}]`;
}

export const Scale = {
  Probability: "probability",
  LogOdds: "logOdds",
} as const;
export type Scale = (typeof Scale)[keyof typeof Scale];

/**
 * Per-step evidence for one item under one condition.
 *
 * `steps` and `successes` are counts, not a rate, because the correction below
 * needs to know how much evidence produced the rate. One item that succeeded
 * 1/1 and one that succeeded 40/40 are not the same observation.
 */
export interface StepCounts {
  steps: number;
  successes: number;
}

/**
 * Haldane–Anscombe: add ½ to each cell before taking log-odds.
 *
 * Without it, a condition that never succeeded and a condition that never failed
 * both produce infinities, and the estimator returns nothing exactly where the
 * weakest and strongest arms live — which is where the comparison is being made.
 * The correction is conservative: it shrinks extreme rates toward the middle, so
 * it understates rather than manufactures an effect.
 */
export function logOdds({ steps, successes }: StepCounts): number {
  if (steps <= 0) return Number.NaN;
  const p = (successes + 0.5) / (steps + 1);
  return Math.log(p / (1 - p));
}

/** Plain rate, uncorrected. Reported alongside; never the decision variable. */
export function rate({ steps, successes }: StepCounts): number {
  return steps <= 0 ? Number.NaN : successes / steps;
}

function score(c: StepCounts, scale: Scale): number {
  return scale === Scale.LogOdds ? logOdds(c) : rate(c);
}

export interface BootstrapOpts {
  iters?: number;
  alpha?: number;
  seed?: number;
}

function bootstrapCI(values: readonly number[], opts: BootstrapOpts = {}): CI {
  const { iters = 10_000, alpha = 0.05, seed = 0 } = opts;
  const n = values.length;
  if (n === 0) return { point: Number.NaN, lo: Number.NaN, hi: Number.NaN };
  const point = values.reduce((s, v) => s + v, 0) / n;
  const rng = mulberry32(seed);
  const boots = new Float64Array(iters);
  for (let b = 0; b < iters; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += values[Math.floor(rng() * n)]!;
    boots[b] = s / n;
  }
  boots.sort();
  return {
    point,
    lo: boots[Math.floor((alpha / 2) * iters)]!,
    hi: boots[Math.min(iters - 1, Math.floor((1 - alpha / 2) * iters))]!,
  };
}

/** Paired mean difference, items aligned by index. */
export function pairedMeanDiff(a: readonly number[], b: readonly number[], opts: BootstrapOpts = {}): CI {
  if (a.length !== b.length) throw new Error("paired comparison needs aligned arrays");
  return bootstrapCI(
    a.map((x, i) => x - b[i]!),
    opts,
  );
}

/** One item, scored under all four cells of the 2×2. Aligned by construction. */
export interface Quad {
  id: string;
  /** Free-form strata: difficulty, structure, verifiability, domain. */
  strata?: Readonly<Record<string, string>>;
  smallBare: StepCounts;
  smallHarness: StepCounts;
  frontBare: StepCounts;
  frontHarness: StepCounts;
}

/**
 * Below this many step observations per item, the Haldane–Anscombe correction
 * biases the interaction term **upward** when the four arms sit at different
 * extremes — which is exactly the configuration a small-vs-frontier comparison
 * lands in. Measured on a construction whose true interaction is zero **[ran]**:
 *
 * ```
 *   steps/item     4      8     16     32     64    128
 *   measured   +0.597 +0.394 +0.211 +0.067 -0.002 -0.001
 *   decisive?    yes    yes    yes     no     no     no
 * ```
 *
 * The first three rows are false positives, and they fail toward "ship the small
 * fleet" — the most expensive direction to be wrong in. The shrinkage is
 * asymmetric because an arm near the floor and an arm near the ceiling are
 * pulled toward the middle by different amounts, so the two lifts are compressed
 * unequally and the difference of differences inherits the gap.
 *
 * Thirty-two is where the null came back. Sixty-four recovers the sign almost
 * exactly (−1.248 against a true −1.221; +1.199 against +1.221).
 */
export const MIN_STEPS_PER_ITEM = 32;

export interface Interaction {
  scale: Scale;
  n: number;
  liftSmall: CI;
  liftFrontier: CI;
  interaction: CI;
  /** True when the CI excludes zero — necessary, never sufficient, for a decision. */
  decisive: boolean;
  /** Fewest step observations any single cell contributed. */
  minStepsPerItem: number;
  /**
   * Set when `minStepsPerItem < MIN_STEPS_PER_ITEM`. A decisive positive result
   * under this flag is not evidence: the estimator produces one from thin
   * evidence alone. It travels with the number so a verdict is never read
   * without the thing that invalidates it.
   */
  underpowered: boolean;
}

/**
 * Difference-in-differences with a paired bootstrap over items.
 *
 * A positive interaction clear of zero means the harness helps the small model
 * more — the substitution regime, and the only one in which a small fleet closes
 * the gap. Negative means complementarity: the frontier competitor benefits at
 * least as much and the gap never closes, however large the absolute lift looks.
 */
export function interactionTerm(
  items: readonly Quad[],
  scale: Scale = Scale.LogOdds,
  opts: BootstrapOpts = {},
): Interaction {
  const liftS: number[] = [];
  const liftF: number[] = [];
  const inter: number[] = [];
  let minSteps = Number.POSITIVE_INFINITY;
  for (const it of items) {
    const ls = score(it.smallHarness, scale) - score(it.smallBare, scale);
    const lf = score(it.frontHarness, scale) - score(it.frontBare, scale);
    if (!Number.isFinite(ls) || !Number.isFinite(lf)) continue;
    minSteps = Math.min(minSteps, it.smallBare.steps, it.smallHarness.steps, it.frontBare.steps, it.frontHarness.steps);
    liftS.push(ls);
    liftF.push(lf);
    inter.push(ls - lf);
  }
  const ci = bootstrapCI(inter, opts);
  const minStepsPerItem = Number.isFinite(minSteps) ? minSteps : 0;
  return {
    scale,
    n: inter.length,
    liftSmall: bootstrapCI(liftS, opts),
    liftFrontier: bootstrapCI(liftF, opts),
    interaction: ci,
    decisive: clearsZero(ci),
    minStepsPerItem,
    underpowered: minStepsPerItem < MIN_STEPS_PER_ITEM,
  };
}

/**
 * The interaction term within each level of one stratum — difficulty, first of
 * all, but the same call answers sequential-versus-decomposable.
 *
 * This is the primary output, not a breakdown of it. A pooled interaction
 * averaged across a sign flip is a number with no referent: it can sit at zero
 * while the effect is strongly positive on easy work and strongly negative on
 * hard work, which is the configuration that actually decides where a fleet can
 * be deployed.
 */
export function interactionByStratum(
  items: readonly Quad[],
  key: string,
  scale: Scale = Scale.LogOdds,
  opts: BootstrapOpts = {},
): Map<string, Interaction> {
  const groups = new Map<string, Quad[]>();
  for (const it of items) {
    const level = it.strata?.[key];
    if (level === undefined) continue;
    (groups.get(level) ?? groups.set(level, []).get(level)!).push(it);
  }
  const out = new Map<string, Interaction>();
  for (const [level, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    out.set(level, interactionTerm(group, scale, opts));
  }
  return out;
}

/**
 * Where the interaction crosses zero along an ordered stratum.
 *
 * Returns the first level, in the given order, at which the term stops being
 * decisively positive. That level is the product boundary: below it a small
 * fleet is defensible, at and above it the frontier pulls further ahead the
 * better the scaffold gets. `null` means it never crossed within the levels
 * measured — which is a finding, not a success.
 */
export function crossingPoint(byLevel: ReadonlyMap<string, Interaction>, order: readonly string[]): string | null {
  for (const level of order) {
    const it = byLevel.get(level);
    if (!it) continue;
    if (!(it.decisive && it.interaction.point > 0)) return level;
  }
  return null;
}

/**
 * Undetected error rate: of the attempts that failed, the share that failed
 * silently.
 *
 * Tracked as a co-primary because it is the one a buyer is actually exposed to.
 * An agent that is right 92% of the time and wrong-without-saying-so 8% is not a
 * product, it is a liability — and unlike success rate this quantity has no
 * ceiling artifact, so it stays legible where the interaction term does not.
 */
export function undetectedErrorRate(outcomes: readonly ("pass" | "detected" | "undetected")[]): number {
  if (outcomes.length === 0) return Number.NaN;
  return outcomes.filter((o) => o === "undetected").length / outcomes.length;
}

/** Paired binary comparison on the same items. Exact two-sided binomial. */
export function mcnemar(
  a: readonly boolean[],
  b: readonly boolean[],
): { aOnly: number; bOnly: number; discordant: number; p: number } {
  if (a.length !== b.length) throw new Error("paired comparison needs aligned arrays");
  let aOnly = 0;
  let bOnly = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && !b[i]) aOnly++;
    else if (!a[i] && b[i]) bOnly++;
  }
  const n = aOnly + bOnly;
  if (n === 0) return { aOnly, bOnly, discordant: 0, p: 1 };
  let cum = 0;
  const k = Math.min(aOnly, bOnly);
  for (let i = 0; i <= k; i++) cum += binom(n, i);
  return { aOnly, bOnly, discordant: n, p: Math.min(1, (2 * cum) / 2 ** n) };
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Does per-step reliability actually predict whole-trajectory success?
 *
 * The whole per-step programme rests on `s = r^h` — errors independent across
 * steps, one constant hazard. That model fits agent data on at least one suite
 * (arXiv:2505.05115) and its author flags generalisation as unknown, so it is
 * assumed nowhere and checked here.
 *
 * Returns the observed trajectory success rate against the rate `r^h` predicts,
 * per hop count, plus the mean absolute error between them. A large error means
 * failures are correlated across steps, `r^h` is the wrong aggregation, and
 * per-step measurement does not compose — in which case the trajectory has to be
 * the unit after all, at the sample sizes that costs.
 */
export function calibrateCompounding(
  trajectories: readonly { hops: number; succeeded: boolean; steps: StepCounts }[],
): { byHops: { hops: number; observed: number; predicted: number; n: number }[]; meanAbsError: number } {
  const totals = new Map<number, { obs: number; n: number; r: number }>();
  for (const t of trajectories) {
    const cur = totals.get(t.hops) ?? { obs: 0, n: 0, r: 0 };
    cur.obs += t.succeeded ? 1 : 0;
    cur.r += rate(t.steps);
    cur.n += 1;
    totals.set(t.hops, cur);
  }
  const byHops = [...totals]
    .sort(([a], [b]) => a - b)
    .map(([hops, v]) => ({
      hops,
      observed: v.obs / v.n,
      predicted: Math.pow(v.r / v.n, hops),
      n: v.n,
    }));
  const meanAbsError =
    byHops.length === 0
      ? Number.NaN
      : byHops.reduce((s, b) => s + Math.abs(b.observed - b.predicted), 0) / byHops.length;
  return { byHops, meanAbsError };
}
