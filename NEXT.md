# Next

> **Snapshot, 2026-08-24, after P0 and ai-storage.** A plan is the document most likely to rot,
> so this one is short and dated. The version before this one carried
> `2026-08-09` and was nineteen merged pull requests behind by the time anybody
> noticed — which is the finding that produced
> [19](doc/19-what-would-make-this-matter.md).
> If this disagrees with `doc/`, `doc/` is right.

## Where things stand

All four pillars run — **848 tests of our own**, checked against the suites by CI
so the number cannot drift again. `ai-memory` runs the six memory agents as a
tree. **`ai-storage` exists as of 2026-08-24**, built around a local model held
to 8,192 tokens on purpose — and its first benchmark went against the design, so
the head of §7 is the thing to read before building more of it, not this line.

Two projects run **on** the OS, and as of today both of them run **in CI**:

- [`projects/coclea-sr/`](projects/coclea-sr/) — **28 gates / 135 checks, all
  green**, now confirmed on CI in 23m27s as well as on the author's machine;
  every §10 milestone closed, `make reproduce` REPRODUCED. The narrative
  is [18](doc/18-from-a-hypothesis-to-a-therapeutic-surface.md); what to do next
  on it is [doc/PLAN.md](doc/PLAN.md).
- [`projects/hemo-verified/`](projects/hemo-verified/) — H0 survives at **AUC
  0.906** against a kill threshold of 0.80, and its report reproduces **1207 of
  1207 fields bit-identical** on a machine that has never seen it.

