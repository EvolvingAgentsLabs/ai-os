# 03 · ai-flows

<img src="assets/03-ai-flows.jpg" alt="" width="100%">

<sub>Six shapes. The last one never finishes, on purpose.</sub>


> **Reference.** The `Open` shape runs; every other shape is still specification.
>
> Built and proven live on 2026-08-06/07 **[ran]**: the flow store, the engine
> (a flow started by one process and finished by another — 6/6 on `pi` and on
> `mock`), the signed HTTP client and API, fork with lineage, an observation per
> attempt, and multi-agent composition from a markdown-declared `subagents:` tree.
> See [08-roadmap § M2](08-roadmap.md) for the deliverable-by-deliverable state and
> [the manual](manual.md) for how to run it.
>
> **Not built:** `Sequence`, `Loop`, `Fan-out`, `Deliberation`, `Watch` — the five
> shapes below are still specification, and so is merge. Promotion from `Open` to
> a structured shape is likewise unbuilt.

## The problem

QM's top-level object is the session — a conversation. Conversations are the
wrong unit for work, in four specific ways:

1. **No declared goal.** A session is whatever was said in it. Nothing states
   what "done" means, so nothing can tell you whether it happened.
2. **No survival.** Compaction summarises the conversation
   (`ai-base/src/harness/context-compaction.ts`). Work that lived only in the
   transcript is now a paraphrase of itself.
3. **No structure above the turn.** `runs` execute one turn; `cron`, `triggers`
   and `monitors` start turns. Nothing sequences them or reasons about a step
   that failed three days ago.
4. **No lineage.** Fork copies entries and forgets it forked
   (`app-sessions.ts:392`).

**One thing this list used to claim and should not.** An earlier draft said
nothing resumes after a restart. That is false: `src/core/turn-resume.ts`
recovers an interrupted turn, counts attempts and audits the resumption. The gap
is narrower and more precise than the overstatement — *a turn* is recoverable,
*a piece of work* is not. Overstating it made the case sound stronger and made
the design worse, because it hid the fact that turn-level recovery is machinery
`ai-flows` should build on rather than duplicate.

A **flow** is the object that fixes all four.

## Definition

> A **flow** is a declared, persisted, resumable unit of work with a goal, a
> shape, a state, and a lineage. It outlives any session, run or process that
> serves it.

The turn stops being the top-level object and becomes an implementation detail
of a step.

## The model

```
Flow
├─ id, scopeId, title
├─ goal          — what "done" means, in text and (optionally) as a check
├─ shape         — the flow kind (see below); determines how steps are chosen
├─ state         — draft | running | waiting | blocked | done | abandoned
├─ lineage       — forkedFrom { flowId, atStep } | null   ← first-class, unlike QM sessions
├─ steps[]       — ordered, each with its own state and result
├─ artifacts[]   — files, apps, messages the flow produced (addressed, not inlined)
└─ memory        — flow-level scope in ai-storage (see 05)
```

`waiting` and `blocked` are distinct on purpose. **Waiting** is the flow's own
choice — a scheduled continuation, a pending approval, an external event.
**Blocked** is failure to proceed. Collapsing them is how systems end up unable
to tell "working as designed" from "stuck since Tuesday", which is precisely the
question an operating system has to answer.

### A step

```
Step
├─ intent       — what this step is for
├─ execution    — how it runs (see the open question below)
├─ state        — pending | running | waiting | done | failed | skipped
├─ result       — structured output + a pointer to the run that produced it
└─ attempts[]   — every try, kept; failure is history, not an overwrite
      └─ observation — what this attempt was observed to produce, captured
                       when it closes. Optional, never inferred (ADR-0007)
```

Keeping `attempts[]` rather than overwriting is the direct lesson from
`skill-store.ts:142` (`version += 1`, no history): a counter that discards its
past cannot be diffed, rolled back, or explained.

<img src="assets/manual/07-composed-flow.jpg" alt="" width="100%">

<sub>The model above, rendered from a live instance. One flow, three steps, each with its intent, state, result and attempts — and each attempt carrying the observation digest captured when it closed. The strip under the goal is one cube per step, so <strong>where it stopped</strong> is visible before anything is read. <strong>[ran]</strong> 2026-08-09.</sub>


## Flow shapes

