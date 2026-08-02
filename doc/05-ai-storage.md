# 05 · ai-storage — memory with an address space

> **Status: specified, not implemented.**
>
> **Read the "Prior result" section before designing anything here.** A closely
> related claim from this organisation measured *no better than the naive
> approach*, and that result shapes this document more than any other input.

## Prior result, stated first

The previous flagship (`evolving-agents`) indexed every component twice — once
for what it *is*, once for what it is *for* — on the hypothesis that retrieval
would improve. Rebuilt and measured in July 2026:

| Configuration | acc@1 | MRR |
|---|---:|---:|
| Description matching (baseline) | **80%** | 0.900 |
| Both axes, evenly weighted | **80%** | 0.900 |
| Applicability only | **80%** | 0.900 |

No difference. And it was *not* a plumbing bug: `cosine(content, applicability) = 0.753`,
so the second axis was genuinely distinct information. It simply did not change
the answer on a modern encoder.

**The lesson ai-storage takes:** *adding an axis to memory is not automatically
an improvement, and the burden of proof is on the axis.* This document therefore
specifies the cheapest possible version of each idea and names what would falsify
it, rather than specifying the elaborate version and assuming it wins.

## There is already a memory benchmark upstream

Found after this document was first written, which is its own small lesson:
**`npm run bench:memory`** — `src/memory/bench.ts` (151 lines) plus
`scripts/memory-bench.ts`.

It runs scripted conversations through each `MemoryStrategyKind` and judges the
resulting notebook on three axes:

| Metric | What it asks |
|---|---|
| `signalToNoise` | how much of what was kept is worth keeping |
| `staleness` | how much of it is no longer true |
| `inferenceVsObservation` | how much was inferred rather than observed |

**`staleness` is one of the two metrics this document proposed inventing.** The
third, `inferenceVsObservation`, is one we had not thought of and is arguably
sharper than either — a memory system that quietly promotes inference to fact is
failing in a way retrieval accuracy cannot see.

So the measurement plan below is rewritten around extending this harness rather
than building a parallel one. Writing our own scale would have made our numbers
incomparable with upstream's, which is the specific way benchmarks get used to
flatter their author.

## What exists today

`ai-base/src/memory/memory-service.ts`. One markdown file per scope:

- `memory/MEMORY.md`, bullets as `- (YYYY-MM-DD) fact`
- capped at `MAX_FACTS = 300`; **overflow drops the oldest**
- dedup by normalized text
- untrusted provenance defanged textually (`(said in X)` → `[claimed source: X]`)
- sha256 revision tokens, with optional `history` / `restore` / `replaceIfRevision`
- `query(scopeId, q, limit)` is the only retrieval affordance

This is a better design than it looks. Its real limits are two: **FIFO is the
only forgetting policy**, and **a scope is the only address**.

## The four levels

| Level | Scope | Lifetime | Holds | Visibility |
|---|---|---|---|---|
| **System** | the deployment | permanent | How this OS operates: conventions, defaults, hard-won operational facts | everyone |
| **User** | a person | long | Preferences, voice, working agreements, standing context | that person |
| **Project** | a team / channel / project | project-lived | Decisions, constraints, domain facts, who-does-what | project members |
| **Flow** | one flow | flow-lived, then promoted or dropped | What this specific piece of work learned | the flow |

Two properties matter more than the taxonomy:

**Lifetime differs per level.** Flow memory is *expected to die*. That is the
point: today, every fact learned anywhere becomes something the system believes
forever, and 300-bullet FIFO is the only thing standing between that and
unbounded drift.

**Promotion is explicit and reversible.** A flow fact becomes a project fact only
by promotion, which records why and by whom, and can be undone. Silent promotion
is how a one-off workaround becomes an organisational belief.

## Promotion

```
flow ──promote──▶ project ──promote──▶ system
  │                  │
user ◀───────────────┘   (a fact about a person, learned in shared work)
```

Rules:

1. **Never automatic without a record.** Automatic promotion is allowed;
   unrecorded promotion is not. Every promotion carries source level, source id,
   actor (human or agent), timestamp, reason.
2. **Reversible.** Demotion restores the prior state at every level touched.
3. **No skipping.** Flow facts do not become system facts directly. Two
   independent decisions, not one.
4. **Conflict is surfaced, not merged.** If a promoted fact contradicts one
   already held, the system does not silently pick. Contradiction detection is
   the expensive part and is explicitly deferred to v2.

