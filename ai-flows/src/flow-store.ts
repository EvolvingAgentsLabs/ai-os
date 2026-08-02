import type { Attempt, CreateFlowInput, Flow, FlowState, FlowWithSteps, Step, StepState } from "./types.ts";

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
