import { randomUUID } from "node:crypto";
import type { AppendStepInput, FinishAttemptInput, FlowStore, ForkInput, StartAttemptInput } from "./flow-store.ts";
import type { Attempt, CreateFlowInput, Flow, FlowState, FlowWithSteps, Step, StepState } from "./types.ts";

interface Row {
  flow: Flow;
  steps: Step[];
}

export function createMemoryFlowStore(opts: { now?: () => number; id?: () => string } = {}): FlowStore {
  const now = opts.now ?? Date.now;
  const nextId = opts.id ?? randomUUID;
  const rows = new Map<string, Row>();

  const cloneAttempt = (a: Attempt): Attempt => ({
    ...a,
    observation: a.observation ? { ...a.observation } : null,
  });
  const cloneStep = (s: Step): Step => ({
    ...s,
    attempts: s.attempts.map(cloneAttempt),
  });
  const cloneFlow = (f: Flow): Flow => ({
    ...f,
    forkedFrom: f.forkedFrom ? { ...f.forkedFrom } : null,
  });

  function findStep(stepId: string): { row: Row; step: Step } | null {
    for (const row of rows.values()) {
      const step = row.steps.find((s) => s.id === stepId);
      if (step) return { row, step };
    }
    return null;
  }

  function findAttempt(attemptId: string): { row: Row; step: Step; attempt: Attempt } | null {
    for (const row of rows.values()) {
      for (const step of row.steps) {
        const attempt = step.attempts.find((a) => a.id === attemptId);
        if (attempt) return { row, step, attempt };
      }
    }
    return null;
  }

  return {
    async createFlow(input: CreateFlowInput): Promise<Flow> {
      const at = now();
      const flow: Flow = {
        id: nextId(),
        scopeId: input.scopeId,
        actorId: input.actorId,
        title: input.title,
        goal: input.goal,
        shape: input.shape ?? "open",
        state: "draft",
        requiredGates: input.requiredGates ? [...input.requiredGates] : null,
        forkedFrom: input.forkedFrom ? { ...input.forkedFrom } : null,
        createdAt: at,
        updatedAt: at,
      };
      rows.set(flow.id, { flow, steps: [] });
      return cloneFlow(flow);
    },

    async getFlow(id: string): Promise<FlowWithSteps | null> {
      const row = rows.get(id);
      if (!row) return null;
      return { ...cloneFlow(row.flow), steps: row.steps.map(cloneStep) };
    },

    async listFlows(scopeId: string): Promise<Flow[]> {
      return [...rows.values()]
        .filter((r) => r.flow.scopeId === scopeId)
        .reverse()
        .map((r) => cloneFlow(r.flow));
    },

    async transitionFlow(id: string, expected: FlowState, next: FlowState): Promise<Flow | null> {
      const row = rows.get(id);
      if (!row || row.flow.state !== expected) return null;
      row.flow.state = next;
      row.flow.updatedAt = now();
      return cloneFlow(row.flow);
    },

    async appendStep(input: AppendStepInput): Promise<Step | null> {
      const row = rows.get(input.flowId);
      if (!row) return null;
      const at = now();
      const step: Step = {
        id: nextId(),
        flowId: row.flow.id,
        // MAX+1, not length: once a step can be removed there are gaps, and
        // `length` would hand the new step an index that already exists.
        index: row.steps.reduce((m, x) => Math.max(m, x.index + 1), 0),
        intent: input.intent,
        state: "pending",
        result: null,
        attempts: [],
        createdAt: at,
        updatedAt: at,
      };
      row.steps.push(step);
      row.flow.updatedAt = at;
      return cloneStep(step);
    },

    async removeStep(stepId: string): Promise<Step | null> {
      for (const row of rows.values()) {
        const i = row.steps.findIndex((s) => s.id === stepId);
        if (i < 0) continue;
        const step = row.steps[i]!;
        if (step.state !== "pending" || step.attempts.length) return null;
        row.steps.splice(i, 1);
        row.flow.updatedAt = now();
        return step;
      }
      return null;
    },

    async transitionStep(id: string, expected: StepState, next: StepState): Promise<Step | null> {
      const found = findStep(id);
      if (!found || found.step.state !== expected) return null;
      found.step.state = next;
      found.step.updatedAt = now();
      found.row.flow.updatedAt = found.step.updatedAt;
      return cloneStep(found.step);
    },

    async startAttempt(input: StartAttemptInput): Promise<Attempt | null> {
      const found = findStep(input.stepId);
      if (!found) return null;
      const { row, step } = found;
      if (step.state !== "pending" && step.state !== "waiting") return null;
      if (step.attempts.some((a) => a.state === "running")) return null;
      const at = now();
      const attempt: Attempt = {
        id: nextId(),
        stepId: step.id,
        n: step.attempts.length + 1,
        state: "running",
        runId: input.runId ?? null,
        sessionId: input.sessionId ?? null,
        error: null,
        observation: null,
        startedAt: at,
        finishedAt: null,
      };
      step.attempts.push(attempt);
      step.state = "running";
      step.updatedAt = at;
      row.flow.updatedAt = at;
      return cloneAttempt(attempt);
    },

    async finishAttempt(input: FinishAttemptInput): Promise<Attempt | null> {
      const found = findAttempt(input.attemptId);
      if (!found || found.attempt.state !== "running") return null;
      const { row, step, attempt } = found;
      const at = now();
      attempt.state = input.state;
      attempt.error = input.error ?? null;
      attempt.finishedAt = at;
      if (input.sessionId && !attempt.sessionId) attempt.sessionId = input.sessionId;
      if (input.observation) attempt.observation = { ...input.observation, at: input.observation.at ?? at };
      step.state = input.state === "done" ? "done" : "failed";
      if (input.result !== undefined) step.result = input.result;
      step.updatedAt = at;
      row.flow.updatedAt = at;
      return cloneAttempt(attempt);
    },

    async fork(input: ForkInput): Promise<FlowWithSteps | null> {
      const row = rows.get(input.flowId);
      if (!row) return null;
      if (input.atStep < 0 || input.atStep >= row.steps.length) return null;
      const at = now();
      const flow: Flow = {
        id: nextId(),
        scopeId: row.flow.scopeId,
        // A fork inherits its ancestor's actor: the same person continuing the
        // same work down a different branch.
        actorId: row.flow.actorId,
        title: input.title ?? row.flow.title,
        goal: row.flow.goal,
        // ...and its required gates: the same work down a different branch is
        // held to the same checks.
        requiredGates: row.flow.requiredGates ? [...row.flow.requiredGates] : null,
        shape: row.flow.shape,
        state: "draft",
        forkedFrom: { flowId: row.flow.id, atStep: input.atStep },
        createdAt: at,
        updatedAt: at,
      };
      const steps: Step[] = row.steps.slice(0, input.atStep + 1).map((s, index) => ({
        id: nextId(),
        flowId: flow.id,
        index,
        intent: s.intent,
        state: "pending",
        result: s.result,
        attempts: [],
        createdAt: at,
        updatedAt: at,
      }));
      rows.set(flow.id, { flow, steps });
      return { ...cloneFlow(flow), steps: steps.map(cloneStep) };
    },
  };
}
