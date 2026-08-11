/**
 * The menu that reveals itself — proposed actions for *this* object, in *this*
 * state.
 *
 * A command line asks you to remember the verb. A menu bar shows you the verbs,
 * and that is most of what made a GUI usable by people who had never used a
 * computer. Agent systems went back to the command line: the interface is a text
 * box, and knowing what to type is the whole skill.
 *
 * The set of sensible things to do with a flow is not fixed, which is why nobody
 * has drawn it as a menu — it depends on the flow's state, its trace, and what
 * just failed. So this module derives it. Each proposal carries **the evidence
 * that produced it**, because an action offered without a reason is a guess the
 * user has to audit, and auditing a guess is slower than deciding unaided.
 *
 * ## Deterministic first, model second — and the order is the safety property
 *
 * Every proposal here is computed from state. A model may add to the list
 * ([projection.ts](projection.ts) holds the result, generated on state change so
 * a render never spends), and what it adds is marked `source: "model"` and
 * **appended, never substituted**. Three consequences, all deliberate:
 *
 *   - The desk works with no model at all, which is what makes the arrangement
 *     testable and what keeps the demo honest.
 *   - A model that returns nothing degrades to a shorter menu, not an empty one.
 *   - A model that returns something wrong is visibly a proposal from a model,
 *     next to proposals that are not.
 *
 * ## Cost is on the proposal, not in a preference
 *
 * `04-ai-ui` requires that anything spending a model call says so before it is
 * pressed. So `spends` is a field on every action rather than something the panel
 * decides how to render. An action that cannot state its cost is not offerable.
 */
import type { Digest } from "./zoom.ts";
import type { FlowTrace } from "./trace.ts";

export interface Action {
  /** Stable id, so a test and a click handler agree on what was offered. */
  id: string;
  label: string;
  /** The evidence from state. Never generic advice. */
  why: string;
  /** Does pressing it spend a model call? Stated on the object, always. */
  spends: boolean;
  /** Where the desk sends it. `null` means the gesture is local. */
  route: "/advance" | "/fork" | "/assign" | "/unassign" | "/ask" | null;
  /** Which step it acts on, when that is meaningful. */
  step?: number;
  source: "state" | "model";
}

export interface ActionInput {
  flowId: string;
  state: string;
  digest: Digest;
  trace: FlowTrace;
  /** Agents on this desk that could take a step, for the assign proposal. */
  availableAgents: string[];
}

/**
 * The proposals that follow from state, in the order a person needs them.
 *
 * Ordering rule: **what is wrong comes before what is next.** A flow with a
 * failed step and a runnable next step is a flow where advancing buries the
 * failure, and a menu that lists "advance" first is a menu that recommends it.
 */
export function actionsFor(input: ActionInput): Action[] {
  const out: Action[] = [];
  const steps = input.trace.steps;

  const failed = steps.find((s) => s.state === "failed");
  if (failed) {
    out.push({
      id: `fork-before-${failed.index}`,
      label: `Fork before step ${failed.index} and try it differently`,
      why: `Step ${failed.index}${failed.agent ? ` (${failed.agent})` : ""} failed after ${failed.attempts.length} attempt(s). Forking keeps this flow's history and gives the alternative its own.`,
      spends: false,
      route: "/fork",
      step: failed.index,
      source: "state",
    });
  }

  // Drift is the signal that retrying is the wrong move — the flow is already
  // repeating itself, so another attempt buys another identical attempt.
  if (input.trace.movementTone === "warn" && /drift/.test(input.trace.movement)) {
    out.push({
      id: "fork-drift",
      label: "Change the agent — this is repeating itself",
      why: `${input.trace.detail}: successive attempts are producing the same fingerprint. Advancing again is predicted to produce it a third time.`,
      spends: false,
      route: "/fork",
      source: "state",
    });
  }

  const ignored = steps.find((s) => s.ignoredInput);
  if (ignored) {
    out.push({
      id: `handoff-${ignored.index}`,
      label: `Step ${ignored.index} used nothing it was given`,
      why: `${ignored.ignoredInput!.carried} of ${ignored.ignoredInput!.inputTokens} tokens carried forward. The handoff is broken, so what this step produced did not come from what preceded it.`,
      spends: false,
      route: "/ask",
      step: ignored.index,
      source: "state",
    });
  }

  const unassigned = steps.find((s) => !s.agent && s.state === "pending");
  if (unassigned && input.availableAgents.length > 0) {
    out.push({
      id: `assign-${unassigned.index}`,
      label: `Give step ${unassigned.index} an agent`,
      why: `It is pending with no agent named. ${input.availableAgents.length} agent(s) on this desk could take it.`,
      spends: false,
      route: "/assign",
      step: unassigned.index,
      source: "state",
    });
  }

  const next = steps.find((s) => s.state === "pending" && s.agent);
  if (next && input.state !== "done") {
    out.push({
      id: "advance",
      label: `Run step ${next.index}${next.agent ? ` — ${next.agent}` : ""}`,
      why: `It is the next pending step with an agent. This starts a real run.`,
      spends: true,
      route: "/advance",
      step: next.index,
      source: "state",
    });
  }

  const running = steps.find((s) => s.state === "running");
  if (running) {
    out.push({
      id: "collect",
      label: `Collect step ${running.index} when its run comes back`,
      why: `It has been running since this flow last moved. Settling costs nothing — the run was already paid for.`,
      spends: false,
      route: "/advance",
      step: running.index,
      source: "state",
    });
  }

  if (out.length === 0 && steps.length === 0) {
    out.push({
      id: "empty",
      label: "Drop an agent on this document to give it a step",
      why: "This flow has no steps. Nothing can run until something is delegated.",
      spends: false,
      route: null,
      source: "state",
    });
  }

  // Always offerable, always last: the one action whose answer is not a state
  // change. It is what the selection is *for* — see the deixis note in
  // `server.ts`.
  out.push({
    id: "ask",
    label: "Ask about this flow",
    why: `${input.digest.headline}. The question is answered from the trace, not from the goal text.`,
    spends: true,
    route: "/ask",
    source: "state",
  });

  return out;
}

/**
 * Append model-proposed actions to the computed ones.
 *
 * Separate function rather than a branch inside `actionsFor`, so that the
 * deterministic list is reachable and testable without ever constructing a
 * model reply.
 *
 * The cap is not a performance concern. A menu is useful because it is short —
 * that is the entire reason a menu beats a text box — and a model asked for
 * suggestions will happily return nine.
 */
export const MAX_MODEL_ACTIONS = 2;

export function withModelActions(
  computed: Action[],
  proposed: Array<{ label: string; why: string }>,
): Action[] {
  const seen = new Set(computed.map((a) => a.label.toLowerCase()));
  const extra = proposed
    .filter((p) => p.label && p.why && !seen.has(p.label.toLowerCase()))
    .slice(0, MAX_MODEL_ACTIONS)
    .map((p, i): Action => ({
      id: `model-${i}`,
      label: p.label,
      why: p.why,
      // A model proposal is a suggestion to press something, never a licence to
      // spend without saying so. It routes nowhere until a person picks it.
      spends: false,
      route: null,
      source: "model",
    }));
  return [...computed, ...extra];
}
