# ADR-0007 · An attempt's observation is captured when it closes, never derived later

**Status:** Accepted · 2026-08-04

## Context

Every question worth asking about a running flow — has it moved, is it stuck, did
this attempt do anything the last one did not — is a comparison between the state
after one attempt and the state after the next. Making that comparison requires a
record of what each attempt produced.

The obvious design is to keep flows thin and derive the record on demand from the
base: an attempt already carries `runId`, so read the run and reconstruct.

**That design is not available, and the reason is a constant.**

Upstream's per-turn telemetry lives in `run_activity`, and it is a cache with an
hour on it — **[read]**:

```ts
export const RUN_ACTIVITY_TTL_MS = 60 * 60_000;   // run-activity-store.ts:16
```

Both backends enforce it. The Postgres store imports the same constant and prunes
on a one-minute timer:

```ts
await q("DELETE FROM run_activity WHERE created_at < $1",
        [t - RUN_ACTIVITY_TTL_MS]);              // postgres-run-activity-store.ts:30
```

There is also a `MAX_PER_RUN = 2_000` entry cap, and `run_activity` is **exposed
on no API route at all** — `grep -rn activity ai-base/src/api/routes/` returns
nothing **[read]**. What `GET /v1/runs/:id` does return is the `Run` record:
status, attempt counts, lease and timestamps (`run-store.ts`, `turns.ts:160`).
Useful, and not a record of what the turn produced.

The collision with the flow model is direct. A flow's entire purpose is to span
days — *"a flow started on Monday is resumed on Wednesday"*
([08 M2](../08-roadmap.md)). **By Monday at 13:00 the evidence of Monday's
attempt is deleted.**

## Decision

**An observation is written to `flow_attempts` at the moment the attempt closes.
It is never reconstructed afterwards, and never inferred.**

```ts
export interface Observation {
  digest: string;        // fingerprint of the state this attempt produced
  value: number | null;  // only where the shape declares a metric
  source: string;        // what produced the digest — recorded, never inferred
  at: number;
}
```

Four consequences, each deliberate:

1. **Optional, and absent means absent.** An attempt closed without an
   observation keeps `null` forever. Absence is not evidence of sameness, and the
   store never invents a digest to fill the gap.
2. **A digest, not a score.** Distinguishability is defined for every shape;
   magnitude is defined only where a shape declares a metric, and no shape does
   today. `value` is `null` everywhere until `Loop` lands in M6.
   Inventing a score for `Open` would contradict the definition that separates
   the two shapes ([03](../03-ai-flows.md#loop--until-it-is-good-enough)).
3. **`source` is mandatory when an observation exists.** Two flows fingerprinted
   by different methods are not comparable, and a stored digest with no
   provenance is a number that will eventually be compared with the wrong thing.
4. **Nullable columns on a `flow_` table.** No upstream table is altered,
   consistent with [ADR-0006](0006-ai-flows-lives-outside-core.md) and
   [03](../03-ai-flows.md#how-it-sits-on-ai-base). Stated as `ALTER TABLE … ADD
   COLUMN IF NOT EXISTS` so a database created by M2's first slice reaches the
   same shape as a fresh one.

## Consequences

**Costs.** The flow store grows a responsibility it would rather not have —
capturing evidence at the right instant — and whoever advances the flow must
supply the observation, because by the time anything else asks, it is gone. That
is worse than deriving it, and it is the only option on the table.

**What it buys.** Attempt history becomes durable evidence rather than a list of
timestamps. `attempts[]` already exists precisely because *"a counter that
discards its past cannot be diffed, rolled back, or explained"*
([03](../03-ai-flows.md#a-step)); this is that argument applied to the *content*
of an attempt rather than to its count. It is also what
[10-observability](../10-observability.md) reads, and what M3's flow diff will
need before it can compare two branches on anything but text.

**The upstream-first question, asked and answered.** The right fix might look
like raising `RUN_ACTIVITY_TTL_MS` or exposing an activity route upstream. It is
not: the TTL and the 2,000-entry cap are the behaviour of a *live-view cache* for
a UI that follows a turn, and turning it into a durable audit log is a different
component with different storage economics — a change to QM's design, not a bug
fix. Wanting a change in `ai-base` is evidence the design above it is wrong; here
the design above it is right and the base is simply not the place the evidence
should live.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Derive from `run_activity` on demand | Deleted after 60 minutes in both backends, capped at 2,000 entries, exposed on no route. Flows span days |
| Store the full turn output on the attempt | Unbounded growth, and it makes `flow_attempts` a second transcript — the object [04](../04-ai-ui.md) argues against |
| Put it on the step instead of the attempt | `flow_steps.result` is already one value per step, overwritten. A repeat is only visible *across* attempts, which is exactly what the retry history is for |
| Wait for a numeric eval and store that | Only `Loop` has one, `Loop` is M6, and `Open` is what M2 ships. The comparison would be unavailable for the whole milestone that has to justify the repository |
