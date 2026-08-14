/**
 * A step that was checked against an oracle, and the freeze it is allowed to
 * authorise.
 *
 * ## The hole this fills, in the repository's own words
 *
 * [`types.ts`](types.ts) defines an attempt's `Observation` with two fields and
 * a note on the second:
 *
 * > `value` — *"Present only where the shape declares a metric. `null` for
 * > `open`."* … *"defined only where a shape declares a metric, and today no
 * > shape does."*
 *
 * and [`engine.ts`](engine.ts) refuses to invent one, correctly: *"`value` is
 * null because `open` declares no metric; inventing a score here is how a shape
 * acquires a number nobody defined."* `FLOW_SHAPES` has one entry.
 *
 * The reason no shape declared a metric is not that nobody wrote the code. It
 * is that **every workload this repository had ran on prose**, where "did this
 * step succeed" has no answer outside somebody's judgement — and
 * [`contribution.ts`](contribution.ts) is the record of what happens when a
 * number is derived anyway without a notion of a right answer: built and
 * falsified the same day.
 *
 * `projects/coclea-sr/` is the first workload with an **external oracle**. Its
 * GATE-A1 is not an opinion about whether the eigenvalues look right; it is
 * `|w_numeric − w_analytic| / w_analytic < 1e-4`, where the analytic value comes
 * from a module forbidden to import the code under test. That gives a step a
 * metric that was declared before the step ran, by somebody other than the step.
 *
 * ## What this module is, and deliberately is not
 *
 * It is **pure**: parse, summarise, decide. No filesystem, no HTTP, no clock.
 * The gate reports arrive as objects — read from the workspace by whoever is
 * holding one — because the seam that matters is the *format*, not the
 * transport. A Python process writes JSON and a TypeScript kernel reads it;
 * that is the whole of the language question, and it is the answer an operating
 * system is supposed to give. The kernel does not need to be written in the
 * language of the work it governs.
 *
 * It does **not** run anything. Nothing here executes pytest, and that is the
 * same rule [`evaluation.ts`](evaluation.ts) states for itself: a loop that both
 * produces and scores its own result is a loop that will report improvement.
 *
 * ## The distinction the whole thing turns on
 *
 * **"Did not run" is not "passed."** A freeze gate that treats a missing report
 * as an absent objection is a freeze gate that opens widest exactly when the
 * suite is broken — the run that failed to start looks identical to the run
 * where nothing objected. So `freezeVerdict` returns `blockers` and `unknown`
 * as separate lists and refuses on either.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Observation } from "./types.ts";

/**
 * One check, as the producing side writes it.
 *
 * Everything past the four named fields is the measurement, and it is
 * deliberately unconstrained: a convergence gate reports an exponent, an
 * eigenvalue gate reports a relative error, and forcing them into a common
 * schema would either lose what each one measured or invent a unit shared by
 * neither.
 */
export interface GateReport {
  /** Stable identifier — `"A01"`, `"A12"`. Several checks may share one. */
  gate: string;
  /** The individual check within the gate. */
  test: string;
  /** Which section of the specification this discharges. */
  spec: string;
  /** The verdict, recorded by the runner rather than inferred from the file. */
  passed: boolean;
  /** Present only on failure. The reason, kept because it is gone otherwise. */
  failure?: string | null;
  [measurement: string]: unknown;
}

export interface GateVerdict {
  gate: string;
  /** Green only if every check under this gate is green. */
  passed: boolean;
  checks: number;
  failed: string[];
  spec: string;
}

export function isGateReport(value: unknown): value is GateReport {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r["gate"] === "string" &&
    typeof r["test"] === "string" &&
    typeof r["passed"] === "boolean"
  );
}

/**
 * Parse a batch of reports, keeping what could not be parsed.
 *
 * The rejects are returned rather than dropped. A silent filter here turns a
 * malformed report — the most likely shape of "the verifier crashed halfway" —
 * into a gate that simply does not appear, and a gate that does not appear is
 * one `freezeVerdict` will refuse on rather than pass. Returning them lets the
 * caller say which, instead of reporting an unexplained absence.
 */
export function parseReports(raw: readonly unknown[]): {
  reports: GateReport[];
  rejected: unknown[];
} {
  const reports: GateReport[] = [];
  const rejected: unknown[] = [];
  for (const item of raw) {
    if (isGateReport(item)) reports.push(item);
    else rejected.push(item);
  }
  return { reports, rejected };
}

/** Collapse per-check reports into one verdict per gate. */
export function summarise(reports: readonly GateReport[]): Map<string, GateVerdict> {
  const out = new Map<string, GateVerdict>();
  for (const r of reports) {
    const prev = out.get(r.gate);
    const failed = [...(prev?.failed ?? []), ...(r.passed ? [] : [r.test])];
    out.set(r.gate, {
      gate: r.gate,
      // A gate is green only if every check under it is. One red check in a
      // parametrised gate is the gate.
      passed: (prev?.passed ?? true) && r.passed,
      checks: (prev?.checks ?? 0) + 1,
      failed,
      spec: prev?.spec ?? r.spec ?? "",
    });
  }
  return out;
}

