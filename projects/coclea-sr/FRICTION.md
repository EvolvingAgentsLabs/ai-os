# FRICTION.md — what the thesis needed that the tooling did not have

**Rule for this file.** Write the friction down; **fix it with the shortest hack
that works and keep going.** Do not fix it with architecture. **Whenever the next
thing gets built, this file is its specification** — written by the work instead
of by enthusiasm.

No date. An earlier version of this line carried one and it was invented: it came
from a brainstorm pasted into a conversation, not from anything anybody
committed to. A file about not fooling yourself is a poor place to keep a
deadline nobody set.

An entry earns its place by being **real and repeated**. A thing that annoyed
somebody once is not friction, it is a bad afternoon. Each entry records what
happened, the hack that unblocked it, and — only if it is genuinely known — what
the right fix would look like. Guessing the right fix is how this file becomes a
design document, which is the failure mode it exists to avoid.

---

## The ones that have already cost real time

### F1 · A number that is wrong for a reason nobody can see

**Hit:** four times, and each cost between an afternoon and a run.

* GATE-A12's precision floor rose as fast as the discretisation error fell, so
  the fitted order was partly a measurement of the eigensolver.
* E7 published per-flow dollar figures that were the *previous* flow's spend,
  because the account counter lags five to six minutes and a flow takes four.
* R0's first version scored an empty completion as `reward = 0.0`, which reads as
  "the cheap model cannot do this" and means "the provider returned nothing".
* E10 v1 fitted an exponent through a two-level staircase and its own check said
  the interval excluded 2.0 — for the same reason it would have excluded
  anything.

**Hack:** every measurement carries its own floor, and every failure carries a
*label* rather than a score. `no_output` and `wrong` are different rows.

**What the right fix might be:** unknown, and deliberately not guessed. The
pattern is "a scalar was the wrong instrument", but four instances is not enough
to know whether the fix is a type, a convention, or a habit.

---

### F2 · Re-running everything when one parameter moves

**Hit:** every time a profile constant changed. `make gates` is nine minutes;
A09 alone is over 100 seconds and A05 is 12, while everything else is
sub-second.

**Hack:** a documented four-gate subset that finishes in 1.7 seconds, in
`CLAUDE.md`, for the loop; the full suite before a commit.

**Still friction:** the subset is chosen by hand and nothing checks it is still
the right four.

---

### F3 · Reports outliving their tests

**Hit:** twice, and once it held every gated freeze REFUSED for a day. `gates/reports/`
is never cleaned, so a renamed or moved test leaves its old report behind — red,
forever — and `ai-flows/src/gates.ts` reads that directory to compute the verdict.
One of the two orphans was from a test that had merely **moved to another
module** and was passing there.

**Hack:** `gates/check_reports.py`, which compares `(gate, test)` pairs and
refuses to prune when collection is untrustworthy — a module that stops importing
makes every one of its reports look orphaned, and deleting those would turn a red
gate green.

**Still friction:** it is a separate command somebody has to remember. It was
documented with the wrong interpreter for a week (`python3` has no pytest, so it
refused silently every time it was invoked as written).

---

### F4 · Provenance that has to be re-derived to be trusted

**Hit:** continuously. Every figure, every table, every number in the write-up.

**Hack, and this one worked well enough to keep:** content-addressed run
directories (`runs/<id>-<hash>/`), a hash-chained `ledger.jsonl`, run ids and
manifest hashes in the PNG's own metadata, and `verify_ledger.py` in stdlib only.
`make reproduce` re-runs the experiments and checks each result lands in its
**existing** directory — same content, same hash, same path.

**What it did not cover:** the attestation caught its own store once. That is in
the README and is the reason this row says "well enough" rather than "solved".

---

### F5 · A control arm that is derived instead of run

**Hit:** twice in one week, and the second time knowing about the first.

* E7 bought three arms without checking the baseline had headroom. It did not:
  forty of forty agent claims landed inside 0.034 against a 0.25 tolerance, every
  arm tied, and a tie reads as a result.
* E10 v1 wrote its null hypothesis as algebra (`D_opt ~ |mu|^2`) and compared a
  fit against it, instead of **running a linear arm**. The rewrite deletes one
  term from the integrator and calls that the control.

**Hack:** the stopping condition goes in the runner, before the run, and the
runner **returns non-zero**. E10 v2 refuses to buy the sweep when the regression
fails; v1 printed `OUTSIDE one grid step` and carried on to five arms and a
verdict.

**This is the entry with the strongest claim on whatever comes next.** The rule
was already written in `CLAUDE.md` and was broken twice anyway, so the fix is not
documentation.

---

### F6 · The model being wrong looks exactly like the code being right

**Hit:** twice, and both are ADRs rather than bugs.

* [ADR-0002] — the graded string ran, passed several low-level gates, and its
  traveling wave died twenty-eight orders of magnitude before the place it was
  tuned to. The abstraction was wrong; the code was not.
* [ADR-0007] — the Hopf layer in series ran, produced numbers, and its own
  verdict said "yes". The specification says the active force **feeds back**;
  in series it can never satisfy the regression test the specification asks for,
  at any parameter value.

