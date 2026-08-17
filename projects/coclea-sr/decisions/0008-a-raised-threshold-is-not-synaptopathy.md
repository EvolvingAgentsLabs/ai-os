# ADR-0008 — A raised threshold is not synaptopathy

**Status:** accepted, 2026-08-17
**Depends on:** [ADR-0006](0006-pathology-as-a-parameter-transform.md)
**Retracts:** PATHOLOGIES.md's claim that a hearing aid works for conductive loss
*and only for it*, and the `synaptopathy` row's description as a lesion with a
normal audiogram.

## Context

[GATE-D3](../gates/test_D03_treatment_signatures.py) was written to decide whether
a causes-by-treatments matrix was worth writing at all: do the modalities move
different observables, and does each one fail on something?

Four of its five checks passed, and the discrimination they test is real —
`amplification`, `amplifier-agent`, `fluid-agent` and the two path-changing
treatments move four distinct sets of observables, and the **place map is moved
by the fluid agent alone**, which is §5.3's clinical claim standing.

The fifth went red. Amplification improves detection on **every** lesion,
including `synaptopathy`, by a factor of 2.6e15.

## The contradiction it found, and it is inside §13 rather than in the arithmetic

Two sentences in `PATHOLOGIES.md`:

> line 96 — *"a pure attenuation … which is why a hearing aid works for it **and
> only for it**"*
>
> line 106 — *"the audiogram, the tuning curve and the compression curve are all
> normal. **This is what 'hidden' means**"*

They cannot both be true of a lesion modelled as `theta x 1.8`.

**A raised `theta` is a raised audiogram threshold**, because `theta` is what the
tone has to cross for the ear to report hearing it. And a raised threshold is
precisely what amplification repairs — the model's arithmetic is right and says
so: raising the drive lifts both tone and noise through the threshold, Rice's
crossing rate goes with `exp(-theta^2 / 2 sigma^2)`, and the improvement is
enormous.

So the defect is the representation, not the model:

> **`theta` up is a sensitivity loss. Hidden hearing loss is hidden because
> sensitivity is intact.**

Cochlear synaptopathy loses **fibres** — low-spontaneous-rate, high-threshold
ones first. The surviving high-SR fibres are the ones that set threshold, so the
audiogram stays normal while suprathreshold coding in noise degrades. The
quantity that falls is the **redundancy of the readout**, and this model has one
detector and no axis for it.

## Decision

**`theta` remains in the catalogue as what it is — a detector sensitivity loss —
and stops being called synaptopathy.** Nothing in the model represents hidden
hearing loss today, and PATHOLOGIES says so rather than implying otherwise.

**The retracted claims are struck, not deleted.** "A hearing aid works for
conductive loss and only for it" was wrong, and the record of it being wrong is
worth more than a clean page — it is the second claim in this project that a gate
took away, after the traveling wave.

**GATE-D3's fifth check now pins the defect rather than asserting the wish.** It
records that amplification currently helps every threshold-type lesion, labelled
as a known gap, so it goes red if the behaviour changes without an ADR. A test
that encodes what we want and fails is not a gate; a test that encodes what is
true and would notice a change is.

## The route, named and not built

A fibre-count axis: `n_fibres`, with the detector reading a population rather
than a single threshold crossing. Two consequences make it worth doing properly
rather than quickly:

* threshold would be set by the **most sensitive** surviving fibre, so it stays
  put as fibres are lost — which is the whole phenomenon;
* the variance of the readout falls as `1/sqrt(n)`, so what degrades is
  discrimination in noise, and *that* is what a hearing aid cannot repair.

It also changes what `E8` measured. E8 raised `theta` and found `sigma_opt`
scaling in proportion, which is correct for what it varied — a sensitivity loss.
Whether the optimum moves under **fibre loss** is a different question and has
not been asked.

## Consequences

* §13 loses one clinical claim and gains a stated limit.
* This is the **third** measured disagreement between the model and the clinic,
  after the tuning direction under hydrops and the series-coupled active layer.
  All three came from gates and none from reading, which is the argument for
  writing gates that can go red.
* `PATHOLOGIES.md` §7's ordering is unchanged: the hydrops factors are still the
  cheapest thing that could kill §13. A fibre axis is now second.
