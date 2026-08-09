# 05 · ai-storage — memory with an address space

<img src="assets/05-ai-storage.jpg" alt="" width="100%">

<sub>Four levels. Only one promotion arrow is built.</sub>

> **Specification.** Specified, not implemented.
>
> **Read the "Prior result" section before designing anything here.** A closely
> related claim from this organisation measured _no better than the naive
> approach_, and that result shapes this document more than any other input.


## The shape, drawn before it is built — 2026-08-09

<img src="assets/manual/11-trace-memory.jpg" alt="" width="100%">

<sub>The memory drawer on the desk, stamped <strong>NOT BUILT — THIS IS THE SPEC</strong>. Nothing in it is stored: the notes are recomputed from the flow traces on every read, which is what makes it a sketch rather than memory.</sub>

This document is a specification, and a picture is a cheaper one — an interactive
picture cheaper still, because you find out what a promotion needs by trying to
press the button. `ai-ui/src/memory.ts` draws it, and the module exists to be
argued with and then thrown away.

What the drawing commits this document to:

- **Four levels, longest-lived first**, and one rung per promotion:
  flow → project → user → system.
- **Provenance is not optional.** Every note names the flows it came from. A note
  nobody can trace back to the work that produced it is indistinguishable from a
  note somebody typed, and cannot be revisited when that work turns out to have
  been wrong.
- **Consolidation keeps what carried forward.** The steps that moved something on
  survive; the ones `contribution.ts` flagged as carrying nothing are dropped.

