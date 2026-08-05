# 11 · Choosing a model — the lift is not the number that decides

<img src="assets/11-choosing-a-model.jpg" alt="" width="100%">

<sub>Two lifts that each look like a result. The gap between their tops is the only number that decides — and it swaps sign.</sub>


> **Status: estimators implemented and tested. No model comparison has been run.**
> `stats.ts`, `conformance.ts` and `tasks/physics.ts` — 97 tests **[ran]** across
> `ai-flows`. There is no task suite and no second model yet, and this document
> is careful to say which claims are cited and which are measured.

## The question, and the trap inside it

Can a small model behind a good harness replace a frontier model?

The reflex is to measure the harness lift: score the small model bare, score it
with tools, subagents, memory and structured context, and read the gap. That
number is always large and it is always beside the point.

**Your competitor runs a harness too.** So the comparison that decides anything
is `small+harness` against `frontier+harness`, and the small model closes the gap
only if the harness lifts it *more*. That difference of differences — the
**interaction term** — is the quantity, and it can be near zero while both lifts
are enormous.

```
                     bare        harness        lift
  small              0.03          0.90        +0.87
  frontier           0.14          0.88        +0.74
                                          interaction  +0.13
```

Two lifts that would each headline a blog post, and a decision that hangs on the
third number.

## Three things the literature already settled

Paid for by reading rather than by GPU time.

