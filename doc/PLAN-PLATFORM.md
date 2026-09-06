# The platform plan, as of 2026-09-06

> **Specification.** Nothing in this document is built. It maps a product
> brainstorm onto `ai-os` as it actually exists on disk, and sequences the work
> so that each piece is licensed by a measurement before it is built.
>
> **Each stage's validation case lives in
> [`PLAN-PLATFORM-CASES.md`](PLAN-PLATFORM-CASES.md)** — real work, not demos. A
> stage without a case there does not start.
>
> It does **not** supersede [`PLAN.md`](PLAN.md) (COCLEA-SR) — that project is the
> workload that tells `ai-os` what to be, and the channel is still
> [`FRICTION.md`](../projects/coclea-sr/FRICTION.md). This document is the
> product direction that sits beside it.

## The guard this document wears, because this file has been burned before

`PLAN.md` records that a thesis-review deadline of 2026-11-15 was **invented** —
"it came from a brainstorm pasted into a conversation, not from anything anybody
committed to."

The input to *this* document is also a brainstorm pasted into a conversation. So:

- Every claim about what exists is checked against disk and marked **[read]** or
  **[ran]**. The brainstorm's own claims are marked **[claimed]** and carry no
  weight until something measures them.
- No dates are invented. There are none in this document.
- The brainstorm's "reduces expensive token consumption by more than 70%" is
  **[claimed]** and is not a project goal until an arm measures it.

---

## 1. The brainstorm, against what is on disk

The proposal is a five-phase platform: markdown memory + git backbone + frontier
bootstrap + small local models + a dream pass + verticals. Mapped onto this
repository, **four of the five phases already have a predecessor**, and two of
them have *results that contradict the proposal*.

| brainstorm phase | what already exists here | state |
|---|---|---|
| 1 · markdown schema + git backbone | `ai-storage` ships the four-level store, promotion, provenance, history and ACLs (119 tests) — **and its first benchmark says the hierarchy loses to lexical search**; `agentvcs` versions code + skills + goals + models + traces together | **[read]** built, result negative |
| 2 · harness + frontier bootstrap | `ai-base` (vendored QM subtree), `ai-flows`, `ai-ui` — 402 tests, CI, a running stack, a playable desk | **[ran]** built |
| 3 · small models, QLoRA, speculative routing | `gemma4nanoloop` — and three of this phase's premises are **already falsified** (§4) | **[read]** frozen |
| 4 · trajectory log + the dream | `contribution.ts` already answers *which steps mattered* on every flow; `nightshift` has capture + dream phase 1 | **[read]** partial |
| 5 · commercial verticals | nothing | **not built** |

### What the brainstorm gets wrong about the competition

**QM is not a rival. It is `ai-base`** — a `git subtree` kept byte-identical to
upstream. And QM already ships the brainstorm's §2.3: *"skills are scope-owned and
shareable by grant, with admin-gated promotion to the whole org and skill packs
imported from git repositories."* Scoped markdown skills, git-imported packs, and
admin-gated promotion to the org. **[read]**

So System/Organisation/Project-with-promotion is not a differentiator to build.
It is the floor we already stand on. The two rungs QM does *not* have — `flow`
and `system` — **have since been added and measured, and the measurement went
against them**. See Track B: that is the single most important fact in this
document, and it arrived after the first draft.

**GBrain also ships the dream and per-person scoping**, so neither "organisational
memory" nor "consolidation at rest" is a moat either. Its published numbers are
*retrieval-quality* numbers (P@5, R@5). The question this repository asks is
whether surfacing the right material **changes the task outcome**, and that is a
different measurement. **[read]**

---

## 2. The correction that reorders everything

`doc/05-ai-storage.md` contains four null results and one diagnosis that
invalidates the experiment design proposed for this platform last week.

| instrument | result |
|---|---|
| `bench:memory`, flat-file baseline | staleness **10.0 / 10** — saturated |
| physics L2, bare `oneShot` | **0 / 24** |
| physics L2, harness with sandbox | **12 / 12** — headroom **0%** |
| handoff, leak closed | **6 / 6** — headroom **0%** |

> **Every instrument shared one property: the correct behaviour was derivable
> from information the task already contained.** Where the answer is derivable, a
> learned strategy adds nothing, because the model simply derives it.

