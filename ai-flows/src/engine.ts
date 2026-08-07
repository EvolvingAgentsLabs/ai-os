/**
 * The flow engine — M2's first slice.
 *
 * One flow, one shape (`open`), steps that execute as real runs through the
 * signed HTTP seam. This is the piece [08-roadmap](../../doc/08-roadmap.md)
 * calls "the one that justifies the repository", and everything it does is
 * arranged around one requirement: **a flow started on Monday resumes on
 * Wednesday, after a restart, with its state intact.**
 *
 * ## Why the order of operations is what it is
 *
 * The obvious sequence — open the attempt, then launch the run — cannot be
 * resumed. `startAttempt` takes the `runId` at open time and there is no way to
 * attach one later, so an attempt opened before the turn is queued is an attempt
 * that says `running` with `runId: null`, and a process restarting on Wednesday
 * cannot tell whether a run was ever launched. It would have to choose between
 * abandoning work that may be finishing and duplicating work that already ran.
 *
 * So the turn is queued **first** and the attempt records its `runId` at open:
 *
 *     queueTurn -> runId -> startAttempt({ runId }) -> awaitRun -> finishAttempt
 *
 * The cost is a real window: a crash between `queueTurn` and `startAttempt`
 * leaves a run executing in the core with no attempt pointing at it. That run is
 * orphaned, the step retries, and the work is done twice. **That is the trade
 * being made** — a bounded duplicate is recoverable, an ambiguous attempt is not.
 * `resume()` below is what makes the choice pay off.
 *
 * ## Nothing here retries
 *
 * A failed attempt stays failed and its step stays `failed`. Retrying is the
 * caller's decision because `startAttempt` opens attempt *n+1* and keeps the
 * prior one — failure is history, not an overwrite ([03](../../doc/03-ai-flows.md)).
 * An engine that silently retried would collapse that history into a success.
 */
import { type CoreClient, type RunState, type TurnRequest, replyOf, runFailed } from "./core-client.ts";
import type { FlowStore } from "./flow-store.ts";
import { digestOf } from "./observability.ts";
import { type Attempt, type FlowWithSteps, type Step, isTerminalStep } from "./types.ts";

export interface EngineDeps {
  store: FlowStore;
  core: CoreClient;
  /** How a step's intent becomes a turn. Injected so the engine owns no surface policy. */
  turnFor: (flow: FlowWithSteps, step: Step) => TurnRequest;
  now?: () => number;
  /** Defaults to the measured, normalizing fingerprint. See doc/10. */
  digest?: (text: string) => string;
  awaitOptions?: { intervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> };
}

export type AdvanceOutcome =
  /** A step ran and settled. */
  | { kind: "advanced"; step: Step; attempt: Attempt; runState: RunState }
  /**
   * We stopped waiting; the run did not stop running.
   *
   * The attempt is deliberately left **open**, with its `runId`, so `resume()`
   * can settle it later. Closing it as failed here is the bug this variant
   * exists to prevent: it would mark work failed that the core is still doing,
   * and — worse — make it invisible to resumption, because `resume` looks for
   * attempts that are still `running`.
   */
  | { kind: "in_flight"; step: Step; attempt: Attempt }
  /** No pending step remained; the flow was settled `done`. */
  | { kind: "complete"; flow: FlowWithSteps }
  /** The flow is already terminal, or has a failed step blocking it. */
  | { kind: "halted"; reason: string };

function firstPendingStep(flow: FlowWithSteps): Step | undefined {
  return flow.steps.find((s) => s.state === "pending");
}

function openAttemptWithRun(flow: FlowWithSteps): { step: Step; attempt: Attempt } | undefined {
  for (const step of flow.steps) {
    if (step.state !== "running") continue;
    const attempt = step.attempts.find((a) => a.state === "running" && a.runId);
    if (attempt) return { step, attempt };
  }
  return undefined;
}

