# E7 (§7.4) — the explorer:verifier ratio bought nothing, and we should have known

**Run `runs/e7-ratio-0d94334574ea`, 2026-08-17. `qwen/qwen3.8-27b` against a live
`ai-os`. Ten flows, forty agent claims, ~$1.**

## The result

| arm | n | accuracy | dissent per verifier | corrections | mean $ | mean s |
|---|---|---|---|---|---|---|
| 5:1 | 3 | **100%** | 0% | 0/0 | 0.1487 | 470 |
| 2:1 | 4 | **100%** | 0% | 0/0 | 0.0555 | 268 |
| 1:1 | 3 | **100%** | 0% | 0/0 | 0.1228 | 292 |

**Null.** Verification bought nothing, because there was nothing to buy. Every
arm was already right.

`corrections` is `0/0` and the denominator is the finding: it counts flows where
the explorers' median was wrong to begin with, which is the only place
verification can demonstrate its worth. That never happened once.

## What the agents actually said

Forty claims. Ground truth **1.016**, tolerance ±0.25:

    5:1  1.0027 … 1.0130
    2:1  1.0036 … 1.0366
    1:1  1.0029 … 1.0104

The **entire spread across every agent in the experiment is 0.034**, against a
tolerance of 0.25 — seven times narrower than the band that would have counted as
correct. Nobody was near being wrong.

## The one retraction, and why it is not one

`2:1 rep 1` is the only flow flagged as a retraction in the whole run. A verifier
said **WRONG** in prose and then produced **1.0366**, which agrees with the
explorers' 1.0102 to within 0.026 — a tenth of the tolerance.

So the flag came from the word and not from the number. The unbiased metric
(`dissent per verifier`, one roll per verifier rather than one per
explorer-verifier pair) reports **0%** for that arm, and the biased one reports
25%. This is exactly the divergence `e7_analyse.py` was written to expose, and it
turns out to matter on the only positive case in the run:

> **A verifier that says "WRONG" and then agrees numerically has not retracted
> anything.** It has produced prose that a metric keyed to prose will count.

## Why the experiment came out empty — and it is our own rule

The task was chosen to be error-prone in a documented way. `lumped-full-cell` is
second order in the interior and first order at the free end; every docstring in
`assembly.py` says "second order" about the interior stencil. An explorer that
**reasons from the code** answers 2. One that **measures** answers 1.

Forty out of forty measured. Given an `execute` tool, this model does not reason
from docstrings — it runs the sweep.

That is a real and mildly encouraging finding about the model and the harness. It
is also a fatal one for the experiment, and the rule we broke is written in our
own `CLAUDE.md`:

> **Check headroom before building the treatment, never after.** If the baseline
> already sits at the ceiling, no treatment can move it and every arm ties —
> which reads as a success.

Every arm tied. The baseline sat at the ceiling. **One cheap control arm, run
before the other two were bought, would have said so** — and the file that says
to do that is the file this experiment was designed under. Writing a rule down is
not the same as applying it.

## What is not reported, and why

**No cost curve.** The three means are `0.1487 / 0.0555 / 0.1228` — not monotone
in verifier count, and the within-arm spread (`0.0254` to `0.2173` on equivalent
flows) is larger than any difference between arms. The measurement is a delta of
OpenRouter's **account-wide** `total_usage`, it includes retried flows, and it has
never been cross-checked against a second endpoint that disagrees with it. §7.4
asks for a cost/quality curve; this run has no quality axis to plot cost against
and a cost axis that is not trustworthy. Publishing the numbers as a curve would
be publishing noise with a shape.

**No recommendation about ratios.** A null on one task at one difficulty is not
evidence that verification is worthless; it is evidence that this task could not
detect it.

## Two harness defects the run found, which is what the workload is for

Neither is about the ratio, and both were only findable under live load:

* **A flow could wait forever.** An attempt sat `running` for **3,316 seconds**
  while the flow reported `waiting` — the same state a healthy flow reports.
  Fixed with a stale-attempt reaper (`staleAttemptMs`), three tests.
* **The price tag destroyed the measurement.** A transient DNS failure on the
  cost endpoint raised out of `spend_so_far` at the line *after* a flow had
  finished, discarding a measured answer because its price could not be read. The
  probe now retries and then returns `null`; the row keeps its answer, and the
  summary reports `n_priced` beside `n` so a mean is never quietly computed over
  a smaller set than it claims.

The first cost an hour of wall clock. The second cost four flows and about $0.40.
Both are the kind of thing a workload with an oracle finds and a prose task never
generates.

## What would actually answer §7.4

A task where the plausible answer is wrong **and the model reaches for it**. This
one failed the second half. The candidate is a level-3 style diagnosis: not
*"measure this number"* but *"this result is wrong, find out why"* — where the
explorer has to locate a defect rather than run a sweep, and where measuring is
not available as an escape.

Before buying any arm of that, run **one** flow of the plainest configuration and
check that it fails often enough to leave room. That is the control this run
should have started with.
