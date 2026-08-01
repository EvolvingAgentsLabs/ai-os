# 03 · ai-flows

> **Status: specified, not implemented.**

## The problem

QM's top-level object is the session — a conversation. Conversations are the
wrong unit for work, in four specific ways:

1. **No declared goal.** A session is whatever was said in it. Nothing states
   what "done" means, so nothing can tell you whether it happened.
2. **No survival.** Compaction summarises the conversation
   (`ai-base/src/harness/context-compaction.ts`). Work that lived only in the
   transcript is now a paraphrase of itself.
3. **No structure above the turn.** `runs` execute one turn; `cron` and
   `triggers` start turns. Nothing sequences them, resumes them after a restart,
   or reasons about a step that failed three days ago.
4. **No lineage.** Fork copies entries and forgets it forked
   (`app-sessions.ts:392`).

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
```

Keeping `attempts[]` rather than overwriting is the direct lesson from
`skill-store.ts:142` (`version += 1`, no history): a counter that discards its
past cannot be diffed, rolled back, or explained.

## Flow shapes

The user-facing point of ai-flows: **different work has different shapes, and the
system should know which one it is in.** A shape determines how the next step is
chosen, what "done" means, and what the canvas renders.

| Shape | Next step chosen by | Done when | Example |
|---|---|---|---|
| **Sequence** | Declared order | Last step done | Onboard a new employee |
| **Loop** | Repeat until condition | Condition met or budget spent | Improve until the eval passes |
| **Fan-out** | One step per item | All items done | Triage 40 inbox threads |
| **Deliberation** | N independent attempts, then judge | A winner is selected | Pick an architecture |
| **Watch** | External event | Never — it is standing work | Monitor CI and react |
| **Open** | The agent decides each time | The agent declares it | Exploratory research |

**Open** is the honest default and matters as much as the structured ones — it is
what a plain session already is, expressed as a flow so it gets goal, lineage and
memory for free. A user should never have to pick a shape to start working; they
should be able to *promote* an open flow to a structured one once the shape
becomes obvious. Requiring the shape up front is how workflow tools become
things nobody starts.

`Deliberation` and `Loop` are where lineage pays off: both produce multiple
attempts that must be compared, and comparison needs a common ancestor.

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
| Model call | `Harness` (`src/harness/harness.ts:167`) — never a vendor SDK directly |
| Conversation | `src/sessions/` — a flow references sessions, does not reimplement them |
| Waking | `src/cron/`, `src/triggers/` |
| Approval / policy | Unchanged. A flow gets **no** exemption from the security posture |
| Isolation | The scope's existing sandbox |
| Flow + step records | **New Postgres tables, `flow_` prefix, no upstream table altered** |

## Open questions

Not answered here on purpose — answering them before the first flow runs is
guessing.

1. **What can a step be?** Only a model turn (expensive, sometimes absurd — a
   step that renames a file should not cost a turn) or arbitrary code (which
   makes this a general workflow runtime, a much larger project)? Leaning:
   start with turns only, add a narrow set of native steps when the pain is real.
2. **One session or many?** Does a flow own one session, or reference several
   across agents and surfaces? Multi-agent work is the second; simplicity is the
   first.
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
