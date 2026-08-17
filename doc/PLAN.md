# The plan, as of 2026-08-17 (end of day)

> **Project.** Written so work can stop here and resume without re-deriving
> anything. [08 · Roadmap](08-roadmap.md) is the milestone view;
> [18](18-from-a-hypothesis-to-a-therapeutic-surface.md) is the narrative; this is
> what to do next and why.

## The frame, and it changed today

The project is **COCLEA-SR**, and there is a thesis review on **2026-11-15**.

`ai-os` is not built to serve the thesis. **The thesis tells us what `ai-os`
should be**, and the channel is
[`projects/coclea-sr/FRICTION.md`](../projects/coclea-sr/FRICTION.md): every real,
repeated friction goes in, fixed with the shortest hack that works and never with
architecture. On 2026-11-15 that file is the specification, written by the work
instead of by enthusiasm.

The correction that produced this frame is recorded rather than smoothed over:
`ai-ui/src/gate-face.ts` was built while H9 — the only milestone still open from
the project's own §10 — had never been executed. That is solving friction with
architecture, and it is the pattern FRICTION.md replaces.

## Where the thesis stands

**Every milestone of §10 is closed, H1 through H9.** H9 ran for the first time
today: `make reproduce` re-ran E2, E3, E4 and B3 and reported **REPRODUCED** —
each result landed in its existing content-addressed directory, ledger verified,
28 entries.

**28 gates / 135 checks, all green**, where the specification asked for 17.

| | |
|---|---|
| **B2** — the main result | 24 of 24 curves, optimum at 11.6% of a parameter-free prediction |
| **E4** — physiological verdict | reachable to CF ≈ 1 kHz, and **not above** |
| **B3** — the two noises | sub-additive, −1.22 dB, CI [−1.58, −0.87] |
| **B1** + the Q gap | log-linear place map; Q 2.2–2.7 reported as a result |
| **§13** — pathologies | D1 (7 lesions → 6 signatures), D2 (graded audiogram), D3 (5 treatments → 4 signatures) |
| **§8** — attestation | bit-for-bit reproduction, hash chain verified |

**Three measured disagreements with the clinic, all found by gates and none by
reading:** the tuning direction under hydrops, the series-coupled active layer
([ADR-0007](../projects/coclea-sr/decisions/0007-the-active-layer-is-feedback-not-a-stage.md)),
and amplification repairing a raised threshold
([ADR-0008](../projects/coclea-sr/decisions/0008-a-raised-threshold-is-not-synaptopathy.md)).

---

## Next: §7.5, route B, answering (i) and (ii) together

**This is the recommendation, not a menu.**

### Why this and not something else

A reviewer will go here first. The modern cochlea **is** active — Hopf
criticality is the standard model — so a stochastic-resonance thesis that only
works on a passive membrane is a thesis about a model nobody believes describes a
living ear. The public write-up already promised it as the next experiment.

But the strong reason is **(ii)**, not (i). The project's original contribution is
not "there is SR in a cochlea model" — that reproduces a known phenomenon. It is
what §1.3 claims for itself:

> *un oscilador en el punto crítico de Hopf es el régimen donde el ruido tiene
> máximo efecto constructivo. La RE y la criticalidad de Hopf no compiten.*

**That synthesis is the thesis.** §7.5(ii) asks exactly whether SR and active
amplification are synergistic, redundant or independent. B3 already measured the
two *noises* as sub-additive; nobody has measured SR × amplification, which is
the claim that belongs to this project.

Both need the same machinery, so it gets built once.

### The precondition, which costs one run

Route B is perturbative: solve `u` passively, evaluate `z(u)`, hand the detector
`u + c_f Re(z)`. It keeps the exact OU scheme — which exists because **GATE-A13
measured Euler-Maruyama at 45.8% bias at the specification's own production
step** — and it satisfies §7.5's regression by construction, because `z → 0` as
`mu_H → −∞`.

**Its validity is measurable, so measure it before buying the sweep.** One curve:
the feedback correction must stay small against `u` across the whole `mu` range.
If it is no longer small at `mu_H = −0.02`, route B does not reach criticality and
route A is required — and knowing that costs one run rather than a milestone.

That is [FRICTION](../projects/coclea-sr/FRICTION.md) F5 applied *before* the
work. It was broken twice already, both times with the rule already written down.

### The falsification to register before running

Same shape as E10 v2, which stopped itself correctly:

* the regression at large `|mu_H|` must reproduce the passive curve, and the
  runner **returns non-zero** if it does not;
* both optima must be interior on the grid before the sweep is bought;
* and the null for (ii) is a **run arm**, not algebra — the linear integrator with
  the cubic deleted, which E10 v2 already has.

---

## Open, with routes named and deliberately not built

| | where | why it waits |
|---|---|---|
| **fibre-count axis** | [ADR-0008] | §13 is downstream of the thesis and already has enough to say. Nothing today represents hidden hearing loss, and PATHOLOGIES says so. |
| **hydrops factors** | PATHOLOGIES §7 | still the weakest inputs in §13, and the cheapest thing that could kill the section |
| **literature with web access** | `literature/comparison.md` item 4 | a precondition only if any of §13 leaves the repository |
| **§7.4 / E7** | [E7-RESULTS] | ran, came back null, reason measured. Orthogonal to the thesis. |
| **routing (ADR-0010)** | phase 0 done | ceiling **0.000** against a registered floor of 0.10. The mode matrix says the model is not the lever: 14 of 24 failures on the cheap and mid arms were `no_output` — termination, not capability. |

## What not to do with three months

Not the fibre axis, not E7, not more `ai-os` surface. Route A becomes the answer
only if the precondition says route B cannot reach criticality.
