import type {
  Attempt,
  CreateFlowInput,
  Flow,
  FlowState,
  FlowWithSteps,
  Observation,
  Step,
  StepState,
} from "./types.ts";

export interface AppendStepInput {
  flowId: string;
  intent: string;
}

export interface StartAttemptInput {
  stepId: string;
  runId?: string;
  sessionId?: string;
}

export interface FinishAttemptInput {
  attemptId: string;
  state: "done" | "failed";
  result?: string;
  error?: string;
  /**
   * Optional. Nothing requires an observation and nothing infers one — an
   * attempt closed without it stays `null` forever, because the upstream
   * telemetry it could have been rebuilt from is gone within the hour
   * (ADR-0007).
   */
  observation?: Omit<Observation, "at"> & { at?: number };
  /**
   * Recorded at close because it is not knowable at open.
   *
   * `POST /v1/turns?async=1` answers `{status, runId}` and nothing else — the
   * session id only appears on the run's `result` once it is terminal. So an
   * attempt opened on the async path had `sessionId: null` forever, which meant
   * the field existed, read as "this attempt had no conversation", and was wrong
   * every time. Found by a probe whose transcript arm came back empty.
   */
  sessionId?: string;
}

export interface ForkInput {
  flowId: string;
  atStep: number;
  title?: string;
}

export interface FlowStore {
  createFlow(input: CreateFlowInput): Promise<Flow>;

  getFlow(id: string): Promise<FlowWithSteps | null>;

  listFlows(scopeId: string): Promise<Flow[]>;

  /** Compare-and-swap. Returns null when the flow is absent or not in `expected`. */
  transitionFlow(id: string, expected: FlowState, next: FlowState): Promise<Flow | null>;

  appendStep(input: AppendStepInput): Promise<Step | null>;

  /**
   * Remove a step that has not started.
   *
   * Refuses anything that is not `pending` with zero attempts, and that refusal
   * is the point rather than caution. `attempts[]` exists because a counter that
   * discards its past cannot be diffed, rolled back or explained; deleting a step
   * that ran would erase an attempt and the observation captured when it closed,
   * which is the same mistake with an extra step.
   *
   * Indices are **not** renumbered. A gap is honest — step 3 was removed — and
   * renumbering would silently rewrite the meaning of every index already
   * recorded in a result, a log or somebody's screenshot.
   *
   * Returns the removed step, or null when it is absent or has started.
   */
  removeStep(stepId: string): Promise<Step | null>;

  /** Compare-and-swap, as above. */
  transitionStep(id: string, expected: StepState, next: StepState): Promise<Step | null>;

  /** Moves the step to `running` and opens attempt n+1. Never replaces a prior attempt. */
  startAttempt(input: StartAttemptInput): Promise<Attempt | null>;

  /** Closes the open attempt and settles its step: `done` or `failed`. */
  finishAttempt(input: FinishAttemptInput): Promise<Attempt | null>;

  /**
   * Copies steps `0..atStep` into a new flow carrying `forkedFrom { flowId, atStep }`.
   * Copied steps keep their result and reset to `pending` with no attempts: the
   * ancestor's attempts are the ancestor's history, not the fork's.
   */
  fork(input: ForkInput): Promise<FlowWithSteps | null>;

  close?(): Promise<void>;
}

export function nextStepOf(flow: FlowWithSteps): Step | null {
  return flow.steps.find((s) => s.state === "pending") ?? null;
}

export function openAttemptOf(step: Step): Attempt | null {
  return step.attempts.find((a) => a.state === "running") ?? null;
}
