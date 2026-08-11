# 15 · Generated interaction — the desk after the GUI

> **Part reference, part specification, and the banner says which per section.**
> Phases 1–4 are built and tested (`ai-ui`, `ai-flows`). Phase 5 is specified and
> not built. The falsification for all of it is [04's stopwatch](04-ai-ui.md#how-this-gets-falsified),
> **which has still not run** — so nothing here is claimed to help, only to work.

## What made the GUI disruptive, and what did not

The easy reading of "make it like the Apple GUI" is *make it look better*, which
leads directly to decoration. The Lisa and the Macintosh changed three things,
and none of them was graphics:

1. **Remember-and-type became see-and-point.** System state stopped living in the
   user's head.
2. **The menu revealed itself.** A command line requires you to know the verb. A
   menu shows you what is possible here, now.
3. **It was reversible.** Undo is what makes experimenting rational. Without it,
   every action is a bet, and people stop.

And a fourth, from the Alto and Smalltalk rather than the Mac: **the
representation was the thing.** You were not looking at a picture of the system.

The desk as built has (1). Documents, cubes, positions that persist. It has
neither (2) nor (3). And (4) is where ai-os differs structurally from any
application, because here **the agents are markdown files** — the system is
editable by the same gestures that inspect it.

## The claim

> The GUI turned *remembering commands* into *pointing at objects*. The move
> available now is turning **knowing what to ask the system** into **seeing what
> the system proposes**. The model does not draw the interface. It writes the
> **summary**, the **menu**, and the answer to **"this"**.

Three jobs, all of which a GUI could not do and a model can. Everything below is
one of the three, or the machinery that lets them exist without violating a rule
[04](04-ai-ui.md) already set.

## The rule everything here had to survive

`04-ai-ui`:

> **Reading the desk never spends a model call.** The desk polls itself, so a
> canvas where rendering could trigger work would spend money because somebody
> left a tab open.

A model-written summary appears to break this. It does not, and the fix is one
word: the trigger is **state change**, not render. Two consequences, both built:

- Everything computable **without** a model is computed on every read, because it
  costs nothing — the digest and the menu are pure functions of flow state.
- Everything a model writes goes through [`projection.ts`](../ai-ui/src/projection.ts),
  whose `get()` **cannot compute**. A lazy cache that generates on a miss would
  reintroduce the bug exactly: a fresh tab is a miss. The deliberate cost is that
  a model-written projection is one poll late.

## Phase 1 · Semantic zoom — **built** [ran]

`ai-ui/src/zoom.ts`, 11 tests.

Not a feature request: `04` **derives** this from sampling and then nothing
implemented it. A person looks at a flow once or twice a day; the flow produces
attempts several times an hour, so the desk samples far below the rate of what it
draws. Change faster than that does not vanish — it **aliases**, and returns
disguised as a trend that is not there.

Two rules, both now enforced by tests rather than intent:

1. **A projection declares the window it represents.** Every `Digest` carries
   `covering`.
2. **Faster-than-sampled change is aggregated, never dropped.** `attemptsRepresented`
   is conserved across every zoom level, and `conserves()` is exported so the
   property is checkable rather than described. Fifteen attempts become one object
   that says *fifteen attempts, this is where it landed*.

The second rule has the teeth. A summary that quietly drops an attempt looks
exactly like a clean summary; nothing catches it unless something counts. Two
tests exist only to make the check non-vacuous — one mutates a child count and
asserts `conserves()` goes false.

**And it holds "landed on" apart from "happened last".** A step that failed four
times and then succeeded landed on `done`; reporting the last attempt would be
right by luck. A step still running has not landed at all, and calling `running`
an outcome is the aliasing this module exists to stop.

**No model in it, on purpose.** *How many attempts, where it landed, is it
moving, did anything carry nothing forward* are all computable from the trace, and
they are what the stopwatch actually times. A model may add prose on top; it may
not sit underneath, or the counts guarding rule 2 would come from a sampler and no
test could hold them.

## Phase 2 · The menu that reveals itself — **built** [ran]

`ai-ui/src/actions.ts`, 13 tests.

The set of sensible things to do with a flow is not fixed, which is why nobody
draws it as a menu and why every agent interface is a text box — a command line
with a nicer font. So the menu is derived from this flow's state, and **every
proposal carries the evidence that produced it**. An action offered without a
reason is a guess the user has to audit, and auditing a guess is slower than
deciding unaided.

Ordering rule, asserted: **what is wrong comes before what is next.** A flow with
a failed step and a runnable next step is one where advancing buries the failure,
so a menu listing "advance" first is a menu recommending it.

Three safety properties, all tested:

- **Cost is a field on the action**, not a rendering decision. An action that
  cannot state its cost is not offerable.
- **A model appends, never substitutes.** Model proposals are capped at two,
  marked `source: "model"`, drawn differently, and carry `route: null` — a
  suggestion to press something, never a licence to spend.
- **It degrades to the computed menu** when the model returns nothing, which is
  what keeps the demo and the tests honest.

## Phase 3 · Deixis — point and ask — **built** [ran]

`ai-flows/src/ask.ts` + `POST /flows/:id/ask`, 9 + 6 tests.

A chat box has no pronouns. To ask about a step you must describe it, which
requires knowing what you were trying to find out. **A canvas has selection, and
selection is the pronoun** — so the question can be three words. This is the
cheapest structural advantage a desk has over a transcript, and it was unused.

The interesting part is not the model call, it is what precedes the question:

- **The answer comes from the trace, never from the goal.** A flow's goal is
  well-written prose describing what was *intended*; its attempts are the messy
  record of what *happened*. A model handed both answers from the goal, because
  the goal reads like an answer — fluently, plausibly, about work never done. The
  prompt labels it `INTENT`, the record `RECORD`, and states which wins.
- **It must be able to refuse.** "The trace does not show that" is named in the
  prompt as an acceptable answer.
- **It does not buy a turn to say nothing.** With zero evidence the route answers
  from `answerWithoutEvidence` and reports `spent: false`. Paying a model to be
  told "there is no information here" is paying for a worse copy of a sentence
  already known to be true.
- With no model wired it answers **501**, not a guess.

The desk reports `spent` on screen. A surface that spends quietly teaches the
person using it to stop counting.

## Phase 4 · Fork as a gesture, and motion that explains — **built** [ran]

**Fork.** `POST /fork` on the desk, onto the flow API route that already existed.
Undo is what made a GUI safe to explore; agent work is not undoable — a step that
ran, ran — and forking is the closest true thing: the history is kept and the
alternative gets its own. `forkedFrom { flowId, atStep }` has been in the flow
model since the first commit **with no gesture able to produce one**. It spends
nothing: it copies records, and the copy does not run until somebody advances it.

**Motion.** Every rule answers a question; none is decoration. The Mac's zoom
rectangle was not ornament — it taught you where the window came from.

| Effect | The question it answers |
|---|---|
| Proposed documents transition; **pinned ones have no transition at all** | "Is my arrangement safe?" |
| A settled step pulses outward rather than recolouring | "What did this produce?" |
| The trace face grows out of its document | "What am I inside of?" |

The first is load-bearing and has its own test. `layout.ts` guarantees the system
never re-arranges what a person touched — and today that guarantee is
**invisible**: you cannot see that your arrangement is safe, you can only fail to
notice it being destroyed. A pinned node that cannot animate is how the page says
it without a legend. `prefers-reduced-motion` disables all three.

## Phase 5 · The gesture that edits the system — **specification, not built**

Drag cube `ReviewAgent` onto cube `MigrationAgent`. That *is* declaring it a
subagent. The model writes the diff to `MigrationAgent.md`, shows it, and a person
accepts it.

This is property (4), and it is the deepest thing on this page: a gesture that
edits **the definition of the system**, not its data. It is possible here and
almost nowhere else, because in ai-os the agents are markdown files. The desk
stops being a viewer of ai-os and becomes an editor of it.

**Not built, deliberately.** It writes to a scope's workspace through a path the
desk does not currently have, and it is the one item on this list where being
wrong edits the system rather than a record of it. It should follow the stopwatch,
not precede it.

## What running it found — 2026-08-11 [ran]

Phases 1–4 were built, tested and merged before anything ran them against a live
core. Doing that took an afternoon and found **four defects that every test
passed over**, which is the whole argument for the distinction this repository
draws between [read] and [ran].

| | Found | Why no test caught it |
|---|---|---|
| **The `ask` seam was never wired.** `POST /flows/:id/ask` took an injected capability that `scripts/serve.ts` never supplied, so a real deployment answered 501 | starting the stack | Every test injects its own stub. The runner is the one caller nobody stubs |
| **The five-second poll destroyed the answer.** Re-rendering the panel rebuilt its innerHTML, so an answer somebody *paid a model call for* vanished within five seconds — and a question typed slower than that was erased mid-sentence | asking a question and waiting | The panel renders correctly. It is the *second* render that loses, and no test rendered twice |
| **The model answered in markdown**, so the panel showed literal asterisks and backticks | reading the answer | Nothing asserted what the text looked like, and asserting the model's compliance would have been measuring phrasing |
| **The markdown stripper matched nothing.** The client is a `String.raw` template, so `\\*` shipped an escaped backslash rather than an escaped asterisk | the test written for the fix | The fix looked right in the source. The test evaluates the helper **as the page ships it**, which is why it failed |

The last one is worth keeping. It was a defect *in the repair for the third one*,
caught within a minute because the test extracts the function from the rendered
page and runs it, rather than testing the TypeScript that produces it. A test
written against the source would have passed and shipped a stripper that silently
did nothing.

**And the fix for the markup is on the display side, not in the prompt.** The
prompt does ask for plain prose and the model mostly complies — but *mostly* means
the page is correct at a rate, and depending on a sampler to obey a formatting
instruction is how a surface becomes intermittently wrong. Constraining the output
is a hint; stripping the markers is a guarantee.

**Deixis verified end to end** against `pi` on the real core: asked *what did this
actually produce?*, and the answer named the file `MigrationAgent` wrote and what
`ReviewAgent` confirmed — neither of which appears in the flow's goal. The
no-evidence path answered `spent: false` without buying a turn. Both **[ran]**.

## How all of this gets falsified

**No new instrument.** The measurement is the one `04` already specifies: a
person, a three-day-old flow they did not run, timed on *what is the state, what
is blocked, what did it produce* — desk against `web-ui` transcript.

Phases 1 and 2 attack that question directly, which is why they were built first
and why they need no benchmark of their own.

**The order matters, and it is not bureaucracy.** Run the stopwatch on the desk
*as it was* first. If a person already answers in eight seconds, semantic zoom has
no headroom, every arm ties, and a tie reads as success — the exact instrument
failure this repository has now recorded four times. The stopwatch is
simultaneously the thing that validates the desk and the thing that says where
there is room to build.

**What would falsify each phase**, stated before the run:

| Phase | Falsified if |
|---|---|
| 1 · Semantic zoom | Time-to-answer does not improve on flows with more attempts than the reader has looked at |
| 2 · The menu | People ignore it, or press its proposals and then undo them |
| 3 · Deixis | Questions get typed that the trace cannot answer — meaning the panel, not the model, was the missing part |
| 4 · Fork | Nobody forks. The gesture existing did not make the alternative worth trying |

## What was deliberately not built

**"A model that generates the interface."** It is expensive, it drifts, it breaks
silently, and it violates the read rule. What earns its place is much smaller and
much stranger: the model writes **the summary, the menu, and the pronoun**. That is
the part no GUI could do.

**A query whose answer is an arrangement** — *"show me what's blocked"* → the desk
re-arranges. Attractive, and the safety mechanism already exists (`propose()`
routes around `pinned`, so a bad arrangement cannot destroy yours). Left out
because it needs the model seam Phase 3 only just opened, and because it should be
argued against a stopwatch result rather than before one.
