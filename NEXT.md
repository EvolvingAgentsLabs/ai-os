# Next

> **Snapshot, 2026-08-09.** A plan is the document most likely to rot, so this
> one is short and dated. If it disagrees with `doc/`, `doc/` is right.

## Where things stand

`ai-base`, `ai-flows` and `ai-ui` run. `ai-storage` does not exist. 397 tests of
our own; CI checks that number against the suites, so it cannot drift again.

Everything is merged to `main` in both repositories, nothing is open, and
[the site](https://evolvingagentslabs.github.io/) serves a
[playable desk](https://evolvingagentslabs.github.io/demo/).

## Getting the stack back up

Postgres runs in Docker as `aios-pg` on **55432** (`aios/aios`). Two databases:
`aiosui` for the live instance, `flowtest` for the test suite.

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
```

Regenerate the site demo after any desk change:
`cd ai-ui && node scripts/build-demo.ts --out ../../evolvingagentslabs.github.io/demo/index.html`

---

## 1. Run M5's stopwatch — start here

**Why first.** It is the only debt the design set itself, it is cheap, and it is
the one task that can save us from building on a false premise. Every other item
below assumes the desk is worth having.

**The measurement**, unchanged from [04-ai-ui § How this gets falsified](doc/04-ai-ui.md):
a person, and a flow **they did not run**, three days old. Time to answer *what
is the state, what is blocked, what did it produce?* — desk against the `web-ui`
transcript.

**The claim:** the desk is faster, and the gap widens with flow age.

**Check the headroom before building anything for this.** If the flat explorer
answers as fast as the desk, the canvas is decoration and M5 should be
re-argued rather than polished. That is a real outcome and the document already
says so.

Practical notes: the flow has to be three days old, so **seed it now and run the
comparison later in the week**. Two subjects is not evidence; it is a signal
about whether the instrument works at all. Say which.

---

## 2. `ai-storage`, for real

The shape is already fixed by the sketch on the desk and by
[05-ai-storage § The shape, drawn before it is built](doc/05-ai-storage.md):
four levels, one rung per promotion, provenance required, consolidation keeps
what carried forward.

**The open question is written down and is the whole difficulty:** when two
notes say the same thing, which survives? Consolidation cannot be a loop over
finished flows, and that is why.

The cheap first move is not a store. It is to answer that question on paper with
two real flows from `aiosui`, and only then decide whether it needs
`evolving-memory`'s connector or twenty lines.

**Do not port `evolving-memory`.** The hard half — *which steps of a trace
mattered* — is `contribution.ts`, which already runs on every flow.

---

## 3. M4, scoped memory

Its gate passed on 2026-08-06 (baseline 3.0 on a long-horizon fixture, so the
axis has room) and nothing was built. It overlaps item 2 and should be decided
together with it rather than scheduled separately.

---

## Smaller, if a session ends early

- **The remaining flow shapes.** `Sequence`, `Loop`, `Fan-out`, `Deliberation`,
  `Watch`, and merge. `Open` is the only one that runs.
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
  ended up being three different truths on the same day.