[`projects.yml`](.github/workflows/projects.yml) runs both nightly, on demand,
and on any PR touching `projects/`. Until 2026-08-23 there was no Python in CI at
all, and [19 §7](doc/19-what-would-make-this-matter.md#7--what-running-p0-found-on-the-same-day)
is what building it found — including an attested `h0.json` that could not have
been produced by the code committed beside it.

## Getting the stack back up

Postgres runs in Docker as `aios-pg` on **55432** (`aios/aios`). Two databases:
`aiosui` for the live instance, `flowtest` for the test suite. `make up` does the
whole sequence; the long form:

```bash
export SP=/tmp/aios-data                       # anywhere; workspaces live here
export DB="postgresql://aios:aios@localhost:55432/aiosui"

cd ai-os/ai-base && DATA_DIR=$SP DATABASE_URL=$DB SESSION_STORE=postgres PORT=8080 \
  node --env-file=.env src/index.ts                                    # core   :8080

cd ai-os/ai-flows && DATA_DIR=$SP DATABASE_URL=$DB SESSION_STORE=postgres \
  FLOWS_ALLOW_UNAUTHENTICATED=1 PORT=8097 \
  node --env-file=../ai-base/.env scripts/serve.ts                     # flows  :8097

cd ai-os/ai-ui && DATABASE_URL=$DB FLOWS_API_URL=http://localhost:8097 DESK_PORT=8098 \
  node scripts/serve.ts                                                # desk   :8098
```

Seed a demonstrable system: `cd ai-flows && node --env-file=../ai-base/.env scripts/seed-demo.ts`.
It verifies each write by reading the file back and exits non-zero naming
anything that did not land.

**The whole gate**, which is what CI runs — not a subset of it:

```bash
make gate       # the TypeScript, plus every published-number check
make projects   # the two projects' own evidence; minutes, not seconds
```

**Before publishing the website**, which is a separate repository CI cannot see:

```bash
python3 scripts/check-gate-count.py    --also ../evolvingagentslabs.github.io
python3 scripts/check-coclea-results.py --also ../evolvingagentslabs.github.io
```

Both scan `.html` as well as `.md`. The site carried <!-- gate-count: superseded -->
*26 gates / 125 checks* on
two pages after the repository had been corrected, which is the whole argument
for the flag.

Regenerate the published surfaces when what they show changes. All three are
generated, and all three now carry the same design system — black ground, the
system stacks, Apple's nine system colours, the demo's radii — so a change to one
of them is a change to the look of the site:

```bash
# /demo/ — the activity canvas, generated from the tested geometry
cd ai-ui && node scripts/build-grid.ts --out ../../evolvingagentslabs.github.io/demo/index.html

# /verify/ — real artifacts, checked in the reader's browser. Test first: the
# page reimplements sha256 and Python's canonical form, and both are the kind of
# thing that is nearly right for a long time.
node scripts/verify-page/test.mjs
python3 scripts/build-verify-page.py --out ../evolvingagentslabs.github.io/verify/index.html

# the project's own evidence viewer, from the ledger
cd projects/coclea-sr && python3 render_evidence.py
```

The website's stylesheet is [`assets/site.css`](https://github.com/EvolvingAgentsLabs/evolvingagentslabs.github.io/blob/main/assets/site.css)
in the other repository, and it opens with the argument for what is in it. The
three files above carry their own copies of the same tokens because each has to
be self-contained; they are the places to check after changing it.

---

The order below continues [19 § The plan](doc/19-what-would-make-this-matter.md#6--the-plan)
now that P0 is done. Each item says what finishing it means and what would say it
was the wrong item to pick.

## 1. Watch the checks, now that all five are in

[19 §8](doc/19-what-would-make-this-matter.md#8--every-published-number-and-what-checks-it)
enumerates every number this repository publishes. **Five of nine are guarded**;
the four that are not came from runs nobody kept, and no checker is possible for
them.

The two built last are:

- **`scripts/check-coclea-results.py`** — 11.6%, 24 of 24, −1.22 dB with CI
  [−1.58, −0.87], Q 2.2–2.7 and CF ≈ 1 kHz, read out of the run artifacts that
  `ledger.jsonl` says are current. It derives which run counts from the ledger's
  `superseded` entries rather than sorting directory names, and it passes
  `parse_constant` a function that raises, because two of the twenty artifacts
  are intact and not valid JSON (F8) and `json.load` accepts both.
- **`scripts/check-upstream-test-count.sh`** — the number beside 626 on the front
  page, which a weekly `git subtree pull` can change without anybody noticing. It
  runs `ai-base`'s suite unsharded in the nightly rather than summing five matrix
  shards through artifacts.

**What is left is not construction.** The workflow has now run green end to end:
**135 checks in 23 minutes 27 seconds on a GitHub runner**, the first execution
of the whole suite anywhere but the author's machine, with the report hygiene,
the ledger, the slack audit and the published count all green behind it. What
remains is to watch the first few *scheduled* firings — the nightly trigger
itself has not fired yet, and a schedule nobody has seen fire is a schedule.

**Wrong item if:** the six-entry claim table in `check-coclea-results.py` starts
needing edits for reasons other than somebody publishing a new claim. That is the
line between the list of claims and a second thing to keep in sync, and it is
worth re-reading the file's header before adding the seventh entry.

## 2. Decide what A4's per-oracle AUC means

Not a checker's decision, and it is now well characterised: `A4 alone` moves
0.706 → 0.652 between numerical stacks because 66 of its 98 measurements are
exactly `0.0` and one uncorrupted case crosses into that tie block. The same
stack on a different machine is bit-identical, so this is a library-version
fragility rather than noise — which means it will move silently at the next
upgrade.

Two defensible answers, and they belong to whoever owns the science: report A4
without an AUC, since it is `HARD` and its own docstring says it has "no score to
weigh"; or floor the measurement at the field's numerical precision so values
indistinguishable from zero are zero. Do not pick by which number looks better.

**Finished means:** the README's A4 row either stops carrying a rank statistic
or carries one that survives a numpy upgrade.

## 3. Seed the flow for M5's stopwatch, today

> **Blocked, 2026-09-06.** `seed-cochlea.ts` created the project scope and then
> failed on its first turn: `core 500` on `/v1/turns`, and `.run/logs/core.log`
> names the cause — `401: {"message":"User not found."}` from the model
> provider. The key in `ai-base/.env` is dead. The seed is idempotent and will
> reuse the scope, so replacing the key and re-running is the whole fix. **The
> clock has not started.**

**It has to be three days old**, so seeding it is what makes the measurement
possible later in the week. Everything else on this page can wait; this cannot,
because waiting is its input.

The measurement, unchanged from
[04-ai-ui § How this gets falsified](doc/04-ai-ui.md): a person, and a flow **they
did not run**, three days old. Time to answer *what is the state, what is
blocked, what did it produce?* — desk against the `web-ui` transcript.

**Check the headroom before building anything for this.** If the flat explorer
answers as fast as the desk, the canvas is decoration and M5 should be re-argued
rather than polished. Two subjects is a signal about whether the instrument
works, not evidence; say which.

## 3b. Track C's corrector is built; the run needs a working key

`ai-flows/src/corrector.ts` + `test/corrector.test.ts`, 16 tests. Three rules,
each a miniature of one this repository enforces in CI, and the sharpest is the
one whose correct behaviour is **inaction**. Both cheat-guards are code and both
caught real defects on their first run — see
[doc/05 § The corrector exists](doc/05-ai-storage.md).

**Not run.** Two things stand in the way, and only the second is work:

1. **The OpenRouter key in `ai-base/.env` is dead** — `401 User not found`. It is
   what stopped the M5 seed below, and it stops this too. Replacing it is the
   whole unblock.
2. **The feedback-without-persistence control is not built.** Corrected every
   time, remembering nothing. Without that arm a gap is not evidence for
   distillation at rest, and doc/05 named it before the instrument existed.

## 4. coclea §7.5, route B — the precondition

One run, and it is unchanged and not reordered: see [doc/PLAN.md](doc/PLAN.md).
The feedback correction must stay small against `u` across the whole `mu` range;
if it is not small at `mu_H = −0.02`, route B cannot reach criticality and route A
is required. Knowing that costs one run rather than a milestone.

## 5. hemo-verified H1

H0's own stated limit is that the corruptions and the oracles share an author. H1
is whether the portfolio ranks the errors a trained surrogate actually makes.
Decide **before** buying the training whether a published surrogate's errors will
do — F5, applied before the work.

## 6. One user who is not the author

`make up` from a clean clone on a clean machine, timed, by somebody who has not
seen this repository. Every failure becomes a FRICTION entry, fixed with the
shortest hack that works. The output is a number: time to a first gated result.

**Its first two lines have already been paid**, by accident: building P0 needed
both projects standing up on a machine that was not the author's, and neither of
them could be started from its own documentation — a committed `.venv` symlink to
one laptop, and a project with no manifest at all (FRICTION F9). That is the
cheapest possible evidence that this item is not a nicety, and it cost nothing
because something else needed it first. **What is still unpaid is the OS itself:
nobody has timed `make up`**, and the two projects are the easy half.

## 7. `ai-storage` — built, and its first result says the hierarchy loses

**Changed, 2026-08-24.** It is no longer last and no longer unbuilt: the store,
the five specialists, scopes, promotion, history and the navigation benchmark
are all in, with 119 tests, around a **local** model.

**The first result is negative and it is published.** At the ceiling — a perfect
navigator, no weights — exact lexical search answers 3/3 at every corpus size
and reads less doing it; hierarchical navigation answers 1–2/3 and runs out of
steps; the flat `MEMORY.md` baseline does not fit an 8K window at two hundred
notes, let alone fifty thousand.

That is the second flat result in this direction. The predecessor measured a
related idea and got 80% acc@1 either way; `doc/05` said the burden of proof is
on the axis, and it has not been met. It is a ceiling measurement with no model
in it, so it does not close the question — but it changes what the next
measurement is for. The honest next step is not more storage machinery. It is
either

- a question family whose wording does not appear in the target note, which is
  where an index should win and search should not; or
- accepting that lexical search over a flat set of notes is the v1, and that the
  index earns its place by making *writing* manageable rather than reading.

Read [doc/22 §59](doc/22-ai-storage-qwen.md#59) before building anything else in
that component.

The old open question is still open and still worth answering on paper against
two real flows: *when two notes say the same thing, which survives?* The
Reconciler has an answer in code — `same` keeps the older, `conflict` keeps
both — and **as of 2026-09-06 a fixture tests it end to end**:
`ai-storage/test/reconciliation.test.ts` asserts what the *store* becomes after
each verdict, not what the agent returns. The branch that mattered is
`conflict`: both notes stay `active`, neither is superseded, and the
explanation is kept. Verified by mutation — making `recordConflict` demote one
side turns that test red and leaves the other three green.

What the fixture does **not** answer is the judgement: whether a model calls
two notes `same` when they are. That is `bench/`, and it still has not been run
against weights.

## Smaller, if a session ends early

- **The remaining flow shapes.** `Sequence`, `Loop`, `Fan-out`, `Deliberation`,
  `Watch`, and merge. `Open` and `Gated` are the ones that run.
- **`?tab=` and `?select=` survive a reload on the demo but not its state** — the
  simulated world lives in the page. Fine, and the chrome says so; worth
  revisiting only if somebody asks.
- **The three upstream asks** in [`doc/upstream/`](doc/upstream/), still unsent.
  Their `CONTRIBUTING.md` wants human-written informal text, so these need
  rewriting in a person's voice, never pasting.
- **Regenerate `h0.json` on the machine whose numbers the write-up will quote**,
  now that the artifact records its own environment. `make reproduce` then means
  bit-identity rather than a classification.

## What not to do

- **Do not touch `ai-base/`** without a line in `ai-base/AI-OS-PATCHES.md`. CI
  enforces it.
- **Do not add interaction to the flat explorer** (`ai-flows/src/view.ts`). It is
  M5's control arm and it is evidence only while it stays inert. A test enforces
  this too.
- **Do not publish a number that nothing checks.** That is how 315, 331 and 333
  ended up being three different truths on the same day — and how
  <!-- gate-count: superseded --> *26 gates / 125 checks* survived in thirteen places for six days after it stopped being true.
- **Do not build a checker for a number whose producer was thrown away.** Four of
  the nine in [19 §8](doc/19-what-would-make-this-matter.md#8--every-published-number-and-what-checks-it)
  came from runs nobody kept. The move there is to re-run them into an artifact
  or to stop quoting them in the present tense — not to invent a check.
- **No more desk before the stopwatch**, and **no third project before a second
  user.**
