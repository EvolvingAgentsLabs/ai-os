# The validation cases

> **Specification.** None of these is built. Companion to
> [`PLAN-PLATFORM.md`](PLAN-PLATFORM.md): that document says what to build and in
> what order; this one says **what each stage is validated on**, and every case is
> a real piece of work rather than a demo.

## The rule these cases exist to satisfy

From [05 · ai-storage](05-ai-storage.md), earned by a measurement that scored
80% / 80% / 80%:

> **No new memory axis ships without a benchmark the baseline could lose, named
> before the axis is built.**

A stage without a case here does not start. Where no honest case exists yet, this
document says so instead of inventing one — that is the state of A3 and E.

## Why the cases are drawn from this repository's own work

Three of the four stages need a task where **the correct behaviour cannot be
derived from the task itself**. `05-ai-storage.md` established why, with four
null results in a row:

> Every instrument shared one property: the correct behaviour was derivable from
> information the task already contained. Where the answer is derivable, a
> learned strategy adds nothing, because the model simply derives it.

Arbitrary organisational convention is the cleanest source of non-derivable
information there is, and **this repository is full of it, already enforced by
code**. That makes its own house rules the cheapest honest fixture available —
and using them means the system is validated on real work rather than on a
scenario written to be passed.

---

## Case A1 — the desk stopwatch, on a COCLEA-SR flow

**Stage:** Track A1. **Kind:** real application, measured.

**The material.** A flow from [`projects/coclea-sr`](../projects/coclea-sr) — the
workload that already drives this repository. Not a seeded demo: a run that
happened because the project needed it.

**Setup.** The flow must be **three days old** at measurement time and the
subject must not have run it. This is the only item in the whole plan with a
clock: seeding cannot be compressed later, so it happens first.

**The task, unchanged from [04 · ai-ui](04-ai-ui.md):** answer *what is the state,
what is blocked, what did it produce?* — desk against the `web-ui` transcript.

**Measured:** time to a correct answer, and correctness of the answer. Both, not
just the stopwatch — a faster wrong answer is not a win.

**Passes if:** the desk is faster **and** the gap widens with flow age.

**Fails if:** the flat explorer ties. Then the canvas is decoration, M5 is
re-argued rather than polished, and A2 does not start.

**Guards.**
- `ai-flows/src/view.ts` is the control arm. It is evidence only while it stays
  inert, and `test/view.test.ts:141` enforces that. **Do not improve it for this.**
- Two subjects is a signal about whether the instrument works, **not evidence**.
  The report says which it is.

---

## Case C1 — the corrector holds this repository's own house rules

**Stage:** Track C, the experiment that licenses the whole memory ladder.
**Kind:** real application (an agent working in this repo), exact oracle.

This is the case the entire plan turns on, and its fixture already exists as
enforcement code.

### The three rules

Each is **arbitrary** (nothing in the code implies it), **non-derivable** (no
amount of reasoning about the task yields it), and **checkable without the
corrector** (CI or a test already decides it). All three are **[read]** from the
files named.

| # | rule | enforced at | why it cannot be derived |
|---|---|---|---|
| 1 | A change inside `ai-base/` must be recorded in `ai-base/AI-OS-PATCHES.md` **in the same PR** | `.github/workflows/ci.yml:201` | It is a `git subtree` conflict-resolution convention. Nothing in the changed file hints at it. |
| 2 | `ai-flows/src/view.ts` must stay **inert** — no interaction may be added | `ai-flows/test/view.test.ts:141` | The correct action is **inaction**, and only because the file is M5's control arm. An agent asked to improve an explorer will add interaction; that is the *obvious* move. |
| 3 | The test count is checked against the suites | `scripts/check-test-count.sh`, `ci.yml:140` | Adding tests is normally unambiguously good. Here it fails CI unless a counter is updated too. |

**Rule 2 is the strongest instrument in this document.** A rule whose correct
behaviour is *not doing the obvious thing* cannot be satisfied by a lucky
derivation, and it cannot be satisfied by general competence. It can only be
satisfied by knowing something about this organisation.

### The loop

