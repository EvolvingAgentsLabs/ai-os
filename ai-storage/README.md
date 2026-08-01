# ai-storage

Memory at four levels: system, user, project, flow.

> **Status: specified, not implemented.** The design is
> [`../doc/05-ai-storage.md`](../doc/05-ai-storage.md); the scope-kind decision
> is [ADR-0003](../doc/adr/0003-storage-scope-axis.md).

## Read this first

The predecessor project measured a closely related idea — indexing memory on a
second axis — and it came back **flat: 80% acc@1 either way**. The second axis
was real information (`cosine = 0.753`); it just did not change the answer.

So: **the burden of proof is on the axis.** This pillar specifies the cheapest
version of each idea and names what would falsify it. No embeddings in v1.

## In one paragraph

Upstream memory is one markdown file per scope — `memory/MEMORY.md`, 300 bullets,
oldest dropped on overflow. Two limits: FIFO is the only forgetting policy, and a
scope is the only address. ai-storage adds four levels with different lifetimes
and explicit, reversible, recorded promotion between them.

## What is here

Nothing yet. [M4](../doc/08-roadmap.md#m4--ai-storage-v1--not-started).

## Rules

- Implements QM's `MemoryService` (`ai-base/src/memory/memory-service.ts:28`) —
  all five required methods plus the revision family, because history is what
  makes promotion reversible.
- Promotion between levels is a `MemoryStrategy`, not a new subsystem.
- **No promotion without a record** (source, actor, timestamp, reason).
- Retrieval is level-ordered recall in v1. Machinery only after a written-down,
  measured insufficiency.
- The benchmark is published **whichever way it comes out.**
- Licensed Apache 2.0 (`SPDX-License-Identifier: Apache-2.0`).
