# ai-flows

Declarative, resumable, inspectable units of work above the turn.

> **Status: specified, not implemented.** The design is
> [`../doc/03-ai-flows.md`](../doc/03-ai-flows.md); decisions are
> [ADR-0002](../doc/adr/0002-flow-as-first-class-object.md).

## In one paragraph

QM's top-level object is the session — a conversation. Conversations have no
declared goal, do not survive compaction, do not sequence work across days, and
fork without recording that they forked. A **flow** is a persisted object with a
goal, a shape, a state, and a lineage, which outlives any session that serves it.

## What is here

Nothing yet. First milestone is [M2](../doc/08-roadmap.md#m2--the-first-flow--not-started-and-the-one-that-justifies-the-repository):
one shape (`Open`), persisted, resumable, with `forkedFrom` recorded from the
first commit.

## Rules

- A flow **composes** ai-base primitives (`runs`, `sessions`, `cron`,
  `triggers`); it does not replace them.
- A model call goes through `Harness`, never a vendor SDK.
- New Postgres tables only, `flow_` prefixed. **No upstream table is altered.**
- A flow gets **no** exemption from the security posture. Unattended is not a
  reason for fewer approvals.
- Licensed Apache 2.0 (`SPDX-License-Identifier: Apache-2.0`).
