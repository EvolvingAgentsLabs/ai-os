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

export interface Attempt {
  id: string;
  stepId: string;
  n: number;
  state: AttemptState;
  runId: string | null;
  sessionId: string | null;
  error: string | null;
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
