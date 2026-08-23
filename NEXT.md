# Next

> **Snapshot, 2026-08-23, after P0.** A plan is the document most likely to rot,
> so this one is short and dated. The version before this one carried
> `2026-08-09` and was nineteen merged pull requests behind by the time anybody
> noticed — which is the finding that produced
> [19](doc/19-what-would-make-this-matter.md).
> If this disagrees with `doc/`, `doc/` is right.

## Where things stand

`ai-base`, `ai-flows` and `ai-ui` run — **626 tests of our own**, checked against
the suites by CI so the number cannot drift again. `ai-memory` runs the six
memory agents as a tree. **`ai-storage` still does not exist.**

Two projects run **on** the OS, and as of today both of them run **in CI**:

- [`projects/coclea-sr/`](projects/coclea-sr/) — **28 gates / 135 checks, all
  green**, every §10 milestone closed, `make reproduce` REPRODUCED. The narrative
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

Regenerate the site demo after any desk change:
`cd ai-ui && node scripts/build-demo.ts --out ../../evolvingagentslabs.github.io/demo/index.html`

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

**What is left is not construction.** Watch the first few nightlies: every
command in `projects.yml` was run by hand before the workflow was written, but a
scheduled job nobody has seen succeed is a scheduled job. And **the full 135
checks still have to complete somewhere** — the local run was stopped at 67, the
first CI run was cancelled by a push, and `cancel-in-progress` is `false` now so
the next one can finish.

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

## 7. `ai-storage`, against 3.0

Unchanged and last. A second long-horizon fixture written to a different shape by
a different hand, and the open question answered on paper against two real flows
— *when two notes say the same thing, which survives?* — before any store is
built.

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