**Consequence, stated plainly: `physics-verifiers` is the wrong instrument for
the memory experiment**, and the reason is measured, not argued. Physics with a
sandbox is 12/12 — the model computes and checks itself. Its 0/24 → 12/12 gap is
already attributed to *computation*, so any treatment aimed at that gap is
competing for an explained result.

The right instrument is the one this document already names, and it is the
cheapest of four: **a synthetic corrector holding a hidden rule the agent cannot
infer from the task** — a unit convention, a required sanity check, an ordering
constraint that only this organisation imposes. Headroom is **100% by
construction**: if the fact is genuinely absent at the first attempt, failure is
guaranteed and does not have to be hunted.

And it answers the objection standing against the strongest procedural result in
the workspace — that induced procedures merely restate rules the benchmark
planted:

> **The arbitrariness is the point, not a weakness** — arbitrary is precisely
> what cannot be derived, and organisational convention is arbitrary in exactly
> this way.

That is the whole commercial thesis in one sentence, and it was already written
in this repository.

---

## 3. The standing rule every track below obeys

From `05-ai-storage.md`, earned by a measurement where an extra memory axis
scored 80% / 80% / 80%:

> **No new memory axis ships without a benchmark the baseline could lose, named
> before the axis is built.**

Nothing in Track B ships without Track C's number. That is not caution; it is the
rule this repository already adopted and paid for.

---

## Track A — the UI

The brainstorm asks for "a basic UI/CLI". `ai-ui` is well past that: a desk where
flows are documents and agents are cubes stacked on them, live, with persisted
per-scope layout and a playable public demo. **[ran]** What it does not have is
proof that it is worth having.

**A0 · Seed the stopwatch flow. Do this first; it is the only item with a clock.**
The M5 measurement needs a flow **three days old** that the subject did not run.
Seeding costs minutes and cannot be compressed later.

**A1 · Run M5's stopwatch.** A person, a flow they did not run, three days old.
Time to answer *what is the state, what is blocked, what did it produce?* — desk
against the `web-ui` transcript. The claim is that the desk is faster and the gap
widens with flow age.

> **Check the headroom before building anything for this.** If the flat explorer
> answers as fast as the desk, the canvas is decoration and M5 is re-argued
> rather than polished. Two subjects is a signal about whether the instrument
> works, not evidence — say which.

`ai-flows/src/view.ts` is the control arm. **Do not add interaction to it.** It is
evidence only while it stays inert, and a test enforces that.

**A2 · The memory drawer becomes real** *(gated on A1, and on Track C)*.
`ai-ui/src/memory.ts` already draws the four-level ladder stamped **NOT BUILT —
THIS IS THE SPEC**; its notes are recomputed from flow traces on every read, which
is what makes it a sketch. Turning it into the real thing is where the
brainstorm's "git as an invisible backbone" is actually delivered, and the UI work
is specific:

- A **promote** and a **demote** button per note, one rung at a time — no skipping
  flow → system, because that is two independent decisions.
- **Provenance always visible.** Every note names the flows it came from. A note
  nobody can trace back is indistinguishable from one somebody typed.
- **A promotion is a record**: source level, source id, actor, timestamp, reason.
  Automatic promotion is allowed; unrecorded promotion is not.
- **Contradiction is surfaced, never merged.** Detection is deferred; the surface
  is not.
- **No git vocabulary anywhere in the UI.** No commit, branch, tag or revert. The
  lawyer and the writer see *promote*, *undo*, *where this came from*.

The design instruction from the document is the reason this is UI work and not
schema work: *you find out what a promotion needs by trying to press the button.*

**A3 · Vertical arrangements** *(last, gated on everything above)*. A vertical is
a desk arrangement plus a system-level memory set plus a flow shape — not a new
product. Building one before A1 and Track C land is building the packaging of an
unmeasured claim.

**Constraints carried forward, unchanged:** reading the desk never spends a model
call; there is no build step until the stopwatch says the canvas wins.

---

## Track B — the ladder is built, and its first result is negative

**Corrected 2026-09-06, and this is the largest correction in the document.**
`ai-storage` is **not specification**. Phases 1–8 shipped 2026-08-24: the store,
five specialists, scopes and ACLs, promotion, history, provenance, a
token-bounded index and lexical search — **119 tests in the package, 828 in the
repository**. `SCOPE_KINDS` already carries `flow` and `system`, recorded in
`AI-OS-PATCHES.md`. Every item this track previously listed as work was already
done. **[read]**