export function createEngine(deps: EngineDeps) {
  const now = deps.now ?? Date.now;
  const digest = deps.digest ?? digestOf;

  /** Close an attempt from a terminal run state, and settle its step with it. */
  async function settle(attempt: Attempt, run: RunState) {
    // Both statuses matter: a run can finish (`done`) while the turn inside it
    // did not succeed. Reading only the outer one marks refusals as results.
    const failed = runFailed(run);
    const text = replyOf(run);

    /**
     * The observation is captured here, at close, and never derived later —
     * ADR-0007, and it is forced rather than chosen: upstream deletes run
     * activity within the hour and exposes it on no route. A flow that did not
     * record what its attempt produced cannot find out afterwards.
     *
     * `source` names what was fingerprinted so two flows stay comparable.
     * `value` is null because `open` declares no metric; inventing a score here
     * is how a shape acquires a number nobody defined.
     */
    return deps.store.finishAttempt({
      attemptId: attempt.id,
      state: failed ? "failed" : "done",
      // The async path never knew this at open; the run carries it once terminal.
      ...(run.result?.sessionId ? { sessionId: run.result.sessionId } : {}),
      ...(failed ? { error: text || `run ended ${run.status}` } : { result: text }),
      observation: { digest: digest(text), value: null, source: "run.reply", at: now() },
    });
  }

  return {
    /**
     * Pick up whatever was in flight.
     *
     * This is the half that makes Monday-to-Wednesday work. An attempt that is
     * `running` with a `runId` is a claim that a run was launched; the core still
     * holds its outcome, so the attempt is settled from the core rather than
     * abandoned. Called before `advance` so a restart never launches a second run
     * for a step that already has one.
     */
    async resume(flowId: string): Promise<{ resumed: number }> {
      let resumed = 0;
      for (;;) {
        const flow = await deps.store.getFlow(flowId);
        if (!flow) return { resumed };
        const inFlight = openAttemptWithRun(flow);
        if (!inFlight) return { resumed };
        const run = await deps.core.awaitRun(inFlight.attempt.runId!, deps.awaitOptions ?? {});
        if (run.status === "timeout") return { resumed };
        await settle(inFlight.attempt, run);
        resumed += 1;
      }
    },

    /** Execute the next pending step, or settle the flow when there are none. */
    async advance(flowId: string): Promise<AdvanceOutcome> {
      const flow = await deps.store.getFlow(flowId);
      if (!flow) return { kind: "halted", reason: `no flow ${flowId}` };
      // `done` is not a halt — it is the successful terminal, and reporting it as
      // one made `runToCompletion` answer "halted" for a flow that had finished.
      if (flow.state === "done") return { kind: "complete", flow };
      if (flow.state === "abandoned") return { kind: "halted", reason: "flow is abandoned" };
      /**
       * A flow with no actor cannot advance, and is not given one.
       *
       * These are flows created before `actorId` existed. Running them as some
       * configured principal is precisely the shared-account attribution
       * [ADR-0009](../../doc/adr/0009-a-flow-records-who-it-acts-for.md) removes,
       * and inferring one from the scope manufactures provenance. Stopping is the
       * only answer that stays honest about what is not known.
       */
      if (!flow.actorId) {
        return {
          kind: "halted",
          reason: "this flow records no actor, so there is nobody to run it as (ADR-0009)",
        };
      }
      if (flow.steps.some((s) => s.state === "failed")) {
        // `blocked` rather than `failed`: the flow did not choose to stop, it
        // could not proceed. doc/03 keeps those distinct so nobody has to guess
        // whether a stopped flow is working as designed.
        await deps.store.transitionFlow(flowId, flow.state, "blocked");
        return { kind: "halted", reason: "a step failed; the flow is blocked" };
      }

      const step = firstPendingStep(flow);
      if (!step) {
        // Terminal states were already returned above, so reaching here always
        // means a live flow with nothing left pending.
        await deps.store.transitionFlow(flowId, flow.state, "done");
        const done = await deps.store.getFlow(flowId);
        return { kind: "complete", flow: done ?? flow };
      }

      if (flow.state === "draft" || flow.state === "waiting") {
        await deps.store.transitionFlow(flowId, flow.state, "running");
      }

      // Queue first, then record. See the header: this is what makes an attempt
      // unambiguous to a process that restarts between the two.
      const queued = await deps.core.queueTurn(deps.turnFor(flow, step));
      const attempt = await deps.store.startAttempt({
        stepId: step.id,
        ...(queued.runId ? { runId: queued.runId } : {}),
        ...(queued.sessionId ? { sessionId: queued.sessionId } : {}),
      });
      if (!attempt) return { kind: "halted", reason: "could not open an attempt" };

      // A core that answered synchronously (no runId) has already finished; there
      // is nothing to poll and the reply in hand is the outcome.
      const run: RunState = queued.runId
        ? await deps.core.awaitRun(queued.runId, deps.awaitOptions ?? {})
        : { status: "done", result: { status: queued.status, ...(queued.reply ? { reply: queued.reply } : {}) } };

      if (run.status === "timeout") {
        // Leave the attempt open. See `in_flight` above — this is the one path
        // where doing less is the whole feature.
        const paused = await deps.store.getFlow(flowId);
        if (paused) await deps.store.transitionFlow(flowId, paused.state, "waiting");
        return { kind: "in_flight", step, attempt };
      }

      await settle(attempt, run);
      const after = await deps.store.getFlow(flowId);
      const settledStep = after?.steps.find((s) => s.id === step.id) ?? step;
      const settledAttempt = settledStep.attempts.find((a) => a.id === attempt.id) ?? attempt;

      if (after) {
        // A failure blocks immediately — waiting for the remaining steps to
        // become terminal would report `waiting` for a flow that cannot proceed,
        // which is exactly the "working as designed" / "stuck since Tuesday"
        // confusion doc/03 separates these two states to avoid.
        const anyFailed = after.steps.some((s) => s.state === "failed");
        const allTerminal = !after.steps.some((s) => !isTerminalStep(s.state));
        const next = anyFailed ? "blocked" : allTerminal ? "done" : "waiting";
        await deps.store.transitionFlow(flowId, after.state, next);
      }

      return { kind: "advanced", step: settledStep, attempt: settledAttempt, runState: run };
    },

    /**
     * Resume, then advance until the flow settles.
     *
     * `maxSteps` is a runaway guard, not a policy: an `open` flow whose steps are
     * appended by an agent could otherwise grow while it is being drained.
     */
    async runToCompletion(flowId: string, maxSteps = 50): Promise<AdvanceOutcome> {
      await this.resume(flowId);
      let last: AdvanceOutcome = { kind: "halted", reason: "no steps executed" };
      for (let i = 0; i < maxSteps; i += 1) {
        last = await this.advance(flowId);
        if (last.kind !== "advanced") return last;
      }
      return last;
    },
  };
}

export type FlowEngine = ReturnType<typeof createEngine>;