**Hack:** an acceptance condition registered *before* the replacement is built,
and redesigns **counted** — once is fine, twice is suspicious, by the third it is
looking for the result rather than measuring it.

**What the right fix might be:** nothing tooling-shaped. This is what gates are
for and they worked. Recorded because it is the project's most valuable event
type and any future tooling that makes it harder to notice is a regression.

---

### F7 · The one that is not solved

**Hit:** every stochastic experiment. `make gates` is nine minutes, E3 is longer,
and the factorial in §7.2 multiplies by seeds. Nothing here is parallel except by
hand.

**Hack:** none. Runs are launched in the background and the results are read
later.

**Cost so far:** tolerable. Recorded now so that if it stops being tolerable
there is a date attached to when it started.

---

### F8 · A file that only Python can read

**Hit:** three venues now, and each time it presented as something else.

* **Gate reports** — two GATE-A10 reports carried an SNR of `-inf`, and
  `ai-flows/src/gates.ts` failed with *"No number after minus sign"*. The
  TypeScript seam then saw **zero** gate reports and skipped four drift tests
  rather than failing: an interchange break that presented as a quiet loss of
  coverage.
* **Run results** — found on 2026-08-17 by `verify_ledger.py` while closing H9.
  Two attested `result.json` files, *intact but not valid JSON*, carrying a bare
  `NaN` and a bare `-Infinity`. The hash chain was fine; the format was not.
* **And the reason it recurred:** the sanitiser existed and was correct.
  **Five runners called it and six did not.**

**Hack:** move it into `attest.canonical`, which is the one function every
attested write goes through, and add `allow_nan=False` so anything the sanitiser
misses raises at write time. One line of behaviour in one place, instead of six
call sites and a convention.

**What this says about the pattern:** the failure was never the missing rule. It
was a rule enforced by remembering, in six places, on a boundary nobody looks at.
`verify_ledger.py` — under a hundred lines, stdlib only — is what found it, and
it found it by refusing to conflate *intact* with *valid*.

---

### F9 · A project that only its author can start

**Hit:** once, and it is the first time anybody tried. On 2026-08-23 both
projects were built from a clean clone on a machine that was not the author's:

* `projects/coclea-sr/.venv` was a **committed symlink to an absolute path on
  one laptop** (`/Users/…/coclea-sr/.venv`). It is in `.gitignore` and it was
  tracked anyway, so a fresh clone gets a dangling link and `uv venv .venv`
  refuses with *File exists*.
* `projects/hemo-verified` had **no manifest at all**. The `Makefile` called
  `.venv/bin/python`, the README said `make test`, and nothing anywhere said
  what to install or how to build the environment.

**Hack:** the symlink is deleted and untracked; `hemo-verified` gets a
`pyproject.toml` naming its three importable packages, because a flat layout
makes setuptools refuse otherwise; and the README's *Run it* block now starts
with the two lines that build the environment.

**What this says about the pattern:** every other entry in this file was found
by the work. This one could only be found by somebody who did not already have
it working, which is the one thing a single-author project cannot do for itself
— and it is why *one user who is not the author* is an item on the plan rather
than a nicety.

---

### F10 · An attestation nobody attested

**Hit:** once, and it went through the commit that existed to prevent it.

`eval/h0.py` writes `runtime: {seconds}`. The committed `gates/reports/h0.json`
carried a top-level `seconds` and no `runtime` at all — and that nesting was
introduced by **#59, the commit titled "H0 was not reproducible, and it looked
like it was"**. So the attested report in the repository could not have been
produced by the code in the repository: it was regenerated in the middle of the
change and never again.

Underneath that, a second thing the same clean run surfaced: the composite AUC,
the Spearman coefficient, the decision counts and the false-accept rate came
back **bit-identical** across machines, and `A4 alone` moved 0.706 → 0.652. 66
of A4's 98 measurements are exactly `0.0`, so one uncorrupted case sitting at
`1.03e-13` on one BLAS and `0.0` on another crosses into a 66-wide tie block and
drags a rank statistic with it. The composite never moves because A4 is `HARD`.

**Hack:** `make reproduce` for `hemo-verified`, mirroring the one this project
has always had; `h0.json` records the environment it was produced on, so the
check can tell *disagrees* from *was produced somewhere else*;
`scripts/check-h0-table.py` refuses to let the README and the artifact say
different things; and the nightly `projects.yml` workflow runs all of it.

**What this says about the pattern:** #59 added a test that runs the pipeline in
two processes and demands they agree exactly. That test is right and it is
blind here, because both processes share one BLAS and neither of them is the
artifact in `git`. **A reproducibility test that never reads the committed
artifact is testing the code against itself** — which is [F5](#f5--a-control-arm-that-is-derived-instead-of-run)'s
shape again, one level up.

---

## Deliberately not recorded

Things that were annoying once and are not friction: a shell without `timeout`, a
GitHub outage, a transposed axis on a 3-D array. They cost time and they are not
evidence about anything.