**And its first benchmark went against the design.** At the ceiling — a perfect
navigator, no weights, one planted unguessable fact per question, 8,192 tokens:

| arm | notes | correct | steps | endings |
|---|---|---|---|---|
| flat | 200 | **0/3** | 1 | `context_limit` |
| flat | 50,000 | **0/3** | 1 | `context_limit` |
| search | 200 | **3/3** | 3 | `done` |
| search | 50,000 | **3/3** | 3 | `done` |
| storage | 200 | 2/3 | 7 | `done:2 step_cap:1` |
| storage | 50,000 | 1/3 | 12 | `done:1 step_cap:2` |

- **The flat file does not fit at any size** — not "answers worse", refuses. Two
  hundred notes is 12,566 tokens against a memory lane of 2,300. That is the
  honest version of what a single `MEMORY.md` does today, where the same file is
  silently truncated and the model answers from whatever survived.
- **Exact lexical search beats hierarchical navigation**, 3/3 against 1–2/3, and
  reads less doing it. Navigation runs out of *steps*, not context.

**This is the second flat result in the same direction**; the predecessor scored
80% / 80% / 80%. `05-ai-storage.md` put the burden of proof on the axis, and the
axis has not met it.

> So the brainstorm's §2.3 is not merely already shipped by QM. **The part of it
> that is ours has now measured worse than the boring alternative.** A plan that
> still offers the hierarchy as the moat is offering the thing that lost.

It is a ceiling measurement with no model in it, so it does not close the
question — it changes what the next measurement is for. What remains, and none of
it is more storage machinery:

**B1 · The question family an index should win.** §59 names its own confound: the
question shares its rare words with exactly one note, so search only has to match
words. A family whose wording does **not** appear in the target note is where an
index should win and search should not. Not built.

**B2 · Or accept lexical search over a flat set of notes as v1**, and let the
index earn its place by making *writing* manageable rather than reading. That is a
different claim and it needs its own number.

**B3 · The Reconciler fixture that does not exist.** *When two notes say the same
thing, which survives?* The Reconciler answers in code — `same` keeps the older,
`conflict` keeps both — and **no fixture has tested it**. It is the cheapest
unmet item in the component, and Case B1 is written for it.

**Unchanged: none of this starts before Track C.** A store whose retrieval has
already lost to lexical search does not need more retrieval. It needs evidence
that what it *holds* could not have been derived — which is Track C, and is now
the only thing that can justify the component at all.

## Track C — the experiment that licenses Track B

**C0 · Build the synthetic corrector.** Deterministic, no human, exact oracle. It
holds a rule the agent cannot infer from the task and that only this organisation
imposes. This is the version that fits in a day.

**C1 · Run the loop.** The agent attempts; the corrector says it is wrong and
**states the rule in general terms, never the value**; the pass at rest distils
it; a **different instance** requiring the same rule is scored later.

**The two ways this experiment cheats, named before it can:**

- **If the corrector's message contains the answer, nothing is learned — a hint
  is copied.** The rule, never the value.
- **Never score a retry of the corrected instance.** A retry measures short-term
  instruction-following, which is not the claim.
- **The rule must be checkable without the corrector**, or the evaluation is
  circular.

**C2 · The falsification condition, written before running.** If a system that
received the correction scores no better than one that did not, on a *different*
instance of the same rule, then non-derivable information does not survive the
memory pass — and Track B has no case. That outcome is published.

**C3 · Only if C2 lands:** the attribution arm — the strongest retrieval baseline
constructible over the same corrected traces. This is the arm that says the moat
is the *induced rule* and not the *corpus*, and it is worthless before there is an
effect to attribute.

---

## Track D — models

**Nothing is built here, and that is the plan.** Three premises of the
brainstorm's Phase 3 are already measured and none survived: **[read]**

| premise | measurement |
|---|---|
| RAG closes the knowledge gap | strongest retriever built: **+0** over raw (p = 1.0000) |
| a bigger local model is better | **non-monotonic** — 4B 29/50, 9B **18**/50, 12B 38/50 |
| capability lives in the weights | a **feedback message** moved one model **+30 points**, information held constant |

What *is* licensed is `gemma4nanoloop`'s mechanism, and it is subtraction rather
than speculation: phase-scoped tool binding took peak schema from **5,548 to 817
tokens (−85%)**, the sequence is a graph in code, verification is `ruff`/`pytest`
and never a model judging a diff. **[read]**