That last one is the cheap insight, and it is why this is not a port of
[evolving-memory](https://github.com/EvolvingAgentsLabs/evolving-memory). The
hard part of consolidating a trace — *which steps mattered* — is the question
`contribution.ts` already answers on every flow. That project calls the same job
`TraceCurator`.

**What the sketch does not answer, and this document must:** when two notes say
the same thing, which survives? Consolidation cannot be a loop over finished
flows, and that is the reason.

## Prior result, stated first

The previous flagship (`evolving-agents`) indexed every component twice — once
for what it _is_, once for what it is _for_ — on the hypothesis that retrieval
would improve. Rebuilt and measured in July 2026:

| Configuration                   |   acc@1 |   MRR |
| ------------------------------- | ------: | ----: |
| Description matching (baseline) | **80%** | 0.900 |
| Both axes, evenly weighted      | **80%** | 0.900 |
| Applicability only              | **80%** | 0.900 |

No difference. And it was _not_ a plumbing bug: `cosine(content, applicability) = 0.753`,
so the second axis was genuinely distinct information. It simply did not change
the answer on a modern encoder.

**The lesson ai-storage takes:** _adding an axis to memory is not automatically
an improvement, and the burden of proof is on the axis._ This document therefore
specifies the cheapest possible version of each idea and names what would falsify
it, rather than specifying the elaborate version and assuming it wins.

### The standing rule this becomes

The result above is not a war story about one experiment. It is the rule for
every axis proposed after it:

> **No new memory axis ships without a benchmark the baseline could lose, named
> before the axis is built.

Memory design attracts structural proposals with a great deal of prior appeal —
episodic versus semantic, short- versus long-term, consolidation passes, decay
curves, replay. Each is a real distinction somewhere. **None of them is evidence
that a retrieval system gets better by encoding it**, and the measurement above
is what an appealing structure looks like when it is finally asked for a number:
80%, 80%, 80%.

The rule costs one sentence up front and it is the cheapest guard this pillar
has. An axis that cannot name the benchmark it expects to win is not being
proposed; it is being assumed.

## There is already a memory benchmark upstream

Found after this document was first written, which is its own small lesson:
**`npm run bench:memory`** — `src/memory/bench.ts` (151 lines) plus
`scripts/memory-bench.ts`.

It runs scripted conversations through each `MemoryStrategyKind` and judges the
resulting notebook on three axes:

| Metric                   | What it asks                               |
| ------------------------ | ------------------------------------------ |
| `signalToNoise`          | how much of what was kept is worth keeping |
| `staleness`              | how much of it is no longer true           |
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

| Level       | Scope                      | Lifetime                             | Holds                                                                   | Visibility      |
| ----------- | -------------------------- | ------------------------------------ | ----------------------------------------------------------------------- | --------------- |
| **System**  | the deployment             | permanent                            | How this OS operates: conventions, defaults, hard-won operational facts | everyone        |
| **User**    | a person                   | long                                 | Preferences, voice, working agreements, standing context                | that person     |
| **Project** | a team / channel / project | project-lived                        | Decisions, constraints, domain facts, who-does-what                     | project members |
| **Flow**    | one flow                   | flow-lived, then promoted or dropped | What this specific piece of work learned                                | the flow        |

Two properties matter more than the taxonomy:

**Lifetime differs per level.** Flow memory is _expected to die_. That is the
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
`src/projects/project-store.ts`. A QM project _is_ a group scope with a reserved
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
   a graph — when level-ordered recall is _measurably_ insufficient, with the
   insufficiency written down first.

Inverting this order is exactly the mistake the 80/80 result recorded.

## How this gets falsified

**The harness:** extend `ai-base/src/memory/bench.ts` with a levelled strategy,
so ai-storage is scored by the same judge, on the same conversations, as
upstream's three. Adding a row to an existing table beats publishing a new table.

**Metrics, in order of what they actually settle:**

1. **`staleness`** (upstream's) — the claim four levels are _for_. Flow memory
   that dies with its flow should measurably reduce the stock of no-longer-true
   facts. If it does not, the level idea has failed at its own thesis.
2. **`signalToNoise`** and **`inferenceVsObservation`** (upstream's) — guards.
   Levelling must not buy staleness by discarding useful facts, or by promoting
   inference to fact at a boundary.
3. **acc@1 / MRR** on a retrieval set — kept as a secondary, and deliberately
   secondary. It is the instrument the _prior_ attempt used, and the prior
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
- Same accuracy _and_ no lifetime benefit → **ai-storage is not worth building**,
  and the upstream flat file is the right answer.

The second outcome must be reported as loudly as a success. The 80/80 benchmark
is in the previous repository's README precisely because it came back flat, and
that is the standard here.

## Experiment 1 — distil at rest (`MEMORY_STRATEGY=dream`)

The one capability this organisation invented first and the active line does not
have: **per-project evolution through a pass taken at rest.** Grep the vendored
tree for it and there are no hits — what exists is consolidation, which rewrites a
list of already-extracted bullets. So this is the cheapest experiment that asks
whether the idea is worth anything here, and it is deliberately one variable wide.

**The hypothesis.** Turn-by-turn extraction throws away signal that only the whole
arc contains. A pass that reads the raw episodes instead of pre-extracted bullets
should supersede stale facts the per-turn pass has already committed to.

**Why it is one variable.** `dream` reuses `scratch-promote`'s `PROMOTION_PROMPT`
verbatim, plus a five-line addendum that says the input is raw exchanges rather
than captures. Same rules, same judge, same conversations. The only difference
between the two arms is **what the pass is allowed to look at** — which is why
`scratch-promote` was added to the benchmark as the control in the same change.

**The instrument, named before the code:** `npm run bench:memory`, upstream's
judge, upstream's three axes, its six conversations. Two of them
(`stale-fact-supersession`, `long-project-arc`) are arc-level by construction, so
the fixtures needed no additions — if they had, that alone would have been a
reason to distrust the result.

**The claim:** `dream` lowers `staleness` against `per-turn` without losing
`signalToNoise` or `inferenceVsObservation`.

**Falsified by:** no `staleness` improvement over `per-turn`. Then distilling at
rest buys nothing on this axis, upstream's per-turn extraction is the right answer,
and the dream pass is not carried into `ai-storage`. This outcome gets published
exactly like the 80/80 one above.

### What this experiment does not measure, and must not be read as measuring

The pass writes two files. `memory/MEMORY.md` is declarative and is what the judge
reads. `memory/STRATEGIES.md` is procedural — `when <situation> -> <what to do>`,
distilled from the same episodes and recalled alongside the notebook — and the
judge **never sees it**, which is deliberate: it cannot inflate the score, and it
is equally true that this benchmark returns no evidence about it. The procedural
claim is _"a strategy learned on Monday changes what the agent does on Wednesday"_,
and settling that needs a task suite with repeated situations, not a notebook
judge. Until that exists, `STRATEGIES.md` is **[read]**, not **[ran]**.

Worse, upstream's third axis actively penalises what the procedural tier produces:
a generalisation across episodes _is_ inference rather than observation. Scoring
strategies with this judge would not be a weak measurement, it would be an
inverted one.

### Two disclosures about the arms

**`scratch-promote` carries a marker into the notebook the judge reads**
(`<!-- captures-since-promote: n -->`, stripped on recall but present on disk).
It was excluded from `KNOWN_KINDS` before this change and is included now, so its
row is scored with that artifact in it. It is one HTML comment against six
conversations, disclosed rather than corrected, because editing the judge's input
to flatter an arm is the failure mode this document exists to avoid.

**`dream` does not copy facts into a person's scope.** `ccCaptureToPersonal`
fires in the other two strategies because a per-turn capture has exactly one
speaker. A fact abstracted over a multi-actor episode does not, so promoting it
into someone's `personal:` scope would be a promotion without provenance —
forbidden by rule 1 above. The `project → user` arrow is therefore unavailable to
this strategy by design, not by omission.

### Result — the claim is falsified, and the instrument is saturated **[ran]**

2026-08-05, `HARNESS=pi`, `deepseek/deepseek-v4-flash` via OpenRouter, 24 replays,
~70 minutes. Full report:
[`ai-flows/measurements/memory-bench-2026-08-05-dream.json`](../ai-flows/measurements/memory-bench-2026-08-05-dream.json).

| strategy          | signal/noise | staleness | infer-vs-obs | overall |
| ----------------- | -----------: | --------: | -----------: | ------: |
| `dream`           |          9.8 |  **10.0** |         10.0 |     9.9 |
| `per-turn`        |          9.5 |  **10.0** |         10.0 |     9.8 |
| `scratch-promote` |          9.3 |       9.2 |          9.0 |     9.2 |
| `agent-only`      |          1.3 |       7.8 |         10.0 |     6.4 |

**The claim was that `dream` lowers `staleness` against `per-turn`. It does not —
both sit at 10.0.** By the condition written before the code, that is falsified,
and the dream pass is not carried into `ai-storage` on this evidence.

**The finding that matters more is why.** `per-turn` scores a perfect 10/10/10 on
five of the six conversations. There is no headroom left to measure in, so this
benchmark cannot separate "the treatment does nothing" from "the instrument cannot
see it" — for us or for upstream. A `staleness` of 10.0 across six conversations is
not two perfect strategies; it is six conversations that do not stress supersession
hard enough for this model. **The saturation is the reportable result**, and it
invalidates the measurement plan in _How this gets falsified_ above as written:
level-ordered recall was going to be scored on the same axis, against the same
ceiling.

**One mechanism signal survives, and it is a hint, not a result.** The single-
variable pair is `dream` against `scratch-promote` — same `PROMOTION_PROMPT`,
differing only in whether the pass reads raw episodes or pre-extracted bullets. On
`stale-fact-supersession` they diverge sharply:

|                                       | signal/noise | staleness | infer-vs-obs |
| ------------------------------------- | -----------: | --------: | -----------: |
| `dream` (raw episodes)                |            9 |    **10** |       **10** |
| `scratch-promote` (extracted bullets) |            7 |     **5** |        **6** |

The judge's note on the losing arm: _"includes a stale inference about the sync
process remaining unchanged after the move, which was later superseded."_ The
two-step pipeline **introduced** an inference that neither single-step arm made —
the intermediate representation had already discarded what was needed to know the
fact was superseded. That is the hypothesised mechanism showing up exactly where it
was predicted. It is also **n = 1 conversation**, worth 0.3 of aggregate
`signalToNoise`, and nothing should be built on it.

The same shape appears once more: `per-turn` scored 7 on `noise-heavy-debugging`
for keeping a port number and a flaky test, where `dream` scored 10 having dropped
both. Arc-level reading discarding what looked durable turn-by-turn — again n = 1.

**Two artifacts, disclosed as promised.** `scratch-promote`'s marker was in the
notebook the judge read. And the judge docked it to `infer=9` on `long-project-arc`
for _"the added dates (2026-08-05) are inferred and not explicitly stated"_ — that
is upstream's own `- (YYYY-MM-DD) fact` bullet grammar being scored as
speculation, which is a judge defect rather than a strategy defect, and it depresses
every arm that writes dates.

**What `agent-only`'s six replays bought:** 1.3 on `signalToNoise` confirms the
fixtures do contain durable facts, so the ceiling above is not an artifact of empty
conversations. That is the whole value of the null arm, and it is why it does not
need running again.

**What would actually settle this.** Not more conversations at this difficulty. The
next instrument has to be one where headroom is _checkable before the experiment
is bought_, and where the grader is not a model: the physics suite
(`ai-flows/src/tasks/physics.ts`, unrun) grades by arithmetic against an exact
oracle, counts `undetected` — a confidently stated wrong number — separately from
`detected`, and computes difficulty rather than labelling it. Run the control arm
alone first and read the `undetected` rate; if it is near zero there is no headroom
and the experiment dies for the price of one arm. That is the same failure this
result just walked into, made cheap to detect.

**The code stays.** 240 lines behind `MEMORY_STRATEGY=dream`, default unchanged, and
it is the only implementation of distillation-at-rest in the tree. It is now an
untested mechanism rather than a promised one, which is the correct state for it.

## Experiment 2 — the handoff, and a failure mode this model does not have **[ran]**

The premise, stated by the person who first built agents as markdown files: _a first
version of an agent is not optimal, and its initial fitness to be part of a
multi-agent system is not either._ If that holds, the place to find it is a handoff —
one agent finishing a step another continues — and the failure is **informational**
rather than computational, so no amount of arithmetic ability removes it. That is why
this experiment exists and why Experiment 1's atomic tasks could not have found it:
with a sandbox, the arithmetic is simply not hard
([11 § Scored, at last](11-choosing-a-model.md#scored-at-last-the-harness-lift-at-l2-is-total-ran)).

`ai-flows/src/tasks/handoff.ts` populates `structure: "sequential"`, which was a
declared type with zero instances. One physical question is split in two: an explorer
computes named quantities and writes a note; a finisher, in a different conversation
sharing the same workspace, must finish from that note alone.

### The first design was void, and the second is the result

**Run 1, 2026-08-05 — void.** Six handoffs, zero losses, every finisher passing —
_including three whose own explorer had computed the wrong intermediate._ They passed
because the finisher's prompt carried the task parameters, so it could recompute from
scratch and ignore the note entirely. **The handoff was decorative, and a channel
nobody needs cannot lose anything.** The loss rate was zero by construction. Report
kept: [`handoff-probe-2026-08-05-control.json`](../ai-flows/measurements/handoff-probe-2026-08-05-control.json).

Two fixes, and the second matters more than the first. The finisher now holds **no
task number at all** — only a symbolic formula (`T = 4·P·K(m)`, `N = K/(1 + A·B)`) —
with a test that fails if a parameter ever leaks back into its prompt, because the
leak was invisible while nothing watched for it. And completeness is now read **off
the note** rather than inferred from whether the finisher failed. That distinction is
the whole measurement: a finisher can pass by luck over an incomplete note, which is
exactly what happened to a note that was the bare string `0.04528057257316896` and got
counted as a success.

**Run 2, 2026-08-06 — no headroom, and the honest end of this line.**

|                                                       |           |
| ----------------------------------------------------- | --------: |
| handoffs                                              |         6 |
| notes carrying everything the successor needed        | **6 / 6** |
| notes omitting something (recording failure)          |     **0** |
| complete notes the finisher misread (reading failure) |     **0** |
| finishers landing inside tolerance                    |     6 / 6 |

Report and log:
[`handoff-probe-2026-08-06-control-v2.json`](../ai-flows/measurements/handoff-probe-2026-08-06-control-v2.json).
The notes say why better than the counts do. Asked only for two quantities and told
nothing about what to include, one explorer wrote:

```
# Pendulum computation — handoff
## Parameters
- L = 1.717 m
- g = 9.80665 m/s²
- Angular amplitude = 5.04°
## Results
| P = √(L/g) | 0.41843192250151073 |
| m = sin²(amplitude/2) | 0.001933195428413767 |
| K(m) (complete elliptic integral of the first kind) | 1.5715563175063318 |
| P × K(m) | 0.657589331253569 |
```

It recorded the parameters it was given, both requested quantities _with their
symbolic definitions_, an intermediate nobody asked for, and the product its successor
was about to need. Another closed with _"Both values computed with full double
precision."_ This is not a first version that needs teaching.

**So: the failure mode is not present in `deepseek-v4-flash` at this scale**, and the
gate written before the run says what to do about it — do not redesign a third time to
chase a number. Three designs already, each one moving the instrument closer to the
hypothesis; a fourth would be looking for the result rather than measuring it.

**What bounds the claim**, because it is narrow: n = 6; the tasks name the quantities
they want, and being asked for named things makes recording them natural, where an open
handoff (_"work out what is going on and pass it on"_) would not; and one note with one
purpose is the easiest possible artifact. Real recording failure most likely lives in
long, messy chains with many artifacts and no obvious answer to _what matters here_.
None of that is measured, and none of it is claimed.

## What the four instruments say together

Read separately, today produced four failures to measure evolution. Read together they
are one finding:

| instrument                         | result                                 |
| ---------------------------------- | -------------------------------------- |
| `bench:memory`, flat-file baseline | `staleness` 10.0 / 10 — saturated      |
| physics L2, bare `oneShot`         | 0 / 24 pass                            |
| physics L2, harness with sandbox   | **12 / 12 pass** — headroom 0%         |
| handoff, leak closed               | **6 / 6 notes complete** — headroom 0% |

**At this scale the harness lift is everything and the learnable residue is nothing.**
Rows two and three are the cleanest statement of it: 0% to 100% on identical tasks,
one variable. And that is not a surprise this repository should be defensive about — it
is [11](11-choosing-a-model.md)'s own argument arriving from a different direction. The
lift is enormous **and** it is not the number that decides anything.

What follows for `ai-storage` and for the dream pass is the same sentence: **there is
no measured case for either yet**, and the next honest attempt is not another
arithmetic suite. It is a domain where the shared artifact is prose or code, where
_what to record_ has no obvious answer, and where the successor cannot check for itself
whether what it received was enough.

## Experiment 3 — feedback, and why the first four instruments could not have worked

**Planned, not run.** Written before building it, per the rule this document opens with.

### The diagnosis the four null results add up to

Every instrument above shares one property, and it was invisible until all four
returned the same answer: **the correct behaviour was derivable from information the
task already contained.** Physics with a sandbox — the model computes it and checks
itself. The handoff — the finisher could recompute, and the explorer recorded what it
had used. The memory notebook — judged by the same model that wrote it.

Where the answer is derivable, a learned strategy adds nothing, because the model
simply derives it. So four instruments were built in which **learning was structurally
unnecessary**, and their agreement is not evidence about learning at all. It is
evidence that closed-form tasks cannot test it.

Learning pays only where the correct behaviour is **not** derivable — where it depends
on something outside the model:

- what _this_ organisation does, which is arbitrary by nature
- what actually happened last time in production
- what a human corrected
- what broke downstream, invisibly, hours later

**Feedback is the mechanism that introduces non-derivable information**, and
non-derivable information is the only thing a memory pass can carry that the model
could not have recomputed. That is why this experiment is not an enhancement of the
previous three; it is the first one whose premise is sound.

It also removes the problem that killed all four: if the needed fact is genuinely
absent at the first attempt, **failure is guaranteed and headroom is 100% by
construction**. It no longer has to be hunted.

And it corrects a suggestion made in closing the handoff result — that the residue
might live in a _smaller_ model. Probably wrong. A smaller model fails more often at
_deriving_, and a derivation failure is not repaired by a remembered rule either. The
residue lives in what cannot be derived, not lower down.

### Four sources, in cost order, and only the first runs tomorrow

1. **A synthetic corrector holding a hidden rule.** Deterministic, no human, exact
   oracle. The rule is one the agent cannot infer from the task — a unit convention, a
   required sanity check, an ordering constraint that only this organisation imposes.
   The agent attempts, the corrector says it is wrong and states the rule in general
   terms, the pass at rest distils it, and a **different instance** requiring the same
   rule is scored later. This is the version that fits in a day.
   **The arbitrariness is the point, not a weakness** — arbitrary is precisely what
   cannot be derived, and organisational convention is arbitrary in exactly this way.
2. **An expert AI agent as corrector.** Real critique, cheap, and it scales. One
   caution that decides whether it measures anything: whatever the stronger model
   knows, the weaker one may also be able to derive — and then this collapses back into
   the four null results above. Use the expert to produce the _critique_, and keep the
   _rule_ non-derivable.
3. **Real-world feedback.** Production traces, actual downstream failures. Highest
   value and slowest, and it needs the system in real use. `Attempt.observation`
   ([ADR-0007](adr/0007-observation-captured-not-derived.md)) is already the hook, which
   is the one piece of luck here.
4. **Human expert feedback.** Highest signal per item, lowest throughput, and the
   ground truth the other three approximate. Worth spending on the cases where 1–3
   disagree.

### The way this experiment cheats, named before it can

Feedback introduces a leak of its own, and it is the same shape as the one that voided
handoff run 1.

**If the corrector's message contains the answer, nothing is learned — a hint is
copied.** So: the corrector states the rule, never the value; and the score is taken on
a _different instance_ where the same rule applies, never on a retry of the corrected
one. A retry measures short-term instruction-following, which is not the claim.

Two more, worth writing down while the answer is unknown:

- **The rule must be checkable without the corrector.** Otherwise the evaluation
  depends on the same component under test.
- **A control arm with feedback but no persistence.** Corrected every time, remembering
  nothing. If that arm matches the treatment, the gain was the correction and not the
  memory — which is the most likely way this comes back looking like a success when it
  is not.

**Falsified by:** no gap between the treatment arm and the feedback-without-persistence
control, on held-out instances of the same rule. That is the whole claim of
distillation-at-rest, and unlike Experiment 1's condition, this one can fire.