Implementation note: this is a `MemoryStrategy`
(`ai-base/src/memory/strategy.ts:14` — `onTurnEnd` / `maintain` / `promptLines`),
not a new subsystem. The selectable strategies are
`per-turn | scratch-promote | agent-only` (`strategy.ts:28`), and the
consolidation machinery they share lives in `strategies/consolidation.ts` — a
module to build on, not a fourth kind to imitate.

**One arrow of this diagram is already built.** `ccTargetFor` /
`ccCaptureToPersonal` (`memory-service.ts:158,166`) copy a fact learned in a
shared scope into the acting person's `personal:` scope with the source labelled,
firing only for `channel` / `group` origins and never for system actors. It is
wired into two of the three strategies (`per-turn.ts:140`,
`scratch-promote.ts:167-170`). That is `project → user`, in production today —
so the arrows ai-storage actually has to build are `flow → project` and
`project → system`, and the first is blocked on a `flow` scope existing at all.
**[read]**

## How it attaches

`ai-storage` implements QM's `MemoryService` (`src/memory/memory-service.ts:28`)
and registers in `src/wiring.ts`. All five required methods plus the optional
revision family, which we implement rather than skip — history is the affordance
that makes promotion reversible.

The scope-kind problem: QM's union (`src/types.ts:12`) is
`personal | channel | team | org | group`. Our four levels map to
`org` / `personal` / `group` / **nothing**. There is no flow scope, and
`org` is not quite "system". Resolution in
[ADR-0003](adr/0003-storage-scope-axis.md): add `flow` and `system` to the union
inside `ai-base` — a two-line widening, recorded in `AI-OS-PATCHES.md` and offered
upstream — rather than encoding a fake scope in the `ref` string, which would be
invisible to every permission check that parses a `ScopeId`.

That last clause is the actual reason: a fake scope silently bypasses ACLs.

**The project level maps to `group`, not `team`** — corrected here after reading
`src/projects/project-store.ts`. A QM project *is* a group scope with a reserved
ref prefix (`projectScopeId(id) → group:web-project-<id>`, `project-store.ts:47`),
carrying a roster (`ownerId`, `memberIds`) and a version per roster. `team:`
comes from `Principal.teamIds` — identity-provider teams, not project rosters.
The scale axis and its consequences are [09](09-scales.md). **[read]**

## Retrieval

Deliberately boring in v1, given the prior result:

1. **Level-ordered recall.** Assemble context from flow → project → user →
   system, with a budget per level. Nearer levels win ties.
2. **Keep `query()` as upstream has it.** No embedding layer in v1.
3. **Then measure.** Only add retrieval machinery — embeddings, a second axis,
   a graph — when level-ordered recall is *measurably* insufficient, with the
   insufficiency written down first.

Inverting this order is exactly the mistake the 80/80 result recorded.

## How this gets falsified

**The harness:** extend `ai-base/src/memory/bench.ts` with a levelled strategy,
so ai-storage is scored by the same judge, on the same conversations, as
upstream's three. Adding a row to an existing table beats publishing a new table.

**Metrics, in order of what they actually settle:**

1. **`staleness`** (upstream's) — the claim four levels are *for*. Flow memory
   that dies with its flow should measurably reduce the stock of no-longer-true
   facts. If it does not, the level idea has failed at its own thesis.
2. **`signalToNoise`** and **`inferenceVsObservation`** (upstream's) — guards.
   Levelling must not buy staleness by discarding useful facts, or by promoting
   inference to fact at a boundary.
3. **acc@1 / MRR** on a retrieval set — kept as a secondary, and deliberately
   secondary. It is the instrument the *prior* attempt used, and the prior
   attempt measured 80% either way. Leading with it would mean betting the pillar
   on the one number that has already come back flat.

**The claim:** level-ordered recall lowers `staleness` against the flat-file
baseline without losing `signalToNoise` — bounding what the system believes
forever, which is the thing one flat file cannot do at all.

**The baseline is already observed**, not assumed — this is what a real turn
wrote to disk on 2026-08-01:

```
data/workspaces/personal__matias/memory/MEMORY.md
- (2026-08-01) User is building ai-os, an agent operating system.
- (2026-08-01) Flagship repo is EvolvingAgentsLabs/ai-os.
```

**Two ways this fails, both reportable:**

- Same accuracy → the levels are bookkeeping, not retrieval. Possibly still
  worth it for the lifetime property alone, but the retrieval claim is dropped.
- Same accuracy *and* no lifetime benefit → **ai-storage is not worth building**,
  and the upstream flat file is the right answer.

The second outcome must be reported as loudly as a success. The 80/80 benchmark
is in the previous repository's README precisely because it came back flat, and
that is the standard here.