export interface FreezeVerdict {
  mayFreeze: boolean;
  /** Required gates that ran and failed. */
  blockers: string[];
  /** Required gates with no report at all. Not the same thing, and not merged. */
  unknown: string[];
  /** Everything green, for the record. */
  passed: string[];
}

/**
 * Spec §6.1 of the cochlea project: nothing becomes `frozen` while a required
 * gate is not green.
 *
 * The two refusal reasons stay apart all the way to the caller so a UI can say
 * *"GATE-A12 went red"* rather than *"cannot freeze"*. A specific, fixable
 * failure rendered as an unexplained refusal is how a gate stops being read.
 */
export function freezeVerdict(
  required: readonly string[],
  reports: readonly GateReport[],
): FreezeVerdict {
  const verdicts = summarise(reports);
  const blockers: string[] = [];
  const unknown: string[] = [];
  const passed: string[] = [];

  for (const gate of required) {
    const v = verdicts.get(gate);
    if (!v) unknown.push(gate);
    else if (!v.passed) blockers.push(gate);
    else passed.push(gate);
  }

  return { mayFreeze: blockers.length === 0 && unknown.length === 0, blockers, unknown, passed };
}

/**
 * The observation a gated step produces — the first one in this repository with
 * a `value` that is not `null`.
 *
 * `metric` names which measurement in the report is the number, because the
 * report carries several and only one of them is what the gate is about.
 * Naming it at the call site rather than guessing is the difference between a
 * declared metric and a number nobody defined.
 *
 * `digest` fingerprints the whole report rather than the metric, so two runs
 * that agree on the headline figure and differ underneath are still
 * distinguishable — which is the property `Observation.digest` exists for.
 */
export function observationOf(
  report: GateReport,
  metric: string,
  at: number,
  digest: (s: string) => string,
  /**
   * The report's original bytes, when the caller has them.
   *
   * **Pass this whenever it exists.** See `stableStringify` for why: a digest
   * taken over a re-serialisation is a digest of this runtime's number
   * formatting, and it does not agree with the one the producing side recorded.
   */
  rawSource?: string,
): Observation {
  const raw = report[metric];
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  return {
    digest: digest(rawSource ?? stableStringify(report)),
    // `null` when the named metric is absent or not a finite number. Not
    // coerced to 0 and not to NaN: both are values, and "the gate did not
    // report this quantity" is not a value.
    value,
    source: `gate.${report.gate}.${metric}`,
    at,
  };
}

/**
 * Deterministic JSON: key order removed, so a digest is a fact about content.
 *
 * ## What it is NOT: agreement with the producing side
 *
 * This was written believing it matched `json.dumps(sort_keys=True,
 * separators=(",", ":"))` and therefore that a TypeScript digest of a report
 * would equal the Python one. **It does not, and a test caught it:**
 *
 *     python  {"gate":"A01","max_relative_error":9.278e-06,"passed":true}
 *     node    {"gate":"A01","max_relative_error":0.000009278,"passed":true}
 *
 * Same value, different bytes. Python's float repr switches to exponent
 * notation at `1e-5` and JavaScript's at `1e-7`, so every measurement in the
 * band between them serialises differently. `1e+21` and `0.30000000000000004`
 * agree, which is what makes this the worst kind of mismatch: it is invisible
 * on the numbers anyone would test with, and gate reports live exactly in the
 * band where it bites.
 *
 * A digest that disagrees across the boundary would report "this artefact
 * changed" on every report that crossed it -- an alarm that is wrong every time
 * is an alarm that gets switched off, and with it the only mechanism saying
 * whether a result still matches the run that produced it.
 *
 * So the rule is: **hash the artefact's bytes, never a re-serialisation of
 * them.** That is what `coclea/attest.py` does (`sha256_file`), and it is why
 * `observationOf` takes `rawSource`. This function stays for the case where
 * there are no original bytes -- a report assembled in memory -- and it is
 * correct for comparing two objects *within* this runtime, which is all
 * `Observation.digest` needs when both sides of the comparison are here.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Which gates a known-wrong artefact walked past.
 *
 * Not a nicety. A suite of green gates is evidence only if it is known which of
 * them can go red, and the cochlea project makes this measurable by keeping a
 * deliberate defect in the solver: a boundary mass error that leaves the matrix
 * symmetric, the spectrum ordered and the mode shapes correct, so GATE-A02,
 * A03 and A11 all pass a solver that is wrong in every eigenvalue.
 *
 * Given the reports from the defect run, this returns the gates that failed to
 * notice. A required gate appearing in that list is a gate carrying no weight
 * for this class of fault, and the suite should say so rather than count it.
 */
export function nonDiscriminating(
  defectReports: readonly GateReport[],
  required: readonly string[],
): string[] {
  const verdicts = summarise(defectReports);
  return required.filter((g) => verdicts.get(g)?.passed === true).sort();
}
