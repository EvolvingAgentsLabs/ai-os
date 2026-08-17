# ADR-0007 — The active layer is feedback, not a stage in series

**Status:** accepted, 2026-08-17
**Supersedes:** nothing. **Depends on:** [ADR-0002](0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md)

## Context

Spec §7.5(i) is the one phase-2 question never run, and the one the project's
public write-up promised as the next experiment. [E10](../experiments/e10_sr_near_criticality.py)
was built to answer it: does criticality move `D_opt` beyond what plain
amplification explains?

The first version put the Hopf oscillator **in series** — the membrane's
displacement drives the oscillator and the detector reads `Re(z)`. It ran, it
produced numbers, and its own verdict said *"yes — compression moves it"*.

Both halves of that were wrong, and the two failures are different in kind.

## What the instrument got wrong, and what the model got wrong

**The instrument.** Five `mu` arms produced **two distinct optima**. `argmax` on a
geometric grid quantises the peak to `1.359x` per step, and the entire measured
effect was 1.8 steps — so the reported exponent `0.128` with a 95% interval of
`[-0.077, 0.333]` was a line fitted through a two-level staircase. The interval
excluded `2.0` for the same reason it would have excluded anything: the residuals
of a nearly constant series are nearly zero. **The check passed for the wrong
reason.**

Fixed by refining the peak with a three-point parabola in `log sigma`, clamped to
its own bracket. The two probe arms immediately separated from `1.757 / 0.951`
(two grid points) to `1.101 / 1.030` — and the effect got *smaller*, not larger.

**The model, and this is the load-bearing half.** Spec §7.5 says:

> *"La fuerza activa `Re(z_j)` **retroalimenta** a `F(x_j,t)`"*

The oscillator sits in **parallel, as feedback**: the membrane drives it, its
output adds to the force *on the membrane*, and the detector reads **`u`** — never
`z`. In series, the oscillator is a filter of gain `1/|mu_H|` that the signal must
pass through, so at `mu_H = -30` it attenuates thirty-fold, almost nothing crosses
the threshold, and the optimum runs off the end of the grid.

Measured: `sigma_opt` at the right-hand edge, peak `0.54 dB` against the passive
arm's `5.82`.

**So the series topology can never satisfy the specification's own regression
test.** §7.5 requires that `mu_H -> -infinity` recover phase 1. Under feedback it
does so by construction — `z -> 0`, the feedback vanishes, the detector reads the
plain passive membrane. Under series it cannot, at any `mu_H`, ever.

## Decision

**The active layer enters as feedback on the membrane's forcing, and the detector
reads the membrane.** The series arrangement is recorded here as falsified and
must not be re-implemented; anything that reads `Re(z)` at the detector is
measuring a different model.

**And the regression test runs before the sweep is bought, and stops the run.**
Version 1 computed the regression, printed `OUTSIDE one grid step`, and carried on
to produce five arms and a verdict. Version 2 returns non-zero. That difference —
between a check that reports and a check that refuses — is the reason the wrong
topology cost one run instead of a chapter.

## The route, named and not built

The correct coupling is bidirectional: the force on the membrane depends on `z`,
and `z` depends on `u`. That breaks the exact Ornstein-Uhlenbeck modal scheme
`stochastic.py` uses — which exists because **GATE-A13 measured Euler-Maruyama at
45.8% bias at the specification's own production step**.

Two routes, and this ADR takes neither today:

**A — co-integrate.** Step the modal system and the chain together. Correct at any
feedback strength, and it abandons the exact scheme; A13 says what step size that
costs.

**B — perturbative feedback.** Solve `u` passively, evaluate `z(u)`, and give the
detector `u + c_f Re(z)`. First order in the feedback, keeps the exact scheme, and
satisfies the regression by construction. **Valid only for weak feedback**, and
the validity is measurable rather than assumable: the correction must stay small
against `u` across the whole `mu` range swept, and at `mu_H = -0.02` it may not.

B answers §7.5(i) **in the weak-feedback regime only**. If the answer depends on
strong feedback, A is required and that is a milestone rather than an afternoon.
Saying which regime a number belongs to is the part that makes it publishable.

## Consequences

* §7.5(i) is **open**, and the write-up says so rather than carrying E10 v1's
  number.
* E10 v1's verdict is retracted in full. Its run directory is kept — the numbers
  are real, they are simply about a model the specification does not describe.
* GATE-H1 through H4 are untouched: they test the normal form and the calibration
  engine, neither of which depends on how the layer is coupled.
* The pattern repeats [ADR-0002](0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md)
  exactly — code that ran, numbers that looked like results, and an abstraction
  that was wrong. Twice in one project, both caught by a condition written before
  the run. That is the argument for writing them.
