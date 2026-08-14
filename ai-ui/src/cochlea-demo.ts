/**
 * A research project on the desk — the fourth scope in the demo.
 *
 * ## Why a cochlea, and what it argues that the other scopes do not
 *
 * The signal lab ([dsp-demo.ts](dsp-demo.ts)) makes the claim that **green is
 * not correct**: a step runs, settles, reports, and carried nothing. That is a
 * claim about a step.
 *
 * This scope makes the claim one step up, about a *result*. Two flows, the same
 * eight agents, the same six steps, **both entirely green**, both producing
 * eigenvalues that are ordered, orthogonal, and have the right number of zeros.
 * One of them is wrong in every number it reports. Nothing in the trace
 * separates them, and nothing in the prose does either — the two reports differ
 * by one word.
 *
 * What separates them is a **gate**: an external oracle, declared before the run,
 * that the flow is measured against. The correct chain freezes. The other is
 * held at `blocked`, and the desk can say which gate stopped it and what the
 * number was.
 *
 * That is the mechanism `ai-flows` was missing, in its own words —
 * [`types.ts`](../../ai-flows/src/types.ts) says a metric is *"defined only
 * where a shape declares a metric, and today no shape does"*. A cochlea
 * declares one, because the eigenvalues of a fixed-free string have a closed
 * form and being close to it is not a matter of opinion.
 *
 * ## Everything here is computed, and computed independently
 *
 * The numbers are produced at build time by the eigensolver below: a symmetric
 * tridiagonal Sturm bisection, about eighty lines, no dependencies. It is a
 * **third implementation** of the same problem, next to `truth/` (sympy and
 * mpmath, closed form) and `src/coclea/` (numpy and scipy, LAPACK).
 *
 * That is not duplication for its own sake. The cochlea specification §6.2
 * requires that the verifier not share code with the constructor, and a
 * different language is the strongest form of that independence available for
 * the price. `test/cochlea-demo.test.ts` asserts these numbers against the ones
 * the Python suite recorded, so the demo cannot drift from the project and the
 * project cannot drift from the demo: if they disagree, one of them is wrong and
 * the build says so.
 *
 * ## The defect, and why it is this one
 *
 * The membrane is discretised in flux form, and the node at the apex — the
 * helicotrema — owns **half a cell**. The broken chain gives it a whole one.
 * That is an `O(dx)` error in the total mass and therefore in every eigenvalue,
 * and it is invisible to almost everything: the matrix stays symmetric, the mass
 * stays positive, the spectrum stays ordered, every mode keeps exactly the right
 * number of zeros. The naive sanity check on a mass matrix — does it integrate
 * to the continuum mass — actually **prefers the broken one**, which sums to
 * exactly 1.0 while the correct one sums to `1 - dx/2`.
 *
 * Two gates do see it, and they say different things. GATE-A01 says **how far
 * off**: 2.592e-4 against a tolerance of 1.0e-4. GATE-A12 says **where**: order
 * 0.9996 instead of 2, and first order is a boundary error — the free end, which
 * is the helicotrema. The gate that trips first is not the gate that localises,
 * and a suite that only had the first one would have reported a wrong number
 * with no idea which line produced it.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** Grids the convergence study runs on. Spec §5.2. */
const GRIDS = [250, 500, 1000, 2000, 4000] as const;

type Scheme = "flux" | "lumped-full-cell";

/**
 * The uniform fixed-free membrane, assembled in flux form.
 *
 * Unknowns are `u_1 .. u_N`; the Dirichlet node at the base is eliminated rather
 * than constrained. Returns the two bands of the symmetric stiffness and the
 * diagonal mass, integrated over cells — the same shape `assembly.py` produces.
 */
function assemble(N: number, scheme: Scheme): { sd: Float64Array; se: Float64Array; md: Float64Array } {
  const dx = 1 / N;
  const sd = new Float64Array(N);
  const se = new Float64Array(N - 1);
  const md = new Float64Array(N);

  for (let i = 0; i < N - 1; i += 1) {
    sd[i] = 2 / dx;
    se[i] = -1 / dx;
    md[i] = dx;
  }
  // The apex. Zero flux through its outer face, so it sees only its inner one.
  sd[N - 1] = 1 / dx;
  // ...and it owns half a cell. Giving it a whole one is the defect.
  md[N - 1] = scheme === "flux" ? dx / 2 : dx;

  return { sd, se, md };
}

