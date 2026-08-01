# ADR-0004 · A flow is a first-class object that reads the subagent record but does not own it

- **Date:** 2026-08-01
- **Status:** Accepted
- **Supersedes:** [ADR-0002](0002-flow-as-first-class-object.md)

## Why this replaces ADR-0002

ADR-0002 reached the right conclusion — flows get their own tables — from a
false premise. It described `src/tasks/` as *"a status row with events and no
execution semantics"* and dismissed extending it as "the worst of both".

That characterisation was wrong. `TaskStore` is the **subagent execution
tracker**:

```ts
TASK_STATUSES = ["pending", "in_progress", "completed", "skipped", "failed"]

interface Task      { id; sessionId; originRunId; title; status; createdAt; updatedAt }
interface TaskEvent { id; taskId; runId; type; fromStatus; toStatus; createdAt }

transitionStatus(id, expectedStatus, nextStatus, runId): Promise<Task | null>
```

A persisted work item with a state machine, a full transition event log, and
compare-and-swap on every transition. `claude-harness.ts:612-654` writes it from
the agent CLI's `task_started` / `task_updated` / `task_notification` events.

So the real question — *extend `tasks` or build alongside it?* — was never
actually asked. ADR-0002 answered a question about a strawman. This ADR asks the
real one, and reaches a similar destination for entirely different reasons,
which is exactly why the old file is superseded rather than edited: the reasoning
is the part worth correcting.

## Context

Three properties of `tasks`, all verified:

**It is harness-owned.** References to `TaskStore` by harness: `pi` 0, `mock` 0,
`claude` 4, `codex` 4, `opencode` 4. On `pi` — the default, and the only harness
that can reach OpenRouter models — the table stays empty. A flow engine built on
`tasks` would work under Claude Code and silently do nothing under DeepSeek.

**It is bound to a run.** `Task` carries `sessionId` and `originRunId`. Its
lifetime is that of a run. A flow must outlive runs, sessions and restarts —
that is the entire point of the object.

**It has no ordering, goal or lineage.** Statuses and transitions, but no
sequence, no success condition, no parent pointer. It answers *"what did this
run's subagents do?"* — a genuinely useful question, and not the one a flow asks.

## Decision

**A flow is a first-class persisted object in its own `flow_`-prefixed tables.
It reads and links to `tasks` rows; it never writes them, extends the schema, or
depends on them existing.**

Concretely:

- A flow step that fans out to subagents on a CLI-backed harness **links** the
  resulting `task` ids. That is the swarm dimension, already captured upstream,
  and duplicating it would be the third time this organisation has rebuilt
  subagent tracking.
- The same step on `pi` links nothing and **must still complete**. Absence of
  task rows is a normal state, not a degraded one.
- `flow_` tables carry what `tasks` cannot: goal, ordering, lineage
  (`forkedFrom { flowId, atStep }`), artifacts, and a lifetime independent of any
  run.

**Retained from ADR-0002**, still correct and still load-bearing:

- Every attempt at a step is kept (`attempts[]`). Failure is history, not an
  overwrite — the lesson from `skill-store.ts:142` (`version += 1`, no prior
  content, so nothing can be diffed or rolled back).
- `forkedFrom` is recorded from the first commit, not retrofitted. Upstream's
  session fork persists no parent (`app-sessions.ts:392` writes only an audit
  row) and that is precisely why sessions cannot be diffed. We do not repeat it.
- `waiting` and `blocked` stay distinct states.
- No upstream table is altered.

**Added here:** a flow reuses `src/core/turn-resume.ts` for crash recovery within
a step's attempt. ADR-0002 was written believing no resumption existed, so it
implied building it. It exists; we build the layer above it.

## Consequences

**Cost.** Some duplication at the edges: a step and a task both have a status.
Accepted — they answer different questions over different lifetimes, and merging
them would couple the flow engine to the harness.

**Gain.** `ai-flows` is portable across all five harnesses. Given that the
cheap-model harness and the subagent harnesses are disjoint sets, portability is
not a nicety — it is the difference between a design that runs on what we can
afford and one that does not.

**Risk.** "Link but do not own" is a boundary that erodes under pressure. The
first time a flow needs to *write* a task row is the signal that this ADR needs
revisiting, not that the rule needs bending quietly.

**Test that enforces it.** The flow suite runs against `mock` — which, like `pi`,
has no `TaskStore`. If a flow ever requires task rows to complete, that suite
fails. The boundary is checked by CI rather than by intention.

## Alternatives rejected

**Extend `tasks` into the flow engine.** The question ADR-0002 should have asked.
Rejected on harness portability: the store is written by three of five harnesses,
and the two that skip it are the two we run on. A work engine that is empty on
its own default configuration is not an engine.

**A flow step *is* a task.** Cleaner on paper, and wrong on lifetime: tasks die
with their run. It would also mean writing to a store the harness considers its
own, which breaks on the next `git subtree pull` that touches it.

**Ignore `tasks` entirely** (the practical effect of ADR-0002). Rejected: it is
the swarm dimension, already persisted, with an event log we would otherwise
rebuild. Reading it is free; not reading it is a third reimplementation.
