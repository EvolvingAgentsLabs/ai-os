# 00 · Vision

<img src="assets/00-vision.jpg" alt="" width="100%">

<sub>Scattered talk becoming one durable object.</sub>

> **Project.** Why this exists. Nothing here is a claim about running software.


## The question this has to answer first

Because it is the one the project actually gets asked, and it is a fair question:

> **Why are you building another agent framework?**

The answer that was true in 2025 was *because agents that evolve on their own do
not exist yet*. That answer has expired. They exist, several of them are funded,
and this organisation's own attempt at it is archived with 453 stars on it.

The answer that is true now is narrower and it is not about generation at all:

> **Everyone can generate. Almost nobody can tell you, six months later, whether
> the number in their README is still the number their code produces — and prove
> it to a stranger.**

That is the layer this repository builds, and it is the reason the four pillars
below are *how* rather than *why*. A flow engine, a canvas and a memory address
space are all categories with well-funded competitors; **truth that the code
under test cannot produce** is not.

### What that means concretely, and all of it runs

| | |
|---|---|
| **Truth from outside the code** | `truth/` must not import `src/`. Closed forms on one side, the solver on the other, a gate comparing them. Four words of policy, and the load-bearing structure of a whole thesis |
| **A kernel that does not care what language the work is in** | a Python process writes a JSON gate report; a TypeScript kernel parses, summarises and decides, and executes nothing. That is the operating-system claim, and it is the one with a running seam behind it |
| **"Did not run" is not "passed"** | the freeze verdict returns `blockers` and `unknown` as separate lists and refuses on either |
| **Attestation instead of assertion** | content-addressed runs, a hash-chained ledger, `make reproduce`, and the environment recorded inside the artifact so a comparison can tell *disagrees* from *was produced somewhere else* |
| **Every published number tied to its producer** | five of the nine numbers this repository publishes are checked against the artifact that produced them, nightly ([19 §8](19-what-would-make-this-matter.md#8--every-published-number-and-what-checks-it)) |

### The strong version of this argument is measured false, and we measured it

The pitch that would sell better is *"a model cannot tell whether its own output
is wrong."* It is not true. A companion experiment gave a frontier model twelve
fabricated physics results and nine subtly defective ones and it caught **all of
them**, twice, naming causes at the level of *"the boundary treatment at the free
end fails to halve the control volume"*
([results](https://github.com/EvolvingAgentsLabs/physics-verifiers/blob/main/experiments/judge_vs_physics/RESULTS.md)).

So the claim is the narrow one that survives it, and it is worth stating exactly:

- **A model can judge a task. It cannot generate one with a known answer.** You
  do not create truth by asserting it, however good the assertion is.
- **A judge that is right every time still hands you no ledger, no freeze and no
  reproduction command.** Detection is not the same product as attestation, and
  the second is what a reviewer, a regulator or a colleague six months later
  needs.

### What it bought, in one day, on this repository

The instruments were finished on 2026-08-23 and immediately run by somebody who
had never run this system. They found five things, none of which was reachable by
reading the code ([19 §7](19-what-would-make-this-matter.md#7--what-running-p0-found-on-the-same-day)):

1. A published count that had been wrong in thirteen places for six days.
2. An **attested artifact that could not have been produced by the code committed
   beside it** — the report was regenerated in the middle of the commit that
   existed to make it reproducible, and nothing looked.
3. A reported statistic that moves with a **library version** rather than with
   the data — 66 of its 98 measurements are exactly zero, and one value crossing
   into that tie block drags a rank statistic 0.054.
4. A transposed row in a table nobody had ever compared to its own artifact.
5. A defect in the new instrument itself, found by using it.

Neither project could even be started from its own documentation. That is what a
verification layer is worth, and none of it is an argument — it is a list of
things that were wrong and are not any more.

## The claim

Agents today are **applications**. ai-os is the argument that they should be an
**operating system** — and that the difference is not branding, but four specific
missing abstractions.

### The same gap, said the other way

Y Combinator, 2026-07-31 —
[@ycombinator](https://x.com/ycombinator/status/2079963728439832823):

> The best work tools became more powerful when they became multiplayer. But AI
> is still mostly trapped in private chats, with agents working in sessions that
> teammates can't join or influence.

That is this document's argument arriving from the opposite direction. We reached
it from *"an operating system needs a unit of work"*; they reach it from *"work is
multiplayer"*. Both land on the same object.

The bridge is one sentence: **you cannot hand off a conversation.** A handoff
needs something with a declared goal, a current state and a history — something a
second person can open, read, redirect and take over. A session is none of those.
It is private to its participants, summarised away by compaction, and forked
without recording that it forked. The unit is wrong, so everything above it is
single-player by construction.

Worth keeping honest about which claim we are making: theirs says *"in real
time"*. Ours is **asynchronous multiplayer** — a durable object several people act
on across days, hand off, fork and rejoin. Real-time co-presence is a legitimate
goal and not the one we build toward first ([04-ai-ui](04-ai-ui.md#scope-of-v1)
excludes simultaneous editing from v1). Handing off work that is *still running*,
without losing what it learned, is the harder half and the part nobody has.

An operating system earns the name when it owns four things: how work is
scheduled and survives interruption, how resources are isolated between tenants,
how state persists and is addressed, and how the user perceives and steers the
whole machine. QM already owns the second one properly. The other three are
where ai-os lives.

## What is actually missing today

Take any current agent product, QM included, and ask four questions.

**"What is this agent working on?"** The honest answer is a list of sessions.
A session is a conversation, not a unit of work. It has no declared goal, no
success condition, no relationship to the session that preceded it. When a
conversation is compacted, the work does not survive it — a summary of it does.
There is no object you can point at and say *that is the thing being done*.

**"What does it know, and why?"** Memory is a file. In QM it is literally
`memory/MEMORY.md`, a bulleted list capped at 300 facts that drops the oldest
when it overflows (`ai-base/src/memory/memory-service.ts`). Everything the system
has ever learned is one flat namespace per scope, with no notion that a fact
belongs to *this project* or *that flow* rather than to you personally, and no
way to ask why a fact is there.

**"What is it looking at?"** A chat log and some panels. The interface is a
transcript of what was said, scrolling away from you, which is the correct
metaphor for a conversation and the wrong one for work that spans weeks and
involves twelve artifacts.

**"Can I take this run and branch it?"** You can fork a session — QM has the
endpoint (`ai-base/src/api/app-sessions.ts:392`). Nothing records that the fork
*is* a fork: there is no parent pointer anywhere in the codebase, only an audit
log row. So you can branch, and you can never diff, merge, or explain the
divergence afterwards.

Those four are not bugs. They are the layer nobody has built, because everybody
is still building the application.

## The four pillars

**`ai-flows` — work above the turn.** A flow is a declared, persisted,
resumable unit of work with a goal, a shape, a state, and a history. It outlives
the session that started it, spans multiple agents and surfaces, survives
compaction and restart, and can be inspected, paused, forked and replayed. The
turn becomes an implementation detail of the flow, not the top-level object.

**`ai-ui` — the intelligent canvas.** A spatial, live surface where the flow, its
artifacts, its agents and its state are *objects you arrange*, not messages that
scroll. The canvas is intelligent in a specific sense: it is generated and
re-generated by the system from the state of the work, rather than assembled by
hand. What you see is a projection of the flow, not a log of the conversation.

**`ai-storage` — memory with an address space.** Four levels — system, user,
project, flow — each with its own lifetime, visibility and consolidation policy.
A fact learned inside a flow does not silently become something you believe
forever. Promotion between levels is explicit and reversible. This is the piece
where the organisation already has real work to draw on and, honestly, also the
piece where its previous attempt measured no better than the naive approach; see
[05-ai-storage](05-ai-storage.md) for how that shapes the design.

**`ai-base` — the operational base.** QM. Identity, scopes, permissions,
sandboxes, audit, the model layer, Slack and web surfaces, deployment. We did not
write it and we are not rewriting it.

## What this is not

- **Not a QM competitor.** If a change belongs upstream it goes upstream. The
  fork exists so we can move fast on the layer above, not to relitigate the base.
- **Not a framework.** This organisation has built agent frameworks repeatedly
  and deleted them; the last time it deleted 10,165 lines because an SDK had
  overtaken them. ai-os adds abstractions the base genuinely lacks, and adopts
  everything else.
- **Not a research project.** Every pillar has to run against real work, or it
  is not in the repository.

## The honest risk

The pattern this organisation repeats is: a coherent architecture, documented
thoroughly, never pinned to anything that could contradict it. The previous
flagship shipped 18,680 lines with three test functions.

So the falsifiable commitment for ai-os is stated here, at the top, before any
code: **each pillar ships with the measurement that would show it is not worth
it.** For flows, that a flow completes work that a plain session loses. For
storage, that scoped memory retrieves better than one flat file — the exact claim
that came back flat last time. For the canvas, that a user finds state faster than
in a transcript. A pillar without its measurement is not done, however much of it
is written.