/**
 * How many eigenvalues of the symmetrised operator lie below `sigma`.
 *
 * The Sturm sequence: run the `LDL^T` factorisation of `T - sigma I` and count
 * negative pivots. Exact — it is a count, not an approximation — which is what
 * makes bisection on it reliable enough to be a verifier rather than a second
 * opinion.
 */
function countBelow(d: Float64Array, e: Float64Array, sigma: number, pivmin: number): number {
  let count = 0;
  let pivot = d[0]! - sigma;
  // Guard **before** the sign test, on every pivot including the first.
  //
  // This ordering is the whole correctness of the routine and getting it wrong
  // is silent. The first version guarded at the top of the next iteration —
  // after the current pivot had already been counted — so a zero pivot was
  // never counted and the one after it went to +Infinity. On the flux membrane
  // nothing changed, because its diagonal is not constant and bisection never
  // lands exactly on a pivot. On the defect membrane the diagonal *is*
  // constant, every midpoint hit a zero pivot, `countBelow` returned 0 for
  // every shift, and the search converged on the top of the spectrum: it
  // reported the fundamental as 353.553 instead of 1.571, identically for
  // modes 1, 2 and 3.
  //
  // A zero pivot means the shift is an eigenvalue of the leading submatrix.
  // Replacing it with a small **negative** value counts it and keeps the
  // recursion finite, which is Wilkinson's guard and what LAPACK's `dlaebz`
  // does with `pivmin`.
  if (Math.abs(pivot) < pivmin) pivot = -pivmin;
  if (pivot < 0) count += 1;
  for (let i = 1; i < d.length; i += 1) {
    pivot = d[i]! - sigma - (e[i - 1]! * e[i - 1]!) / pivot;
    if (Math.abs(pivot) < pivmin) pivot = -pivmin;
    if (pivot < 0) count += 1;
  }
  return count;
}

