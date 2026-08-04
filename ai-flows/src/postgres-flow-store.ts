import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { AppendStepInput, FinishAttemptInput, FlowStore, ForkInput, StartAttemptInput } from "./flow-store.ts";
import type { Attempt, CreateFlowInput, Flow, FlowState, FlowWithSteps, Step, StepState } from "./types.ts";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS flow_flows(
     id TEXT PRIMARY KEY,
     seq BIGSERIAL NOT NULL,
     scope_id TEXT NOT NULL,
     title TEXT NOT NULL,
     goal TEXT NOT NULL,
     shape TEXT NOT NULL,
     state TEXT NOT NULL,
     forked_from_flow_id TEXT,
     forked_from_at_step INTEGER,
     created_at BIGINT NOT NULL,
     updated_at BIGINT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS flow_flows_scope_idx ON flow_flows(scope_id, seq DESC)`,
  `CREATE TABLE IF NOT EXISTS flow_steps(
     id TEXT PRIMARY KEY,
     flow_id TEXT NOT NULL REFERENCES flow_flows(id) ON DELETE CASCADE,
     idx INTEGER NOT NULL,
     intent TEXT NOT NULL,
     state TEXT NOT NULL,
     result TEXT,
     created_at BIGINT NOT NULL,
     updated_at BIGINT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS flow_steps_order_idx ON flow_steps(flow_id, idx)`,
  `CREATE TABLE IF NOT EXISTS flow_attempts(
     id TEXT PRIMARY KEY,
     step_id TEXT NOT NULL REFERENCES flow_steps(id) ON DELETE CASCADE,
     n INTEGER NOT NULL,
     state TEXT NOT NULL,
     run_id TEXT,
     session_id TEXT,
     error TEXT,
     started_at BIGINT NOT NULL,
     finished_at BIGINT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS flow_attempts_number_idx ON flow_attempts(step_id, n)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS flow_attempts_one_open_idx ON flow_attempts(step_id) WHERE state = 'running'`,
  // Observation, added after the first slice. All four nullable: an attempt
  // closed without one is the normal case, not a defect (ADR-0007). Stated as
  // ALTERs rather than folded into the CREATE above so a database made by the
  // first slice reaches the same shape as a fresh one.
  `ALTER TABLE flow_attempts ADD COLUMN IF NOT EXISTS obs_digest TEXT`,
  `ALTER TABLE flow_attempts ADD COLUMN IF NOT EXISTS obs_value DOUBLE PRECISION`,
  `ALTER TABLE flow_attempts ADD COLUMN IF NOT EXISTS obs_source TEXT`,
  `ALTER TABLE flow_attempts ADD COLUMN IF NOT EXISTS obs_at BIGINT`,
];

type Row = Record<string, unknown>;

function toFlow(r: Row): Flow {
  const parentId = r.forked_from_flow_id as string | null;
  return {
    id: r.id as string,
    scopeId: r.scope_id as string,
    title: r.title as string,
    goal: r.goal as string,
    shape: r.shape as Flow["shape"],
    state: r.state as FlowState,
    forkedFrom: parentId === null ? null : { flowId: parentId, atStep: Number(r.forked_from_at_step) },
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function toStep(r: Row): Step {
  return {
    id: r.id as string,
    flowId: r.flow_id as string,
    index: Number(r.idx),
    intent: r.intent as string,
    state: r.state as StepState,
    result: (r.result as string | null) ?? null,
    attempts: [],
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function toAttempt(r: Row): Attempt {
  return {
    id: r.id as string,
    stepId: r.step_id as string,
    n: Number(r.n),
    state: r.state as Attempt["state"],
    runId: (r.run_id as string | null) ?? null,
    sessionId: (r.session_id as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    observation:
      r.obs_digest === null || r.obs_digest === undefined
        ? null
        : {
            digest: r.obs_digest as string,
            value: r.obs_value === null || r.obs_value === undefined ? null : Number(r.obs_value),
            source: (r.obs_source as string | null) ?? "",
            at: Number(r.obs_at),
          },
    startedAt: Number(r.started_at),
    finishedAt: r.finished_at === null || r.finished_at === undefined ? null : Number(r.finished_at),
  };
}

export function createPostgresFlowStore(
  connectionString: string,
  opts: { now?: () => number; id?: () => string } = {},
): FlowStore {
  const now = opts.now ?? Date.now;
  const nextId = opts.id ?? randomUUID;
  let poolPromise: Promise<Pool> | null = null;

  async function pool(): Promise<Pool> {
    poolPromise ??= (async () => {
      const pg = (await import("pg")).default;
      const p = new pg.Pool({ connectionString });
      for (const statement of SCHEMA) await p.query(statement);
      return p;
    })();
    return poolPromise;
  }

  async function q(text: string, params: unknown[] = []): Promise<Row[]> {
    return (await (await pool()).query(text, params)).rows as Row[];
  }

  async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await (await pool()).connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const touchFlow = (c: PoolClient, flowId: string, at: number) =>
    c.query("UPDATE flow_flows SET updated_at=$2 WHERE id=$1", [flowId, at]);

  return {
    async createFlow(input: CreateFlowInput): Promise<Flow> {
      const at = now();
      const rows = await q(
        `INSERT INTO flow_flows(id, scope_id, title, goal, shape, state, forked_from_flow_id, forked_from_at_step, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$8) RETURNING *`,
        [
          nextId(),
          input.scopeId,
          input.title,
          input.goal,
          input.shape ?? "open",
          input.forkedFrom?.flowId ?? null,
          input.forkedFrom?.atStep ?? null,
          at,
        ],
      );
      return toFlow(rows[0]!);
    },

    async getFlow(id: string): Promise<FlowWithSteps | null> {
      const flows = await q("SELECT * FROM flow_flows WHERE id=$1", [id]);
      if (!flows[0]) return null;
      const steps = (await q("SELECT * FROM flow_steps WHERE flow_id=$1 ORDER BY idx ASC", [id])).map(toStep);
      if (steps.length) {
        const attempts = await q("SELECT * FROM flow_attempts WHERE step_id = ANY($1::text[]) ORDER BY n ASC", [
          steps.map((s) => s.id),
        ]);
        const byStep = new Map(steps.map((s) => [s.id, s]));
        for (const row of attempts) byStep.get(row.step_id as string)?.attempts.push(toAttempt(row));
      }
      return { ...toFlow(flows[0]), steps };
    },

    async listFlows(scopeId: string): Promise<Flow[]> {
      return (await q("SELECT * FROM flow_flows WHERE scope_id=$1 ORDER BY seq DESC", [scopeId])).map(toFlow);
    },

    async transitionFlow(id: string, expected: FlowState, next: FlowState): Promise<Flow | null> {
      const rows = await q("UPDATE flow_flows SET state=$3, updated_at=$4 WHERE id=$1 AND state=$2 RETURNING *", [
        id,
        expected,
        next,
        now(),
      ]);
      return rows[0] ? toFlow(rows[0]) : null;
    },

    async appendStep(input: AppendStepInput): Promise<Step | null> {
      const at = now();
      return tx(async (c) => {
        const flow = await c.query("SELECT id FROM flow_flows WHERE id=$1 FOR UPDATE", [input.flowId]);
        if (!flow.rows[0]) return null;
        const { rows } = await c.query(
          `INSERT INTO flow_steps(id, flow_id, idx, intent, state, result, created_at, updated_at)
           VALUES ($1,$2,(SELECT COALESCE(MAX(idx)+1,0) FROM flow_steps WHERE flow_id=$2),$3,'pending',NULL,$4,$4)
           RETURNING *`,
          [nextId(), input.flowId, input.intent, at],
        );
        await touchFlow(c, input.flowId, at);
        return toStep(rows[0] as Row);
      });
    },

    async transitionStep(id: string, expected: StepState, next: StepState): Promise<Step | null> {
      const at = now();
      const rows = await q("UPDATE flow_steps SET state=$3, updated_at=$4 WHERE id=$1 AND state=$2 RETURNING *", [
        id,
        expected,
        next,
        at,
      ]);
      if (!rows[0]) return null;
      await q("UPDATE flow_flows SET updated_at=$2 WHERE id=$1", [rows[0].flow_id, at]);
      return toStep(rows[0]);
    },

    async startAttempt(input: StartAttemptInput): Promise<Attempt | null> {
      const at = now();
      return tx(async (c) => {
        const step = await c.query("SELECT * FROM flow_steps WHERE id=$1 FOR UPDATE", [input.stepId]);
        const current = step.rows[0] as Row | undefined;
        if (!current) return null;
        if (current.state !== "pending" && current.state !== "waiting") return null;
        const { rows } = await c.query(
          `INSERT INTO flow_attempts(id, step_id, n, state, run_id, session_id, error, started_at, finished_at)
           VALUES ($1,$2,(SELECT COALESCE(MAX(n)+1,1) FROM flow_attempts WHERE step_id=$2),'running',$3,$4,NULL,$5,NULL)
           RETURNING *`,
          [nextId(), input.stepId, input.runId ?? null, input.sessionId ?? null, at],
        );
        await c.query("UPDATE flow_steps SET state='running', updated_at=$2 WHERE id=$1", [input.stepId, at]);
        await touchFlow(c, current.flow_id as string, at);
        return toAttempt(rows[0] as Row);
      });
    },

    async finishAttempt(input: FinishAttemptInput): Promise<Attempt | null> {
      const at = now();
      return tx(async (c) => {
        const obs = input.observation;
        const { rows } = await c.query(
          `UPDATE flow_attempts SET state=$2, error=$3, finished_at=$4,
             obs_digest=COALESCE($5, obs_digest),
             obs_value=COALESCE($6, obs_value),
             obs_source=COALESCE($7, obs_source),
             obs_at=COALESCE($8, obs_at)
           WHERE id=$1 AND state='running' RETURNING *`,
          [
            input.attemptId,
            input.state,
            input.error ?? null,
            at,
            obs?.digest ?? null,
            obs?.value ?? null,
            obs?.source ?? null,
            obs ? (obs.at ?? at) : null,
          ],
        );
        const attempt = rows[0] as Row | undefined;
        if (!attempt) return null;
        const stepState: StepState = input.state === "done" ? "done" : "failed";
        const step = await c.query(
          input.result === undefined
            ? "UPDATE flow_steps SET state=$2, updated_at=$3 WHERE id=$1 RETURNING flow_id"
            : "UPDATE flow_steps SET state=$2, updated_at=$3, result=$4 WHERE id=$1 RETURNING flow_id",
          input.result === undefined
            ? [attempt.step_id, stepState, at]
            : [attempt.step_id, stepState, at, input.result],
        );
        await touchFlow(c, (step.rows[0] as Row).flow_id as string, at);
        return toAttempt(attempt);
      });
    },

    async fork(input: ForkInput): Promise<FlowWithSteps | null> {
      const at = now();
      const forked = await tx(async (c) => {
        const parent = await c.query("SELECT * FROM flow_flows WHERE id=$1 FOR UPDATE", [input.flowId]);
        const row = parent.rows[0] as Row | undefined;
        if (!row) return null;
        const steps = await c.query("SELECT * FROM flow_steps WHERE flow_id=$1 ORDER BY idx ASC", [input.flowId]);
        if (input.atStep < 0 || input.atStep >= steps.rows.length) return null;
        const id = nextId();
        await c.query(
          `INSERT INTO flow_flows(id, scope_id, title, goal, shape, state, forked_from_flow_id, forked_from_at_step, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$8)`,
          [id, row.scope_id, input.title ?? row.title, row.goal, row.shape, input.flowId, input.atStep, at],
        );
        for (const [index, step] of steps.rows.slice(0, input.atStep + 1).entries()) {
          await c.query(
            `INSERT INTO flow_steps(id, flow_id, idx, intent, state, result, created_at, updated_at)
             VALUES ($1,$2,$3,$4,'pending',$5,$6,$6)`,
            [nextId(), id, index, (step as Row).intent, (step as Row).result, at],
          );
        }
        return id;
      });
      return forked === null ? null : this.getFlow(forked);
    },

    async close(): Promise<void> {
      if (poolPromise) await (await poolPromise).end();
      poolPromise = null;
    },
  };
}
