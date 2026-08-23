# Next

> **Snapshot, 2026-08-23.** A plan is the document most likely to rot, so this
> one is short and dated. The previous version carried `2026-08-09` and was
> nineteen merged pull requests behind by the time anybody noticed — which is the
> finding that produced [19](doc/19-what-would-make-this-matter.md).
> If this disagrees with `doc/`, `doc/` is right.

## Where things stand

`ai-base`, `ai-flows` and `ai-ui` run — **626 tests of our own**, checked against
the suites by CI so the number cannot drift again. `ai-memory` runs the six
memory agents as a tree. **`ai-storage` still does not exist.**

Two projects run **on** the OS:

- [`projects/coclea-sr/`](projects/coclea-sr/) — **28 gates / 135 checks, all
  green**, every §10 milestone closed, `make reproduce` REPRODUCED. The narrative
  is [18](doc/18-from-a-hypothesis-to-a-therapeutic-surface.md); what to do next
  on it is [doc/PLAN.md](doc/PLAN.md).
- [`projects/hemo-verified/`](projects/hemo-verified/) — H0 survives at **AUC
  0.906** against a kill threshold of 0.80.

**Both projects now run nightly** in
[`.github/workflows/projects.yml`](.github/workflows/projects.yml), built from
their manifests, with `check_reports.py`, `verify_ledger.py`, `check_slack.py`,
`make reproduce` and the published-number checks alongside. Until 2026-08-23
there was no Python in CI at all, and
[19 §7](doc/19-what-would-make-this-matter.md#7--what-running-p0-found-on-the-same-day)
is what building that found — including an attested `h0.json` that could not have
been produced by the code committed beside it.

Everything is merged to `main`, and [the site](https://evolvingagentslabs.github.io/)
serves a [playable desk](https://evolvingagentslabs.github.io/demo/).

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
cd ai-ui    && npm run typecheck && npm test
cd ai-flows && npm run typecheck && npm run typecheck:scripts \
            && DATABASE_URL="postgresql://aios:aios@localhost:55432/flowtest" npm test
cd ai-base  && npm run format:check && npm run lint && npm run lint:knip
cd ..       && DATABASE_URL="postgresql://aios:aios@localhost:55432/flowtest" \
               ./scripts/check-test-count.sh
cd ..       && python3 scripts/check-gate-count.py \
            && python3 scripts/check-h0-table.py
```

**The projects' own evidence**, which `ci.yml` does not run and
`projects.yml` does, nightly:

```bash
cd projects/coclea-sr    && python3.12 -m venv .venv \
    && .venv/bin/pip install -e ".[dev]" \
    && make gates && .venv/bin/python gates/check_reports.py \
    && python3 verify_ledger.py && python3 gates/check_slack.py
cd projects/hemo-verified && python3.12 -m venv .venv \
    && .venv/bin/pip install -e ".[dev]" \
    && make test && make reproduce
```

Regenerate the site demo after any desk change:
`cd ai-ui && node scripts/build-demo.ts --out ../../evolvingagentslabs.github.io/demo/index.html`

---

The order below is [19 § The plan](doc/19-what-would-make-this-matter.md#6--the-plan),
with the commands. Each item there states what "done" means and what would say it
was the wrong item; that is not repeated here.

## 1. P0 is done — what is left is to watch it

`scripts/check-gate-count.py`, `scripts/check-h0-table.py`, the extended
`check-test-count.sh`, `projects/hemo-verified/eval/reproduce.py` and the nightly
`projects.yml` are all in. The remaining work is not construction:

- **Watch the first few nightlies.** The workflow's commands were each run by
  hand before it was written, but the workflow itself has not run on GitHub. A
  scheduled job nobody has seen succeed is a scheduled job.
- **Decide what A4's per-oracle AUC means.** It moves 0.706 → 0.652 between BLAS
  builds because 66 of its 98 measurements are exactly `0.0` and one uncorrupted
  case crosses into that tie block. The README now says 0.652 and says the row
  moves; whether a `HARD` oracle should be reported with a rank statistic at all
  is a decision for whoever owns the science, not for the check that found it.
- **Regenerate `h0.json` on the machine the paper will quote**, now that it
  records its own environment. `make reproduce` then means bit-identity rather
  than a classification.

## 2. Seed the flow for M5's stopwatch, today

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

## 3. coclea §7.5, route B — the precondition

One run, and it is unchanged and not reordered: see [doc/PLAN.md](doc/PLAN.md).
The feedback correction must stay small against `u` across the whole `mu` range;
if it is not small at `mu_H = −0.02`, route B cannot reach criticality and route A
is required. Knowing that costs one run rather than a milestone.

## 4. hemo-verified H1

H0's own stated limit is that the corruptions and the oracles share an author. H1
is whether the portfolio ranks the errors a trained surrogate actually makes.
Decide **before** buying the training whether a published surrogate's errors will
do — F5, applied before the work.

## 5. One user who is not the author

`make up` from a clean clone on a clean machine, timed, by somebody who has not
seen this repository. Every failure becomes a FRICTION entry, fixed with the
shortest hack that works. The output is a number: time to a first gated result.

**Its first two lines have already been paid**, by accident: building P0 needed
both projects standing up on a machine that was not the author's, and neither
of them could be started from its own documentation — a committed `.venv`
symlink to one laptop, and a project with no manifest at all. Both are FRICTION
F9. That is the cheapest possible evidence that this item is not a nicety, and
it cost nothing to collect because something else needed it first.

## Smaller, if a session ends early

- **The remaining flow shapes.** `Sequence`, `Loop`, `Fan-out`, `Deliberation`,
  `Watch`, and merge. `Open` and `Gated` are the ones that run.
- **`?tab=` and `?select=` survive a reload on the demo but not its state** — the
  simulated world lives in the page. Fine, and the chrome says so; worth
  revisiting only if somebody asks.
- **The three upstream asks** in [`doc/upstream/`](doc/upstream/), still unsent.
  Their `CONTRIBUTING.md` wants human-written informal text, so these need
  rewriting in a person's voice, never pasting.

## What not to do

- **Do not touch `ai-base/`** without a line in `ai-base/AI-OS-PATCHES.md`. CI
  enforces it.
- **Do not add interaction to the flat explorer** (`ai-flows/src/view.ts`). It is
  M5's control arm and it is evidence only while it stays inert. A test enforces
  this too.
- **Do not publish a number that nothing checks.** That is how 315, 331 and 333
  ended up being three different truths on the same day — and how
  <!-- gate-count: superseded --> *26 gates / 125 checks* survived in thirteen places for six days after it stopped being true.
- **No more desk before the stopwatch**, and **no third project before a second
  user.**
