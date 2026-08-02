# ai-flows

Declarative, resumable, inspectable units of work above the turn.

> **Status: the store is built and tested. Step execution is not.** The design is
> [`../doc/03-ai-flows.md`](../doc/03-ai-flows.md); decisions are
> [ADR-0004](../doc/adr/0004-flows-and-the-subagent-record.md) and
> [ADR-0006](../doc/adr/0006-ai-flows-lives-outside-core.md).

## In one paragraph

QM's top-level object is the session — a conversation. Conversations have no
declared goal, do not survive compaction, do not sequence work across days, and
fork without recording that they forked. A **flow** is a persisted object with a
goal, a shape, a state, and a lineage, which outlives any session that serves it.

## What is here

`src/` — the flow model and its store, in two backends behind one interface:

|                          |                                                     |
| ------------------------ | --------------------------------------------------- |
| `types.ts`               | `Flow`, `Step`, `Attempt`, and the three state sets |
| `flow-store.ts`          | the interface, plus `nextStepOf` / `openAttemptOf`  |
| `memory-flow-store.ts`   | for tests and for running without Postgres          |
| `postgres-flow-store.ts` | `flow_flows`, `flow_steps`, `flow_attempts`         |

What holds today, asserted against **both** backends (`npm test`, 25 tests with
`DATABASE_URL` set, 12 without):

- a flow persists a **goal** and survives the process that made it
- **every attempt is kept** — a retry appends, it never overwrites a failure
- **`forkedFrom { flowId, atStep }`** from the first commit, and it survives a
  re-read
- state changes are **compare-and-swap**; the second writer loses
- `waiting` and `blocked` are distinct and independently reachable
- the session lives on the **attempt**, not the flow — a flow that owned one
  session would be single-threaded by the run store's per-session claim
  ([the concurrency constraint](../doc/03-ai-flows.md#the-concurrency-constraint))

**Not here yet, and next:** executing a step against `POST /v1/turns`, the signed
request client, the API routes, and the end-to-end proof that M2 actually asks
for — a flow started on Monday resumed on Wednesday, on `pi` and on a CLI
harness.

## Rules

- A flow **composes** ai-base primitives (`runs`, `sessions`, `cron`,
  `triggers`); it does not replace them.
- **Nothing here imports `ai-base`** ([ADR-0006](../doc/adr/0006-ai-flows-lives-outside-core.md)).
  Core is reached over the signed HTTP API. The first time that is not enough,
  propose the route upstream — do not reach into `ai-base/src/`.
- A model call goes through `Harness`, never a vendor SDK — satisfied here by
  never making one: core does.
- New Postgres tables only, `flow_` prefixed. **No upstream table is altered.**
- A flow gets **no** exemption from the security posture. Unattended is not a
  reason for fewer approvals.
- Licensed Apache 2.0 (`SPDX-License-Identifier: Apache-2.0`).
