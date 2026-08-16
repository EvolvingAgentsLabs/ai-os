# ADR-0005 — The calibration engine, and the prediction that falls out of it

**Date:** 2026-08-15
**Status:** built, gated, and measured. The prediction is **not yet tested**
against data and is stated so it can be.
**Raised by:** the observation that thirty years of validated stochastic-resonance
results in cochlear implants produced **zero products**, and that the blocker was
never the science but the fact that `D_opt` is individual.

## The problem this addresses

Adding noise to cochlear-implant stimulation has been shown to help — Morse &
Evans (1996), Zeng, Fu & Morse (2000), and the human envelope-modulation work
that followed. No implant or hearing aid ships it. The industry went the other
way; the current Mayo/Phonak trial is on deep-network noise *reduction*.

The reason is structural rather than scientific. The SR curve is an **inverted
U**: too little noise does nothing, too much makes perception worse. The optimum
depends on residual physiology, electrode position, stimulus level. A feature
that helps some patients and harms others cannot be approved. **What was missing
was a way to estimate one ear's optimum from data a clinic already collects.**

## What was built

`src/coclea/fitting.py`, on two closed forms that were already here:

| clinical observable | closed form | gives |
|---|---|---|
| spontaneous rate `r0`, fibre CF | `truth/rice_inverse.py` — `θ/σ = √(2 ln(ω_eff/2π r0))` | threshold-to-noise ratio, **no displacement scale anywhere** |
| compression knee of the loudness-growth curve | `truth/hopf_normal_form.py` — `F_knee = |μ_H|^{3/2}` | distance to criticality |

`prescribe()` returns the noise to **add**, as a fraction of threshold, with an
asymmetric interval propagated from the rate's own uncertainty — asymmetric
because `θ/σ` depends on `r0` under a logarithm, which
[ADR-adjacent notes in `truth/rice_inverse.py`] record getting wrong once.

**The output that makes it shippable is the zero.** An ear already at or past its
optimum gets `add_noise_fraction = 0.0` and a verdict saying more would reduce
detection. An engine that always returns a dose is the engine nobody could
approve.

Gates: **H1** (compression exponent 1/3 at criticality), **H2** (linear limit and
gain `1/|μ_H|` far below), **H3** (the knee sits at `|μ_H|^{3/2}` — the one H1 and
H2 cannot both fake), **H4** (seven checks on the prescription, each against a
`truth/` module rather than against the engine itself). All green.

## The prediction, which was not the plan

Setting `θ/σ = 2` and inverting Rice gives the spontaneous rate at which a fibre
sits exactly at its optimum:

    r0* = CF · e^{-2} = 0.135 · CF

Spontaneous rates in the auditory nerve run **0 to ~100 spikes per second**,
bimodally, with ~60% above 18 sp/s — and that range does **not** scale with CF
(Liberman 1978; confirmed 2026-08-15 rather than taken from the spec). So:

| CF | `r0` needed to reach the optimum | within physiology? |
|---|---|---|
| 500 Hz | 67.7 sp/s | **yes** — high-SR fibres are already there |
| 1 kHz | 135 sp/s | no |
| 4 kHz | 541 sp/s | no, by a factor of five |

**Added noise is predicted to help at high CF and to be useless or harmful at low
CF for high-spontaneous-rate fibres.** The benefit should be
**frequency-dependent**, and a fitting product should therefore prescribe **per
channel**, not per patient.

Two things sharpen it. First, high-SR fibres also have *lower* thresholds
(Liberman's classification ties SR inversely to threshold), which pushes their
`θ/σ` down further and moves them further onto the falling side — so the ordering
is more robust than the table alone shows. Second, a literature search for
frequency- or channel-dependence in the published SR-in-implants results returned
none reporting it, which is what makes this a prediction rather than a
restatement.

## How this was nearly missed

`test_h4_prescribes_nothing_for_an_ear_at_or_past_the_optimum` was written
asserting that 100 sp/s at 1 kHz is past the optimum. It is not — it lands at
`θ/σ = 2.15`, just short. The gate went red, the assumption was wrong rather than
the code, and chasing *why* is where the CF dependence came from. The failing
test is preserved as the frequency test's docstring rather than deleted.

## What would falsify it

Any study measuring SR benefit across implant channels that finds it **flat in
frequency**, or larger at apical (low-CF) channels. That is a re-analysis of data
that may already exist, not a new experiment — which is the cheapest possible
falsification and the reason to state the prediction this sharply.

## What this is not

Not clinical advice and not validated in humans. Every number here is a statement
about the model. `fitting.py` says so in its own docstring, and the verdict
strings it emits never contain a dose in physical units.