/** The `k`-th eigenvalue (1-based) of the symmetric tridiagonal, by bisection. */
function eigenvalue(d: Float64Array, e: Float64Array, k: number): number {
  // Gershgorin bounds. Generous on purpose: a bracket that excludes the answer
  // converges confidently to the wrong number.
  let lo = Infinity;
  let hi = -Infinity;
  let scale = 0;
  for (let i = 0; i < d.length; i += 1) {
    const r = Math.abs(i > 0 ? e[i - 1]! : 0) + Math.abs(i < d.length - 1 ? e[i]! : 0);
    lo = Math.min(lo, d[i]! - r);
    hi = Math.max(hi, d[i]! + r);
    scale = Math.max(scale, Math.abs(d[i]!) + r);
  }
  // Scaled to the matrix rather than a fixed constant: `pivmin` has to be small
  // enough not to perturb the count and large enough that `e^2 / pivmin` stays
  // finite. At N = 4000 the off-diagonal is ~1.6e7, so a fixed 1e-300 would
  // overflow that quotient to Infinity and the recursion would stop meaning
  // anything.
  const pivmin = scale * Number.EPSILON;

  for (let iter = 0; iter < 200; iter += 1) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (countBelow(d, e, mid, pivmin) >= k) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Angular frequencies of the first `nModes` modes. */
function omegas(N: number, scheme: Scheme, nModes: number): number[] {
  const { sd, se, md } = assemble(N, scheme);
  // Symmetrise: A = M^{-1/2} S M^{-1/2}, still tridiagonal because M is diagonal.
  const inv = new Float64Array(N);
  for (let i = 0; i < N; i += 1) inv[i] = 1 / Math.sqrt(md[i]!);
  const d = new Float64Array(N);
  for (let i = 0; i < N; i += 1) d[i] = sd[i]! * inv[i]! * inv[i]!;
  const e = new Float64Array(N - 1);
  for (let i = 0; i < N - 1; i += 1) e[i] = se[i]! * inv[i]! * inv[i + 1]!;

  const out: number[] = [];
  for (let k = 1; k <= nModes; k += 1) out.push(Math.sqrt(Math.max(eigenvalue(d, e, k), 0)));
  return out;
}

/** The closed form. `w_n = (2n-1) pi / 2` for the unit membrane. Spec (2.4). */
export function analyticOmega(n: number): number {
  return ((2 * n - 1) * Math.PI) / 2;
}

/**
 * Slope of `log(error)` against `log(N)` — the convergence order. GATE-A12.
 *
 * Points within `FLOOR_MARGIN` of the eigensolver's own precision floor are
 * dropped, and which ones is returned rather than swallowed.
 *
 * **This is not a refinement, it is the difference between two answers.** A
 * second-order scheme's error falls like `N^-2` while the matrix norm — and so
 * the floor — rises like `N^2`, which means every convergence study eventually
 * measures the solver instead of the discretisation. On the fundamental of this
 * membrane, including `N = 4000` moves the fitted order from 2.0015 to 1.9841
 * here and from 2.0015 to 2.0306 in the Python suite. Both are inside GATE-A12's
 * band, both look clean, and **they disagree with each other** — which is how
 * the contamination was noticed at all. Two independent implementations agreeing
 * on a wrong number would have been indistinguishable from correctness.
 */
const FLOOR_MARGIN = 10;

function observedOrder(
  errors: readonly number[],
  floors?: readonly number[],
): { order: number; dropped: number[] } {
  const keep = GRIDS.map((_, i) => (floors ? errors[i]! > FLOOR_MARGIN * floors[i]! : true));
  const xs: number[] = [];
  const ys: number[] = [];
  const dropped: number[] = [];
  GRIDS.forEach((n, i) => {
    if (keep[i]) {
      xs.push(Math.log(n));
      ys.push(Math.log(errors[i]!));
    } else dropped.push(n);
  });
  if (xs.length < 3) throw new Error("fewer than three grids above the precision floor");

  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  return { order: -(num / den), dropped };
}

/**
 * The smallest relative error in `w` this eigensolve can resolve: about
 * `eps * ||T|| / lambda`, halved to convert from `lambda` to `w`. Matches
 * `_precision_floor` in `gates/test_A12_convergence.py`, derived the same way
 * from the same argument and sharing no code with it.
 */
function precisionFloor(N: number, scheme: Scheme, truthOmega: number): number {
  const { sd, md } = assemble(N, scheme);
  let norm = 0;
  for (let i = 0; i < N; i += 1) norm = Math.max(norm, Math.abs(sd[i]! / md[i]!));
  return (Number.EPSILON * norm) / truthOmega ** 2 / 2;
}

export interface ChainNumbers {
  scheme: Scheme;
  /** First 10 frequencies at N = 2000, and their relative error. */
  omega: number[];
  relativeError: number[];
  maxRelativeError: number;
  /** GATE-A12: the error curve across grids, and its slope. */
  convergence: number[];
  precisionFloor: number[];
  droppedGrids: number[];
  order: number;
  /** GATE-A03: interior zero counts. Right for both schemes — that is the point. */
  interiorZeros: number[];
  /** GATE-A11: symmetry defect. Zero for both schemes — also the point. */
  symmetryDefect: number;
  /** Total assembled mass. The defect's is *closer* to the continuum value. */
  totalMass: number;
}

const round = (v: number, p = 6) => Math.round(v * 10 ** p) / 10 ** p;

/** Run one chain, by running it. Every number below is produced here. */
export function chainNumbers(scheme: Scheme): ChainNumbers {
  const nModes = 10;
  const w = omegas(2000, scheme, nModes);
  const truth = Array.from({ length: nModes }, (_, i) => analyticOmega(i + 1));
  const rel = w.map((v, i) => Math.abs(v - truth[i]!) / truth[i]!);

  const convergence = GRIDS.map((N) => {
    const w1 = omegas(N, scheme, 1)[0]!;
    return Math.abs(w1 - analyticOmega(1)) / analyticOmega(1);
  });
  const floors = GRIDS.map((N) => precisionFloor(N, scheme, analyticOmega(1)));
  const { order, dropped } = observedOrder(convergence, floors);

  const { md } = assemble(2000, scheme);
  let totalMass = 0;
  for (const v of md) totalMass += v;

  return {
    scheme,
    omega: w.map((v) => round(v, 9)),
    relativeError: rel,
    maxRelativeError: Math.max(...rel),
    convergence,
    precisionFloor: floors,
    droppedGrids: dropped,
    order,
    // Counted from the closed form rather than from a second eigenvector solve:
    // the oscillation theorem is what is being checked, and both schemes satisfy
    // it, so recomputing it here would add a number and no information.
    interiorZeros: Array.from({ length: nModes }, (_, i) => i),
    // Stored as two bands and mirrored on read, so it is symmetric by
    // construction — in both schemes. Recorded because "this gate cannot fail
    // for this defect" is the fact worth carrying.
    symmetryDefect: 0,
    totalMass,
  };
}

const FLUX = chainNumbers("flux");
const DEFECT = chainNumbers("lumped-full-cell");

const sci = (v: number) => v.toExponential(3);

/**
 * Correct digits, `-log10(relative error)`, one per grid.
 *
 * The desk draws a step's series as a bar chart and formats it to two decimals,
 * which renders a curve of relative errors between 1.6e-6 and 6.8e-9 as five
 * bars of height "0.00" — true, and a picture of nothing. Correct digits is the
 * same information on a scale a reader can see, and it makes the gate's actual
 * claim visible as a *slope*: doubling the grid buys 0.60 digits at second order
 * and 0.30 at first, so the two chains are two visibly different staircases
 * rather than two flat lines.
 */
function digitsOfAccuracy(errors: readonly number[]): number[] {
  return errors.map((v) => round(-Math.log10(v), 3));
}

/** The eight agents of the cochlea lab. Spec §6.2. */
export function cochleaAgents() {
  return [
    {
      name: "DERIVADOR",
      description: "Derives the closed forms in sympy and mpmath. Produces the truth values.",
      tools: ["read", "write", "execute"],
      child: false,
      missing: false,
    },
    {
      name: "CONSTRUCTOR",
      description: "Implements the solver against the specification. Never writes a truth value.",
      tools: ["read", "write", "execute"],
      child: true,
      missing: false,
    },
    {
      name: "VERIFICADOR-MATH",
      description: "Runs the analytic gates. Shares no code with CONSTRUCTOR — that is the rule.",
      tools: ["read", "execute"],
      child: true,
      missing: false,
    },
    {
      name: "VERIFICADOR-STAT",
      description: "Validates the measurement pipeline itself before it is pointed at anything.",
      tools: ["read", "execute"],
      child: true,
      missing: false,
    },
    {
      name: "EXPLORADOR",
      description: "Sweeps the parameter space. Consumes only frozen artefacts.",
      tools: ["read", "execute"],
      child: true,
      missing: false,
    },
    {
      name: "LITERATURA",
      description: "Confronts each output with the published empirical ranges.",
      tools: ["read"],
      child: true,
      missing: false,
    },
    {
      name: "SINTETIZADOR",
      description: "Writes the report. Every figure traces to a run id or it does not ship.",
      tools: ["read", "write"],
      child: true,
      missing: false,
    },
    {
      name: "AUDITOR",
      description: "Re-derives the ledger's hash chain from the files, in ninety lines of stdlib.",
      tools: ["read", "execute"],
      child: true,
      missing: false,
    },
    {
      name: "HOPF-LAYER",
      description: "Declared for phase 2. No file behind it.",
      tools: [],
      child: true,
      missing: true,
    },
  ];
}

interface Step {
  index: number;
  state: string;
  agent: string;
  intent: string;
  result: string | null;
  attempts: Array<Record<string, unknown>>;
  series?: number[];
  contribution?: { carried: number; inputTokens: number; note?: string };
}

/**
 * One chain of six steps, built from the numbers computed above.
 *
 * The two chains differ in one word — "half" against "whole" — in the report of
 * step 2. Every other sentence, and every other gate verdict, is identical until
 * step 6.
 */
function chain(
  id: string,
  title: string,
  n: ChainNumbers,
  updatedAt: number,
): Record<string, unknown> {
  const broken = n.scheme === "lumped-full-cell";
  const a12Green = n.order >= 1.9 && n.order <= 2.1;
  const a01Green = n.maxRelativeError < 1e-4;

  const stages: Array<{ agent: string; said: string; gate: string; ok: boolean; series?: number[] }> = [
    {
      agent: "DERIVADOR",
      said:
        "Solved the fixed-free string in sympy: phi(0)=0 kills the cosine, phi'(L)=0 forces " +
        "cos(wL/c)=0. Truth values w_n = (2n-1)pi/2, and the exponential profile's roots of " +
        "tan(bL) = -2b/a in mpmath at 50 digits.",
      gate: "truth",
      ok: true,
    },
    {
      agent: "CONSTRUCTOR",
      said: broken
        ? "Assembled 2000 cells in flux form. The apex node carries a whole cell of mass; " +
          "total assembled mass 1.000000, matching the continuum value exactly."
        : "Assembled 2000 cells in flux form. The apex node carries half a cell of mass; " +
          `total assembled mass ${n.totalMass.toFixed(6)}, short of the continuum value by the ` +
          "base half cell that carries no unknown.",
      gate: "build",
      ok: true,
    },
    {
      agent: "VERIFICADOR-MATH",
      said:
        `GATE-A11 green: ||S - S^T||_inf = ${n.symmetryDefect.toExponential(1)}. ` +
        "GATE-A03 green: modes 1-10 have 0..9 interior zeros, exactly as the oscillation " +
        "theorem requires.",
      gate: "A11+A03",
      ok: true,
    },
    {
      agent: "VERIFICADOR-MATH",
      said:
        `GATE-A01: worst of the first 10 eigenvalues off the closed form by ${sci(n.maxRelativeError)} ` +
        `at N=2000, tolerance 1.0e-4 — ${a01Green ? "green" : "RED"}.`,
      gate: "A01",
      ok: a01Green,
      series: n.omega,
    },
    {
      agent: "EXPLORADOR",
      said:
        (a01Green
          ? "Swept N = 250, 500, 1000, 2000, 4000 on the fundamental. Relative errors "
          : "GATE-A01 red, so swept N = 250, 500, 1000, 2000, 4000 to find out where. Relative errors ") +
        n.convergence.map((v) => sci(v)).join(", ") +
        (n.droppedGrids.length
          ? `. N = ${n.droppedGrids.join(", ")} dropped: within 10x of the eigensolver's own precision floor.`
          : "."),
      gate: "sweep",
      ok: true,
      series: digitsOfAccuracy(n.convergence),
    },
    {
      agent: "AUDITOR",
      said: a12Green
        ? `GATE-A12 green: observed convergence order ${n.order.toFixed(4)}, inside [1.9, 2.1]. ` +
          "Richardson extrapolation agrees with the analytic limit. Freeze authorised."
        : `GATE-A12 RED: observed convergence order ${n.order.toFixed(4)}, outside [1.9, 2.1]. ` +
          "A01 said how far off; this says where. First order is a boundary error, and the " +
          "free end is the apex — the helicotrema, which is the physics. Freeze refused.",
      gate: "A12",
      ok: a12Green,
      series: digitsOfAccuracy(n.convergence),
    },
  ];

  const steps: Step[] = stages.map((st, index) => ({
    index,
    state: st.ok ? "done" : "failed",
    agent: st.agent,
    intent: `Call your \`delegate\` tool with agent="${st.agent}". The task: validate the passive membrane against its closed form`,
    result: st.said,
    attempts: [
      {
        n: 1,
        state: st.ok ? "done" : "failed",
        runId: `run-${id}-${index}`,
        error: st.ok ? null : `gate ${st.gate} did not pass`,
        // The digest fingerprints the numbers, so the observability instrument
        // reads movement in the measurement rather than in the prose.
        digest: `g${Math.abs(Math.round((st.series?.[0] ?? index + 1) * 1e9)) % 100000}`,
        source: "gate.report",
      },
    ],
    ...(st.series ? { series: st.series.map((v) => round(v, 9)) } : {}),
    contribution: {
      // **Always 1, and that is a correction.**
      //
      // The first version set `carried: 0` on the step whose gates cannot see
      // the defect, meaning "this check does not discriminate". The desk reads
      // `carried` as *overlap with the step's input* — `contribution.ts` — so it
      // rendered "1 step(s) used nothing they were given" and Cubi said
      // "VERIFICADOR-MATH ran, settled and reported, and carried nothing
      // forward. It is green and it is empty." Both statements were false about
      // a step that did its work correctly.
      //
      // Overloading a field the product already gives a meaning to does not add
      // a meaning, it replaces one — and the instrument then reports the new
      // meaning in the old one's words. Whether a gate discriminates belongs in
      // the note, where it is prose and cannot be mistaken for a measurement.
      carried: 1,
      inputTokens: 2000,
      note:
        st.gate === "A11+A03"
          ? "green on both chains — neither symmetry nor the zero count can see a boundary mass error"
          : st.ok
            ? `gate ${st.gate} discriminates, and passed`
            : `gate ${st.gate} discriminates, and FAILED — this is what stops the freeze`,
    },
  }));

  const done = steps.filter((s) => s.state === "done").length;
  return {
    id,
    title,
    goal: "validate the passive membrane against its closed form, and freeze it only if it holds",
    state: a12Green ? "done" : "blocked",
    updatedAt,
    done,
    total: steps.length,
    steps,
  };
}

/**
 * The two flows.
 *
 * The correct chain is frozen. The other is `blocked`, and every step before its
 * last is green — which is the whole argument, because that is what a research
 * result looks like on the way to being wrong.
 */
export function cochleaFlows(at: number) {
  return [
    chain(
      "flow-membrane-flux",
      "Passive membrane — flux assembly",
      FLUX,
      at - 31 * 3600_000,
    ),
    chain(
      "flow-membrane-apex",
      "Passive membrane — apex boundary",
      DEFECT,
      at - 55 * 60_000,
    ),
  ];
}

/** Exported for the drift test, which compares these against the Python suite. */
export const COCHLEA_NUMBERS = { flux: FLUX, defect: DEFECT };
