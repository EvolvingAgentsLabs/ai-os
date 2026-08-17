/**
 * What a gated flow looks like on the desk.
 *
 * `ai-flows` has computed the freeze verdict since the `Gated` shape was built,
 * and [`gates.ts`](../../ai-flows/src/gates.ts) says out loud what it is for:
 *
 * > *"The two refusal reasons stay apart all the way to the caller so a UI can
 * > say **'GATE-A12 went red'** rather than 'cannot freeze'. A specific, fixable
 * > failure rendered as an unexplained refusal is how a gate stops being read."*
 *
 * **No UI said either one.** `desk.ts` renders state, steps, digest, menu, trace
 * and answer, and knows nothing about `shape`, `requiredGates` or freezing — so
 * the one property that makes a research project different from a pile of flows
 * was invisible on the surface built to look at it.
 *
 * ## Where the gate results come from, and why not from disk
 *
 * Not from `gates/reports/*.json`. That path belongs to one project and the desk
 * serves any scope; a surface that reads a specific repository's directory has
 * stopped being a surface.
 *
 * They come from the flow itself. `observationOf` stamps a gated step's
 * observation with `source = "gate.<GATE>.<metric>"`, so **the flow record
 * already names which gate each step reported**. The step's own state carries
 * whether it held. Nothing else is needed and nothing is inferred.
 *
 * ## The distinction this exists to preserve
 *
 * A required gate can be in three states, and two of them are not the same:
 *
 * * **passed** — reported, green;
 * * **red** — reported, failed. Somebody has a number and a thing to fix;
 * * **never ran** — no report at all. Nobody knows anything.
 *
 * Collapsing the last two into "not passed" is the failure `gates.ts` kept
 * `blockers` and `unknown` apart to prevent, and it would have been undone here
 * by a single `!v.passed` in a template.
 */
import { freezeVerdict, type FreezeVerdict } from "../../ai-flows/src/gates.ts";

/** The shape of a flow this module can read. Structural, so a demo row fits it. */
export interface GatedFlowLike {
  shape?: string | null;
  requiredGates?: string[] | null;
  steps: ReadonlyArray<{
    state: string;
    attempts?: ReadonlyArray<{
      state?: string;
      observation?: { source?: string; value?: number | null } | null;
      // The demo's rows carry the observation's fields inline rather than
      // nested, because that is what `desk.ts` reads. Both are accepted; a
      // reader that only understood one would work in exactly one of the two
      // places the desk runs.
      source?: string;
      value?: number | null;
    }>;
  }>;
}

export interface GateObservation {
  gate: string;
  metric: string | null;
  value: number | null;
  /** The step's state, which is what says whether the gate held. */
  state: string;
}

export interface GateFace extends FreezeVerdict {
  required: string[];
  observed: GateObservation[];
}

/** `gate.A01.max_relative_error` -> `{gate: "A01", metric: "max_relative_error"}`. */
export function parseGateSource(source: string): { gate: string; metric: string | null } | null {
  if (!source.startsWith("gate.")) return null;
  const rest = source.slice(5);
  const dot = rest.indexOf(".");
  if (dot < 0) return rest ? { gate: rest, metric: null } : null;
  const gate = rest.slice(0, dot);
  return gate ? { gate, metric: rest.slice(dot + 1) || null } : null;
}

/**
 * The gate face of a flow, or `null` when the flow declares no gates.
 *
 * `null` rather than an empty face: an open flow has no freeze verdict, and
 * rendering one that says "may freeze" about a flow with nothing to freeze is
 * the kind of confident emptiness this repository keeps finding.
 */
export function gateFace(flow: GatedFlowLike): GateFace | null {
  const required = flow.requiredGates ?? [];
  if (flow.shape !== "gated" || required.length === 0) return null;

  const observed: GateObservation[] = [];
  for (const step of flow.steps) {
    for (const attempt of step.attempts ?? []) {
      const source = attempt.observation?.source ?? attempt.source;
      if (typeof source !== "string") continue;
      const parsed = parseGateSource(source);
      if (!parsed) continue;
      observed.push({
        ...parsed,
        value: attempt.observation?.value ?? attempt.value ?? null,
        state: step.state,
      });
    }
  }

  // `freezeVerdict` wants reports; a step's state is the pass/fail and the
  // observation is the number. Built here rather than reimplementing the
  // verdict, so the desk and the engine cannot disagree about what blocks a
  // freeze — which they would, eventually, and silently.
  const reports = observed.map((o) => ({
    gate: o.gate,
    test: o.metric ?? o.gate,
    spec: "",
    passed: o.state === "done",
  }));

  return { required, observed, ...freezeVerdict(required, reports) };
}

/**
 * One line a person can read, with the three states kept apart.
 *
 * Deliberately not "3/5 gates passed": a fraction is the collapse this module
 * exists to refuse, and it reads identically whether the missing two went red or
 * were never run.
 */
export function gateSentence(face: GateFace): string {
  if (face.mayFreeze) {
    return `every required gate green (${face.passed.join(", ")}) — this may freeze`;
  }
  const parts: string[] = [];
  if (face.blockers.length) parts.push(`${face.blockers.join(", ")} went red`);
  if (face.unknown.length) parts.push(`${face.unknown.join(", ")} never ran`);
  return `${parts.join("; ")} — held, and not the same reason`;
}