1. The agent is given a real task that touches a file under `ai-base/`.
2. It attempts. CI fails.
3. The corrector states the rule **in general terms** — *"changes to vendored
   files must be recorded in this repository's patch log"* — and **never the
   value**: not the file, not the diff, not the line to add.
4. The pass at rest distils the correction into memory.
5. **A different instance is scored later**: a different file under `ai-base/`,
   in a different task, with no correction present.

### The falsification condition, written before running

> If an agent that received the correction does no better on the **later,
> different instance** than one that did not, then non-derivable information does
> not survive the memory pass, and **Track B has no case**.

That result is published, and Track B does not start.

### The three ways this case cheats, named before it can

- **If the corrector's message contains the answer, nothing is learned — a hint
  is copied.** The rule, never the value.
- **Never score a retry of the corrected instance.** A retry measures short-term
  instruction-following, which is not the claim.
- **The rule must be checkable without the corrector**, or the evaluation is
  circular. All three above are checked by CI, which is why they were chosen.

### One control that must be run

An arm where the agent is given the rule **in its prompt** rather than through
correction. If prompting scores the same as remembering, the memory pass is not
what carried the information, and the result belongs to the prompt.

---

## Case B1 — the Reconciler fixture that does not exist

**Stage:** Track B, once C has returned a number. **Kind:** real facts from this
organisation's history, with the answer known independently.

**Corrected 2026-09-06.** `ai-storage` is built — store, promotion, provenance,
history, ACLs, 119 tests — so this case is no longer "does the ladder work". It
targets the one thing in the component that **has code and no fixture**:

> *When two notes say the same thing, which survives?* The Reconciler answers in
> code — `same` keeps the older, `conflict` keeps both — and **no fixture has
> tested it.** **[read]**

A branch with no fixture is a branch nobody has seen fail. That makes it the
cheapest unmet item in the component and the right place for this case.

### The material

Real facts from this workspace whose correct level is already known by other
means — including one that must **not** be promoted, which is the case that
catches silent promotion.

| fact | correct level | why |
|---|---|---|
| the seed and parameters of one run | **flow** — dies with it | Nothing later needs it. A ladder that promotes this promotes everything. |
| *"the place code is falsified — do not re-derive it"* (COCLEA-SR) | **project**, and no further | True of that project. Promoted to system it becomes a belief about work it does not describe. |
| *"Gemma 4 on ollama writes its chain to a separate `reasoning` field and returns empty `content` under ~800 max tokens — budget ≥ 900 and treat empty content as an error, never a default"* | **system** | Learned inside one project, true of every model call this deployment makes. |

### The two reconciliation cases, which are the point

- **`same`** — the same fact arrives twice, worded differently, from two flows.
  The older survives; the newer's provenance is merged into it rather than lost.
- **`conflict`** — a later note contradicts an earlier one. **Both survive**, and
  the contradiction is surfaced rather than merged. This is the branch with no
  test, and it is the one that matters: a store that quietly picks a winner is
  how a correction and the thing it corrected become indistinguishable.

**Passes if:** each fact lands at its level; the middle one **stays** at project
level across a promotion pass; every promotion carries source level, source id,
actor, timestamp and reason; a demotion restores the prior state at every level
touched; and both reconciliation branches do what the code says they do.

**Fails if:** the middle fact reaches system, or `conflict` keeps only one note.
Either failure is worth more attention than every case that passes — *silent
promotion is how a one-off workaround becomes an organisational belief.*

## Case A2 — the promotion, pressed by a person who does not know git

**Stage:** Track A2. **Kind:** real application, observed.

`ai-ui/src/memory.ts` already draws the ladder stamped **NOT BUILT — THIS IS THE
SPEC**, and the design instruction is that *you find out what a promotion needs by
trying to press the button*. So the validation is a person pressing it.

**The task.** Given the three facts from Case B1 sitting at flow level, a subject
promotes what should be promoted and leaves what should not.

**Measured:** whether the subject promotes the middle fact. If the interface makes
over-promotion the easy path, the interface is wrong — not the subject.