**The sign flips with difficulty.** A pre-registered controlled comparison —
three scaffolds × five models × GAIA Levels 1 and 2, tasks fixed, three attempts
per question ([arXiv:2606.08529](https://arxiv.org/abs/2606.08529)) — reports
that the prediction that stronger models are less scaffold-sensitive *"is
rejected in direction"*: the most capable model **gained the most** from
structured scaffolds at the harder level, and tier-scaling held only at the easy
level. Substitution on easy work, complementarity on hard work.

**So a single pooled interaction term is not a finding.** It can sit at zero
while the effect is strongly positive on easy tasks and strongly negative on hard
ones. `interactionByStratum` and `crossingPoint` exist because **the crossing
point is the product boundary**: below it a small fleet is defensible, at and
above it the frontier pulls further ahead the better your scaffold gets.

**Task structure decides more than model choice.** Multi-agent coordination gives
**+80.9%** on decomposable tasks and **−39% to −70%** on sequential reasoning; an
orchestrator that validates contains error amplification to **4.4×** against
**17.2×** for independent parallel agents; and architecture is predicted from
task structure at R² = 0.513, correct for 87% of unseen tasks
([Google Research](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/)).

**Per-step compounding has support.** Agent success on longer tasks is well
modelled by a constant per-step failure rate — exponential decay, each agent with
a half-life ([arXiv:2505.05115](https://arxiv.org/abs/2505.05115)). That is
`r^h`, the same law as `(1−δ)^w` in [10](10-observability.md). The author flags
generalisation as unknown, so `calibrateCompounding` checks it on real data
rather than assuming it.

## What building it found **[ran]**

The estimator has a failure mode nobody predicted, and it fails in the expensive
direction.

Log-odds is undefined at 0 and 1, so cells are corrected by adding ½ before the
transform. That correction also *shrinks* extremes — and it shrinks an arm near
the floor by a different amount than an arm near the ceiling. The two lifts are
compressed unequally and the difference of differences inherits the gap.

Measured against a construction whose true interaction is **exactly zero**:

| steps per item | 4 | 8 | 16 | 32 | 64 | 128 |
|---|---|---|---|---|---|---|
| measured interaction | **+0.597** | **+0.394** | **+0.211** | +0.067 | −0.002 | −0.001 |
| clears zero? | **yes** | **yes** | **yes** | no | no | no |

The first three columns are false positives, and every one of them points toward
*"ship the small fleet"*. An evaluation with eight observations per item would
have produced a confident, wrong, expensive answer — from a harness that does
nothing.

Thirty-two is where the null came back; sixty-four recovers the true sign almost
exactly (−1.248 against −1.221, +1.199 against +1.221). So `MIN_STEPS_PER_ITEM =
32`, and every `Interaction` carries `minStepsPerItem` and an `underpowered`
flag. **A decisive result under that flag is not evidence**, and the flag travels
with the number so nobody reads the verdict without the thing that invalidates
it — the same rule [10](10-observability.md) applies to δ.

## The silent failure that looks exactly like a finding

`conformance.ts` is a gate, not a diagnostic, and it exists for one specific
reason.

An adapter can fail without raising anything: a model that answers correctly in
prose and never calls the tool, a response whose content lands in a field the
caller does not read, degradation that only appears once history accumulates.

If tool calls are silently dropped, **every harness condition scores as bare**.
The lift vanishes, the interaction term goes to zero, and the result is
indistinguishable from an honest finding that the harness does not help this
model. Nothing in the statistics can tell the difference.

So: five checks, all failing loudly; the result recorded next to the evaluation
it authorises; and a **24-hour expiry**, because a local endpoint can be
restarted with a different quantisation between one day and the next and the eval
would never know. An evaluation whose adapter was not verified is not evidence.

## What follows for the product

Not a ship / do-not-ship verdict. A design constraint, and every clause of it is
carried by a number above:

> **A small-model fleet is viable for short, verifiable, decomposable hops behind
> a validating orchestrator. It is not viable as a long, autonomous, sequential
> chain.**

Short: frontier models succeed on <10% of tasks taking a human over four hours
([METR](https://metr.org/blog/2026-1-29-time-horizon-1-1/)). Verifiable:
correction only works where intermediate states can be checked. Decomposable:
+80.9% against −70%. Validating orchestrator: 17.2× → 4.4×.

The negative half is over-determined — the remaining open-vs-closed gap
concentrates in reasoning, long-context retrieval and agentic capability
([Epoch](https://epoch.ai/data-insights/open-closed-eci-gap)), multi-agent
degrades sequential work, complementarity favours the frontier on hard tasks, and
per-step error compounds. Four independent results, one direction.

## The task suite: less wrong, measured **[ran]**

The estimators needed something to estimate from, and the workload had to satisfy
one hard requirement — an oracle that is exact, so a disagreement is the model's
and not the grader's. `ai-flows/src/tasks/physics.ts` builds one from physical
systems where a first approximation is wrong, a fuller model is *less* wrong, and
both are computable to machine precision.

The shape is Asimov's *The Relativity of Wrong*: a flat earth is wrong, a sphere
is wrong, an oblate spheroid is wrong, and the wrongness shrinks. Newtonian
kinetic energy is not false — it is the leading term of the relativistic one. A
pendulum is not a harmonic oscillator, but at five degrees you cannot tell.

Four systems, each with its linear limit: pendulum period (small-angle → exact
elliptic), kinetic energy (Newton → relativity), population (exponential →
logistic), falling body (vacuum → linear drag).

**Difficulty stops being a label and becomes arithmetic.** A task asks for an
answer within a relative tolerance τ, and whether the first approximation clears
τ is *computed*:

| | |
|---|---|
| **L1** | the linear model already clears τ |
| **L2** | it misses, but within 10× τ |
| **L3** | it misses by more than 10× τ — only the full model will do |

That matters more than it sounds. The stratification that decides where the
interaction term flips sign now rests on a calculation instead of on someone's
opinion of what is hard. And **sweeping τ walks one physical question up the
ladder without changing the subject** — same system, same parameters, same
phrasing, only the required precision moves — which rules out the confound most
difficulty stratifications cannot.

At 128 tasks the levels come out near L1 65 / L2 21 / L3 42, stable across seeds,
with every system present at every level.

**The tools become load-bearing**, which is the other reason this suite works: an
elliptic integral to six figures is not something a model does in prose. A bare
condition genuinely cannot do what a sandboxed one can, so the harness lift being
measured is real rather than simulated.

**And the undetected-error rate becomes measurable.** Every prompt permits the
answer `UNSURE`. A wrong number stated confidently is an *undetected* error; the
same wrongness flagged is a *detected* one. That distinction is normally hard to
instrument and here it is one branch in the grader. `errorReduction` reports how
much less wrong an answer is than the linear model — 1 for exact, 0 for merely
reproducing the approximation, **negative for doing worse than not modelling the
nonlinearity at all.**

### Two oracle bugs the tests caught

Both in the same place, and both would have corrupted exactly the L1 tasks.

The textbook relativistic form `(1/√(1−β²) − 1)·c²` subtracts a number just above
1 from 1 at low speed, destroying about eleven significant digits before
multiplying the wreckage by `c²`. The textbook drag form differences two values
near 3×10⁹ to recover a 44 m fall, and returned 42.05. Both were caught by tests
asserting the approximation is the correct limit — not by inspection.

Rewritten without the cancellation (`β²/(s(1+s))`, and the drag bracket by series
below the crossover), the relativistic correction now tracks its analytic
prediction ¾β² across seven orders of magnitude.

**The failure regime in both cases was the limit where the simple model is nearly
right** — so a suite built to measure how much less wrong the harder model is
would have been graded against noise precisely where the easy answer was correct.

### What this suite is not

Textbook systems, and a model may have memorised the method. Parameters are
randomised so the *answer* must be computed rather than recalled, but the
approach certainly is not novel to anyone. **This is a calibration suite for the
instrument and a first read on where the crossing point sits. It is not a legal
or literary workload**, and a result here transfers to those as a hypothesis, not
as evidence.

## How this gets falsified

**The estimators** are falsified by their own calibration: they must recover a
known construction's sign across substitution strengths and return the null when
the harness is capability-neutral. That is a test, it runs in CI, and it is what
caught the shrinkage bias above.

**The per-step programme** is falsified if `r^h` does not predict trajectory
success — if failures are correlated across steps rather than independent.
`calibrateCompounding` reports observed against predicted per hop count; a large
mean absolute error means per-step measurement does not compose, the trajectory
has to be the unit after all, and the sample sizes that costs are the ones §
above says are out of reach. **Test it on the first real suite, at no extra cost.**

**The product conclusion** is falsified if a small model behind a validating
orchestrator holds up on long sequential work in a real workload, against four
results predicting it will not. That would be the most interesting outcome
available here.

## What is not built

Stated in the present tense, per house rule 3.

- **No run against a model.** The suite exists and grades correctly; nothing has
  been scored with it. The next step is a real workload labelled by human-time
  length, sequential-versus-decomposable, and verifiability — three labels, no
  models, and between them they predict most of the answer.
- **No second model.** `deepseek/deepseek-v4-flash` runs on `pi` and its δ is
  measured ([10](10-observability.md)). Nothing else is wired, and **no local
  model has passed conformance, because none is running.**
- **No ε and no u.** Task error and silent-failure rate need an oracle per task.
- **Trajectories are not flows yet.** They should be, once M2's engine exists: a
  `Flow` with *h* steps **is** a trajectory of *h* hops, and
  `Attempt.observation` is already the per-step record (ADR-0007). Then `r` falls
  out of `flow_attempts` instead of being fitted, the eval measures the system
  that ships rather than a simulation of it, and it becomes the falsification
  harness [03](03-ai-flows.md#how-this-gets-falsified) already owes. **Nothing
  here may delay M2.**