**Different work has different shapes, and the system should know which one it is
in.** A shape is a real object, not a label: it determines how the next step is
chosen, what "done" means, what the canvas renders, and — the part that matters
for [the multiplayer problem](../README.md#the-problem-ai-is-still-single-player)
— *what a second person can do to the flow without breaking it*.

Six shapes. Each is defined below on the same seven fields, because a shape whose
handoff and termination are unspecified is a name, not a definition.

### Definition template

| Field | Why it is in every definition |
|---|---|
| **For** | The kind of work. If you cannot name it in a phrase, the shape is wrong |
| **Next step** | How the engine picks what runs next |
| **Done** | The success condition. A shape with no terminating condition is a bug, not a feature |
| **Fails when** | The state that means *stuck*, distinct from `waiting` |
| **Handoff** | What a second person can do — the multiplayer contract |
| **Without subagents** | How it completes on `pi`. Every shape must, per the [portability constraint](#the-portability-constraint) |
| **Do not use for** | The misuse that makes it collapse into another shape |

---

### `Open` — the default

- **For:** work whose shape is not known yet. Exploratory research, a question
  that turns into a project.
- **Next step:** the agent decides each time.
- **Done:** the agent declares it, or a person does.
- **Fails when:** the goal has not moved across N steps — drift, not failure.
  **And "has not moved" is a measurement, not an observation**: two attempts of
  identical work do not reliably produce identical state, so this rule has a
  false-change rate and it has to be known before the rule means anything. The
  split it hides — *drift* (legible, stopped) versus *unreadable* (moving as far
  as anyone can tell) — is [10-observability](10-observability.md).
- **Handoff:** anyone in scope reads the goal and the step history and continues.
  This is the minimum multiplayer contract and every other shape inherits it.
- **Without subagents:** natively — it is one agent working.
- **Do not use for:** work you already know is a `Sequence`. `Open` is honest
  about uncertainty, not a way to avoid declaring structure you have.

**`Open` is the one that has to exist.** It is what a plain session already is,
expressed as a flow so it gets a goal, lineage and memory for free. Nobody should
have to pick a shape to start working; they should be able to **promote** an open
flow to a structured one once the shape becomes obvious, keeping its history.
Requiring the shape up front is how workflow tools become things nobody starts.

### `Sequence` — declared order

- **For:** work with known steps in a known order. Onboarding, a release
  checklist, a compliance procedure.
- **Next step:** the next undone step in the declared order.
- **Done:** the last step is done.
- **Fails when:** a step fails and has no retry left. Later steps are `blocked`,
  not `skipped` — the distinction is what makes the flow diagnosable.
- **Handoff:** step-level. A person can own step 4 while the agent runs 5, and
  ownership is a property of the step. This is the shape closest to how teams
  already divide work.
- **Without subagents:** natively — steps are sequential by definition.
- **Do not use for:** work where the order is a guess. A `Sequence` that gets
  reordered every run was an `Open` flow.

### `Loop` — until it is good enough

- **For:** improvement against a measurable condition. "Iterate until the eval
  passes."
- **Next step:** repeat the body with the previous attempt's result.
- **Done:** the condition holds.
- **Fails when:** the budget is spent, or the metric stops improving across N
  iterations. **A `Loop` without a declared budget is not a valid flow** — the
  engine refuses to start one.
- **Handoff:** a person can change the *condition* mid-flight. That is the
  interesting multiplayer move: redirecting the target without discarding the
  attempts already made.

  **Recorded as a risk, not designed against yet.** Two people adjusting one
  loop's target, each reacting to results produced before the other's change
  landed, is delayed feedback around a closed loop, and it oscillates. Inside a
  single run this cannot happen — runs are serialised per session and `steer`
  interleaves through one live run ([The concurrency
  constraint](#the-concurrency-constraint)) — so the exposure is *across* runs
  and days, which is precisely the handoff this field advertises. The standard
  remedies are one controller at a time, rate-limited redirection, or explicit
  damping. **None is chosen here.** `Loop` is M6; picking a remedy before
  observing the failure is guessing with extra steps.
- **Without subagents:** natively — iterations are sequential.
- **Do not use for:** work with no measurable condition. Without one this is an
  `Open` flow with a false promise of termination.

### `Fan-out` — one step per item

- **For:** the same work over many items. Triage 40 threads, migrate 200 files.
- **Next step:** every item is independent; order is not meaningful.
- **Done:** every item reaches a terminal state — including `skipped`.
- **Fails when:** the failure *rate* crosses a threshold. One failed item is
  data; forty is a broken flow, and the shape should say so rather than grinding
  to the end.
- **Handoff:** by item. Two people and an agent can each take a slice, and the
  flow remains one object. This is the shape that most obviously beats a chat.
- **Without subagents:** sequentially, slower. Subagent fan-out is the fast path,
  **never a requirement** — a `Fan-out` that does nothing on `pi` is broken.
- **Do not use for:** items that depend on each other. That is a `Sequence`
  wearing a disguise, and it will deadlock or corrupt.

### `Deliberation` — N attempts, then judge

- **For:** decisions with a wide solution space. Pick an architecture, choose a
  migration strategy.
- **Next step:** N independent attempts from declared angles, then a judging step.
- **Done:** a winner is selected **and the reason is recorded.** An unrecorded
  choice makes the whole shape pointless — nobody can revisit it.
- **Fails when:** the judge cannot separate the attempts. That is a real outcome
  ("these are equivalent"), not an error, and must be reportable as such.
- **Handoff:** **a person can be one of the attempts, or be the judge.** This is
  the shape where human and agent participate as peers rather than as
  operator-and-tool.
- **Without subagents:** attempts run sequentially with the others hidden —
  independence is a property of *context isolation*, not of parallelism.
- **Do not use for:** decisions already made. A `Deliberation` staged to justify
  a foregone conclusion is worse than no flow, because it launders the decision.

### `Watch` — standing work

- **For:** reacting to external change. Monitor CI, watch a queue, track an inbox.
- **Next step:** an external event, via `src/triggers/` or `src/monitors/`.
- **Done:** **never.** It is standing work, and the state model must accept that
  rather than treating it as unfinished.
- **Fails when:** the trigger source is unreachable, or the reaction fails
  repeatedly. Silence must be distinguishable from health — a `Watch` that has
  seen nothing for a week is either calm or broken, and only the flow knows.
- **Handoff:** ownership transfers; the watch does not restart. Handing off a
  standing responsibility without dropping it is exactly the operational problem
  a shared chat cannot solve.
- **Without subagents:** natively — reactions are single turns.
- **Do not use for:** a one-off wait. That is a `waiting` step in another flow.

---

### Which pay for lineage

`Deliberation` and `Loop` produce multiple attempts that must be compared, and
comparison needs a common ancestor — this is where `forkedFrom` earns its place.
`Fan-out` produces the most handoff traffic, and is the best first proof that a
flow beats a chat. `Open` is the one that must ship first, because everything
else is a promotion of it.

## Lineage: fork, diff, merge

Forking a flow records `forkedFrom { flowId, atStep }`. Because the ancestor is
explicit, two things become possible that QM cannot do today:

- **diff** — compare two flows: which steps diverged, which artifacts differ,
  which conclusions conflict.
- **merge** — bring a branch back. Artifacts that differ in different files are
  mechanical. **Two different conclusions about the same file is the interesting
  case**, and it is unsolved: it needs a reconciler, not a text merge.

This is stated as an open problem rather than a feature. The organisation has
built exactly this reconciliation seam before, and the honest lesson from it is
that the merge algorithm is easy and *deciding what a conflict is* is the whole
difficulty.

**Order of construction: `diff` first, and it stands alone.** If merge never
ships, diff over two forked flows is still the most useful thing here.

## How it sits on ai-base

A flow **composes** upstream primitives; it does not replace them.

| Flow concept | Runs on |
|---|---|
| Step execution | `src/runs/` — a step's attempt is a run |
| Turn-level crash recovery | `src/core/turn-resume.ts` — **reused, not rebuilt** |
| Model call | `Harness` (`src/harness/harness.ts:167`) — never a vendor SDK directly |
| Conversation | `src/sessions/` — a flow references sessions, does not reimplement them |
| Waking | `src/cron/`, `src/triggers/`, `src/monitors/` |
| Sub-agent fan-out within a step | `src/tasks/` — **read and linked, never owned** ([ADR-0004](adr/0004-flows-and-the-subagent-record.md)) |
| Tool surface | `execute, read, write, publish, memory, history, background` |
| Approval / policy | Unchanged. A flow gets **no** exemption from the security posture |
| Isolation | The scope's existing sandbox (**needs a locally built Docker image**) |
| Flow + step records | **New tables, `flow_` prefix, no upstream table altered** |

## The portability constraint

**Revised 2026-08-06.** This section used to open: *"subagent delegation and
OpenRouter models live on disjoint sets of harnesses — `pi` gets cheap models and
no subagents."* That premise is dead. `pi` now delegates, through workspace-defined
markdown agents, while keeping OpenRouter (corrected matrix in
[01-architecture](01-architecture.md#the-harness-capability-matrix)). The three
design rules below survive the correction, but only one of them still has its
original reason.

1. **A flow must complete on a harness with no subagents.** Unchanged, and it is
   now `mock` rather than `pi` that makes it bite. Fan-out is an optimisation a
   step *may* use, never a requirement. A flow that silently does nothing where
   delegation is absent is a broken flow.
2. **`Fan-out` and `Deliberation` shapes cannot assume subagents.** Unchanged.
   Both can be served by sequential steps; parallelism is the fast path, not the
   only path.
3. **The eval must run on both.** Unchanged in force, changed in what "both"
   means. The disjointness that made this a cost trade-off is gone; what remains
   disjoint is **where the agent is defined** — a file in the scope's workspace on
   `pi`, a hardcoded or CLI-owned definition everywhere else. An eval tuned on
   one still generalises to the other only by luck.

The genuinely new consequence, and the one this section previously could not
have: **delegation on the default harness leaves no durable record.** `pi` writes
no `tasks` rows, so a step that fans out returns its children's reports and
nothing else. ADR-0004 said a flow reads the subagent record and never owns it;
on `pi` there is no record to read. A flow that wants to know what its children
did has to capture it in the attempt's observation ([ADR-0007](adr/0007-observation-captured-not-derived.md)),
which is the mechanism that already exists for exactly this reason.

This is also the strongest argument yet for the `Harness` seam: the moment a
flow reaches past it into a specific harness's subagent machinery, `ai-flows`
becomes portable in name only.

## The concurrency constraint

A second constraint, found in the run store rather than the harness layer, and it
bounds every multi-participant flow. `postgres-run-store.ts:149` **[read]**:

```sql
SELECT id FROM runs WHERE status='pending'
  AND session_id NOT IN (SELECT session_id FROM runs WHERE status='running')
ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
```

**Runs are serialised per session.** Two people cannot have two runs executing
against one session, which means a flow bound to a single session is
single-threaded no matter how many participants it has. What upstream offers
instead is interleaving: a second message into a live run arrives as a signal
(`RunSignalKind = "abort" | "steer"`, `run-signal-store.ts:3`) routed at
`app-turn.ts:326-338` and applied mid-turn.

Two design consequences:

1. **Parallelism inside a flow requires several sessions**, which turns open
   question #2 below from a matter of taste into a prerequisite for any shape
   that fans out — `Fan-out` and `Deliberation` both.
2. **The multiplayer contract in each shape's Handoff field is served by `steer`
   today, not by concurrency.** A shape that assumes two participants acting
   simultaneously is specifying a primitive that does not exist.

The membership guard is already decided too: if a project roster version moves
mid-work, the turn is refused rather than silently continued
(`app-turn.ts:102-106,337`). A flow engine that enqueues runs goes through that
guard; it does not re-decide it. Scale-by-scale detail is in
[09-scales](09-scales.md).

## Open questions

Not answered here on purpose — answering them before the first flow runs is
guessing.

1. **What can a step be?** Only a model turn (expensive, sometimes absurd — a
   step that renames a file should not cost a turn) or arbitrary code (which
   makes this a general workflow runtime, a much larger project)? Leaning:
   start with turns only, add a narrow set of native steps when the pain is real.
2. **One session or many?** Does a flow own one session, or reference several
   across agents and surfaces? Multi-agent work is the second; simplicity is the
   first. **Sharpened by [the concurrency constraint](#the-concurrency-constraint):**
   one session means the flow is single-threaded, so this question has to be
   answered before any collective or fan-out work, not during it.
3. **Who advances the flow — the agent or the engine?** The engine advancing is
   predictable; the agent advancing is what makes it an *agent* OS. Probably
   shape-dependent, which is an argument for shapes being real objects.
4. **What is a conflict between two conclusions?** Unsolved, above.

## How this gets falsified

**The measurement:** take real multi-day, multi-step work. Run it as a plain QM
session and as a flow. Compare completion, and compare recovery after an
interruption (restart, compaction, a week's gap).

**The claim:** the session loses work at the interruption and the flow does not.

**If they perform the same, ai-flows is not worth its maintenance cost** — it is
the pillar that forces the fork, so it carries the highest burden of proof of the
four. That verdict is acceptable and must be reported if it happens.