**Passes if:** the subject can state, without help, **where a note came from** and
**why it was promoted**, from the interface alone.

**Fails if:** the subject asks what a commit, a branch or a revert is. **No git
vocabulary appears anywhere in this interface** — the whole "invisible backbone"
claim is that a lawyer or a writer never learns those words.

---

## Case A3 — the editorial vertical, on the only large corpus we own

**Stage:** Track A3, last. **Kind:** real application.

**The honest position first: there is no legal or medical fixture.** No 500-page
expediente, no clinical protocol set. Acquiring one is a real cost with a real
privacy question attached, and pretending otherwise is how a vertical gets built
on a scenario. **That is the reason A3 is last, not scheduling.**

What *does* exist is a large, structured, convention-governed document corpus with
machine-checkable correctness: **this repository's own `doc/`** — nineteen
numbered documents, a Spanish mirror, an index, and rules that are already
written down.

| checkable rule | where it comes from |
|---|---|
| every document declares **Reference** or **Specification** in a banner under its title | `doc/README.md` |
| *"a document that changes kind gets its banner rewritten the same day"* | `doc/README.md` |
| every claim is marked **[read]** or **[ran]**, or is citable to a file and line | `doc/README.md` |
| every document has an `es/` mirror and an index entry | the convention this file is subject to |

**The task:** the system maintains that corpus — writes a new document, keeps the
mirror in parity, updates the index, and rewrites a banner when a specification
becomes reference.

**Passes if:** the four rules above hold after a change the system made alone.

**Why this is not a toy:** it is the same shape as the legal and editorial
verticals — a long structured corpus, arbitrary house conventions, correctness
that a human would otherwise have to check by reading. If the system cannot hold
this corpus, which it can read in full and whose rules are written down, the
500-page expediente is not a nearer target.

---

## Case E1 — open, and deliberately unfilled

**Stage:** Track E, the scene block. **Kind:** none yet.

Per the standing rule, an axis that cannot name the benchmark it expects to lose
is being assumed rather than proposed. **This one cannot yet, and that is recorded
rather than papered over.**

**Two candidates are already disqualified:**

- **Physics.** Its 0/24 → 12/12 gap is attributed to the sandbox, i.e. to
  computation. A representation treatment aimed there competes for an explained
  result.
- **Anything closed-form**, for the reason all four null instruments share.

**What the case must have:** a failure that is **structural rather than
computational** — the system produces something well-formed and wrong because it
framed the problem incorrectly. This organisation has one recorded instance of
exactly that shape: a hypothesis that was simulated, **found to rest on a wrong
model**, and repaired against a pre-registered condition
([18](18-from-a-hypothesis-to-a-therapeutic-surface.md)). That is a mis-framing,
not an arithmetic error.

**There is no detector for it here, and an earlier draft of this document said
there was.** It named `contribution.ts`, which flags the steps of a flow that
carried nothing forward. That is the wrong half: `contribution.ts` is right about
**handoffs** and wrong about **coverage** ([05](05-ai-storage.md) §"Two failures
of instrument"), and a mis-framing is coverage-shaped — the words survive, the
claim does not. It was built with no notion of a right answer and falsified the
same day.

What a case here actually needs is what `projects/coclea-sr/` has and prose
workloads do not: **a metric declared before the step ran, by somebody other than
the step.** Until a second such workload exists, this stage has no instrument,
and saying so is the finding.

**When the case is written, its falsification condition is fixed in advance:** if
a mandatory `## Scene` section does not beat the same agent file without it, the
section is **deleted, not loosened**. A check that can fail while the capability
works is measuring phrasing.

---

## What each stage is allowed to claim

| stage | case | claim it earns |
|---|---|---|
| A1 | COCLEA-SR flow, stopwatch | the desk is worth having |
| C1 | this repo's own house rules | non-derivable information survives a memory pass |
| B1 | the Reconciler's untested branches | contradiction is surfaced, not silently merged |
| A2 | a person pressing promote | the backbone is genuinely invisible |
| A3 | this repo's `doc/` corpus | the editorial vertical holds a real corpus |
| E1 | *(unwritten)* | nothing, until the case exists |
