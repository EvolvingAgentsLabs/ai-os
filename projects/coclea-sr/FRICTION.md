# FRICTION.md — what the thesis needed that the tooling did not have

**Rule for this file.** Write the friction down; **fix it with the shortest hack
that works and keep going.** Do not fix it with architecture. On 2026-11-15 this
file is the specification for whatever comes next, written by the work instead of
by enthusiasm.

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

## Deliberately not recorded

Things that were annoying once and are not friction: a shell without `timeout`, a
GitHub outage, a transposed axis on a 3-D array. They cost time and they are not
evidence about anything.
