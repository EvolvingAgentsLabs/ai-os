export const FLOW_SHAPES = ["open"] as const;
export type FlowShape = (typeof FLOW_SHAPES)[number];

export const FLOW_STATES = ["draft", "running", "waiting", "blocked", "done", "abandoned"] as const;
export type FlowState = (typeof FLOW_STATES)[number];

export const STEP_STATES = ["pending", "running", "waiting", "done", "failed", "skipped"] as const;
export type StepState = (typeof STEP_STATES)[number];

export const ATTEMPT_STATES = ["running", "done", "failed"] as const;
export type AttemptState = (typeof ATTEMPT_STATES)[number];

const TERMINAL_FLOW: ReadonlySet<FlowState> = new Set<FlowState>(["done", "abandoned"]);
const TERMINAL_STEP: ReadonlySet<StepState> = new Set<StepState>(["done", "failed", "skipped"]);

export function isTerminalFlow(state: FlowState): boolean {
  return TERMINAL_FLOW.has(state);
}

export function isTerminalStep(state: StepState): boolean {
  return TERMINAL_STEP.has(state);
}

export interface FlowLineage {
  flowId: string;
  atStep: number;
}

/**
 * What an attempt was observed to produce, captured when the attempt closes.
 *
 * Captured rather than derived, and that is forced by upstream rather than
 * chosen: run activity is deleted after `RUN_ACTIVITY_TTL_MS` — one hour — in
 * both backends (`ai-base/src/runs/run-activity-store.ts:16`,
 * `postgres-run-activity-store.ts:30`) and is exposed on no route. A flow
 * spanning days cannot reconstruct what its attempts did. See ADR-0007.
 *
 * Deliberately not a score. `digest` answers "can two states be told apart",
 * which is defined for every shape; `value` answers "by how much", which is
 * defined only where a shape declares a metric, and today no shape does.
 */
export interface Observation {
  /** Fingerprint of the state this attempt produced. Opaque to the store. */
  digest: string;
  /** Present only where the shape declares a metric. `null` for `open`. */
  value: number | null;
  /** What produced the digest. Recorded so two flows are comparable, never inferred. */
  source: string;
  at: number;
}

export interface Attempt {
  id: string;
  stepId: string;
  n: number;
  state: AttemptState;
  runId: string | null;
  sessionId: string | null;
  error: string | null;
  /** `null` when the caller closed the attempt without one. Never fabricated. */
  observation: Observation | null;
  startedAt: number;
  finishedAt: number | null;
}

export interface Step {
  id: string;
  flowId: string;
  index: number;
  intent: string;
  state: StepState;
  result: string | null;
  attempts: Attempt[];
  createdAt: number;
  updatedAt: number;
}

export interface Flow {
  id: string;
  scopeId: string;
  title: string;
  goal: string;
  shape: FlowShape;
  state: FlowState;
  forkedFrom: FlowLineage | null;
  createdAt: number;
  updatedAt: number;
}

export interface FlowWithSteps extends Flow {
  steps: Step[];
}

export interface CreateFlowInput {
  scopeId: string;
  title: string;
  goal: string;
  shape?: FlowShape;
  forkedFrom?: FlowLineage;
}