**Speculative routing** is the one Phase-3 mechanism never measured here and the
most expensive to build. **QLoRA is worse than deferred**: the same procedure,
same text, same rule, classifies as *interface compensation* on a 4B and
*persistent gain* on a 12B — a QLoRA trained on today's evidence could learn
interface compensation and call it expertise.

---

## Track E — the scene block, and why it is cheap here

A new proposal from outside the brainstorm: before symbols, make the reasoner
write the problem as a **physical scene** — a mechanical, real-world model with
trackable parts — and only then move to formalism. The origin is a lecture on an
open problem in which nearly every concept arrives as a scene before an equation.

**Provenance, stated honestly: the video has not been watched here, and the
timestamps and readings in the pasted analysis are unverified.** What is being
adopted is the *hypothesis*, not that account of the lecture.

Why it belongs in this repository rather than in a notebook:

1. **It is a representation change, and representation is an axis this
   organisation already measures.** There is even a directional prior: an earlier
   experiment pitted a structured assembler-style intermediate representation
   against plain prose under the same oracle, and **prose won — the formal
   representation's thesis was falsified**. A scene block moves further in the
   direction that already won. **[read]**
2. **It costs a markdown edit, not a runtime change.** Agents here are markdown
   files. A `## Scene` section added to an agent file is the entire treatment.
   That is the architecture's central claim being cashed in — and it makes this
   the cheapest experiment in the document.

**E0 · Name the instrument before writing the section.** Per §3, an axis that
cannot name the benchmark it expects to lose is being assumed, not proposed. Two
disqualifications are already known:

- **Physics is out.** Its 0/24 → 12/12 gap is attributed to the sandbox, i.e. to
  computation. A representation treatment aimed there competes for an explained
  result.
- **Anything closed-form is out**, for the §2 reason.

The candidate that fits: a task whose failure mode is **structural rather than
computational** — where the model produces something well-formed and wrong
because it mis-framed the problem. `contribution.ts` can already tell which steps
carried nothing, which is the closest thing to a structural-failure detector this
repository owns.

**E1 · The falsification condition:** if a mandatory scene block does not beat
the same agent file without it, on a benchmark named in E0, it is deleted. Not
loosened — deleted. A check that can fail while the capability works is measuring
phrasing.

---

## What this plan deliberately does not build

Named so their absence is a decision and not an oversight:

- **A new repository.** The portfolio audit named serial repo-spawning as one of
  three cross-cutting problems: one idea rebuilt four or more times, each
  abandoning a tested predecessor. A platform repo would be the fifth rebuild and
  would abandon 402 tests, CI and a running stack.
- **A contradiction detector.** Explicitly deferred to v2 by the promotion rules;
  what ships is *surfacing* the conflict.
- **An embedding layer, a second memory axis, a graph.** Until level-ordered
  recall is *measurably* insufficient.
- **Speculative routing and QLoRA.** Track D.
- **The SaaS/on-premise split and the three vertical templates.** They cannot be
  validated cheaply and every one of them is downstream of Track C.

## The order, in one block

```
A0  seed the stopwatch flow            ← today; the only item with a clock
A1  run M5                             ← gates all UI work
C0  build the synthetic corrector      ← parallel with A0/A1; fits in a day
C1  run it, score a different instance
C2  publish the number, either way     ← gates ALL of Track B
       │
       ├── flat?  → Track B does not start. Say so, and stop.
       │
       └── moves? → B3 the Reconciler fixture (cheapest unmet item)
                    A2 memory drawer with promote/demote/provenance
                    C3 retrieval attribution arm
                    B1 the question family an index should win
                    A3 vertical arrangements

  (B0/B1/B2 as first drafted are already built — see Track B)
```

## Where the cases are

Every stage above is validated on a named piece of real work, and three of them
are validated on **this repository's own enforced house rules** — because
arbitrary organisational convention is the cleanest non-derivable information
there is, and §2 is the reason that matters. See
[`PLAN-PLATFORM-CASES.md`](PLAN-PLATFORM-CASES.md).

## What "done" would require beyond this file

Per the repository's own convention: a Spanish mirror at `doc/es/`, an
illustration, an entry in `doc/README.md`'s index, and a PR. This document has
none of the four yet.
