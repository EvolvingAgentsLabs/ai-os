# ai-flows

Declarative, resumable, inspectable units of work above the turn — and the
instruments that say whether any of it helped.

> **Status: built and proven live (2026-08-06) — 251 tests without a database,
> more with one.** One
> shape (`open`), persisted, resumable, executing against the real core over the
> signed seam. The design is [`../doc/03-ai-flows.md`](../doc/03-ai-flows.md);
> the decisions are [ADR-0004](../doc/adr/0004-flows-and-the-subagent-record.md),
> [ADR-0006](../doc/adr/0006-ai-flows-lives-outside-core.md) and
> [ADR-0007](../doc/adr/0007-observation-captured-not-derived.md); the milestone
> and its seven deliverables are
> [M2](../doc/08-roadmap.md#m2--the-first-flow--built-and-proven-live-2026-08-06).

## In one paragraph

QM's top-level object is the session — a conversation. Conversations have no
declared goal, do not survive compaction, do not sequence work across days, and
fork without recording that they forked. A **flow** is a persisted object with a
goal, a shape, a state, and a lineage, which outlives any session that serves it.

## Run it

```bash
cd ai-base  && npm ci && node --env-file=.env src/index.ts       # core  :8080
cd ai-flows && node --env-file=../ai-base/.env scripts/serve.ts  # flows :8097
```

`DATABASE_URL` is **required** — `flow_` tables are Postgres-only, and a flow
that does not survive a restart has not implemented the property it exists for.
`CORE_API_URL`, `CORE_SIGNING_SECRET`, `FLOWS_SIGNING_SECRET` and `FLOWS_PORT`
override the rest; `FLOWS_ALLOW_UNAUTHENTICATED=1` starts open and says so out
loud. `GET /` renders the read-only explorer, so the control arm for the canvas
is reachable without a build step or a second process.

## What is here

**The flow itself** — a persisted object, and the engine that advances it:

| | |
| --- | --- |
| `types.ts` | `Flow`, `Step`, `Attempt`, and the four state sets |
| `flow-store.ts` | the interface, plus `nextStepOf` / `openAttemptOf` |
| `memory-flow-store.ts` | for tests and for running without Postgres |
| `postgres-flow-store.ts` | `flow_flows`, `flow_steps`, `flow_attempts` |
| `engine.ts` | a step executes as a real core run, and resumes after a restart |
| `core-client.ts` | the signed HTTP seam to `ai-base` |
| `server.ts` | the flow API — create / advance / inspect, `node:http`, zero deps |
| `compose.ts` | a declared `subagents:` tree becomes a flow that runs |
| `conformation.ts` | what shape the system is in — **read, never stored** |
| `view.ts` · `vocabulary.ts` | the read-only explorer, and the visual vocabulary the desk shares |

**The measurement harness** — the half that keeps the other half honest:

| | |
| --- | --- |
| `evaluation.ts` | did changing the agents make the work better? |
| `conformance.ts` | gates a model *before* it is allowed into an evaluation |
| `scenarios.ts` | a scenario set with room to fail — the first one scored 3/3 both ways and had to be rebuilt |
| `stats.ts` | estimators for comparing one system against another |
| `observability.ts` | is a flow's progress readable from what it records? |
| `contribution.ts` | did this step use what it was given? |
| `review-evaluation.ts` | does adding a reviewer help? |
| `tasks/` | `handoff.ts`, `physics.ts` |

`scripts/` holds the probes and smoke runs that exercise all of it against a live
core — `flow-smoke`, `recovery-probe`, `compaction-smoke`, `delegate-smoke`,
`conformation-probe`, `delta-probe`, `evolve-probe`, `review-study`, `seed-demo`.

## What holds today

`npm test` — **251 pass** with no `DATABASE_URL` **[ran]**. Set it and the same
suite also runs `flow-store.test.ts` against the Postgres backend, which is where
durability is actually asserted rather than modelled — so 251 is the floor, not
the figure. The published total is in the root [README](../README.md) and
[`scripts/check-test-count.sh`](../scripts/check-test-count.sh) fails CI when it
drifts from what the suites report.

- a flow persists a **goal** and survives the process that made it
- **every attempt is kept** — a retry appends, it never overwrites a failure
- **`forkedFrom { flowId, atStep }`** from the first commit, and it survives a
  re-read
- state changes are **compare-and-swap**; the second writer loses
- `waiting` and `blocked` are distinct and independently reachable
- the session lives on the **attempt**, not the flow — a flow that owned one
  session would be single-threaded by the run store's per-session claim
  ([the concurrency constraint](../doc/03-ai-flows.md#the-concurrency-constraint))
- a flow started, restarted and **compacted** still completes — 6/6 and 6/6 on
  the real core, on both `pi` and `mock` **[ran]**, 2026-08-06
- an **observation per attempt**, captured when it closes, not derived later
  ([ADR-0007](../doc/adr/0007-observation-captured-not-derived.md))

**The ordering that "resumable" turned out to require.** `startAttempt` takes the
`runId` at open and cannot be given one later, so the turn is queued **first** and
the attempt records the id it got. Opening the attempt first produces one saying
`running` with `runId: null`, which a process restarting on Wednesday cannot
interpret. The cost is a crash window that orphans a run and does the step twice:
a bounded duplicate is recoverable, an ambiguous attempt is not.

## Not here yet

- **Shapes beyond `open`** — `FLOW_SHAPES` is a one-element tuple, on purpose.
  Fan-out and Deliberation are M6 and do not belong in the slice that proved the
  seam.
- **Merge and diff** between flows.
- **Scoped memory** — `ai-storage` is [05](../doc/05-ai-storage.md) and nothing
  else. Its gate passed on 2026-08-06 (baseline 3.0 on a long-horizon fixture, so
  the axis has room), which makes building it a milestone rather than a task.

## Rules

- A flow **composes** ai-base primitives (`runs`, `sessions`, `cron`,
  `triggers`); it does not replace them.
- **Nothing in `src/` imports `ai-base`** ([ADR-0006](../doc/adr/0006-ai-flows-lives-outside-core.md)).
  Core is reached over the signed HTTP API. The first time that is not enough,
  propose the route upstream — do not reach into `ai-base/src/`. `scripts/` is
  exempt and does import it: those are local probes and smoke runs, never the
  shipped seam, and nothing in `src/` may depend on one.
- A model call goes through `Harness`, never a vendor SDK — satisfied here by
  never making one: core does.
- New Postgres tables only, `flow_` prefixed. **No upstream table is altered.**
- A flow gets **no** exemption from the security posture. Unattended is not a
  reason for fewer approvals.
- Ground truth in `scenarios.ts` is **computed and the program quoted**, never
  recalled — a benchmark whose answers came from the kind of system under test
  grades a model against its own mistake.
- Every colour drawn must appear in a legend generated from `vocabulary.ts`,
  never from a hand-kept list.
- Licensed Apache 2.0 (`SPDX-License-Identifier: Apache-2.0`).
