# ADR-0002 · The flow is a first-class persisted object, not a prompt pattern

- **Date:** 2026-08-01
- **Status:** **Superseded** by [ADR-0004](0004-flows-and-the-subagent-record.md) (2026-08-01)

> **Superseded the same day, and kept unedited on purpose.**
>
> The conclusion below — a flow is a first-class persisted object in its own
> tables — survives. The reasoning does not. This ADR describes `src/tasks/` as
> *"a status row with events and no execution semantics"* and rejects extending
> it on that basis. That is false: `TaskStore` is the subagent execution tracker,
> with a state machine, a transition event log and compare-and-swap. The real
> question was never asked here.
>
> It stays readable because a decision reached from a wrong premise is the most
> useful kind of record this organisation can keep — and because editing it
> quietly is exactly the habit `doc/README.md` forbids.
>
> Read [ADR-0004](0004-flows-and-the-subagent-record.md) instead.

## Context

"Multi-step agent work" is usually implemented as a **prompt pattern**: the model
is told to plan, keeps its plan in context, and works through it. Cheap, no
schema, no migration — and it is what almost every agent product does.

It fails in three ways that matter at OS level:

1. The plan lives in the context window, so compaction
   (`ai-base/src/harness/context-compaction.ts`) degrades it to a summary.
2. It is not addressable. Nothing outside the conversation can ask what the state
   is, and no second agent or surface can join.
3. It has no lineage. Two attempts cannot be compared because neither is an
   object.

QM's own primitives sit one level below: `runs` (a turn), `tasks` (a status row),
`triggers`/`cron` (ways to start a turn). None is a unit of work.

## Decision

**A flow is a persisted database object** with identity, goal, state, ordered
steps, artifacts and lineage — in new `flow_`-prefixed tables, addressable
through the API independently of any session.

**Corollaries:**

- Every attempt at a step is retained (`attempts[]`). Failure is history, not an
  overwrite. This is a direct response to `skill-store.ts:142` (`version += 1`
  with no prior content — a counter that cannot be diffed or rolled back).
- `forkedFrom { flowId, atStep }` is recorded from the first commit, not added
  later. Upstream's session fork does not persist a parent
  (`app-sessions.ts:392` writes only an audit row), and that gap is exactly what
  makes sessions impossible to diff. We do not reproduce it.
- `waiting` and `blocked` are distinct states — the system must be able to
  distinguish "working as designed" from "stuck since Tuesday".

## Consequences

**Cost:** schema, migrations, an API surface, and a real chunk of core
modification — this is the decision that makes ADR-0001's merge burden
necessary.

**Gain:** the flow survives compaction and restart; other agents and surfaces can
join it; `ai-ui` has something to project; `ai-storage` has a scope to attach
flow-level memory to; diff and merge become possible at all.

**Risk:** over-modelling. Mitigated by shipping only the `Open` shape in M2 — the
one that is just a session with a goal, lineage and memory — and adding structure
only when real work demands it.

## Alternatives rejected

**Prompt pattern.** Fails on all three counts above; nothing to project or diff.

**Extend `tasks`.** `src/tasks/` is a status row with events and no execution
semantics. Growing it into a flow engine means rewriting it while inheriting its
schema — the worst of both. New tables, left alone.

**A flow is a session with metadata.** Tempting and wrong: it welds the unit of
work to one conversation, when the point is that work spans sessions, agents and
surfaces. A flow *references* sessions.
