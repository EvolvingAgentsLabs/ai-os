# ADR-0006 — Pathology is a parameter transform, and the healthy operating point is a posit

**Status:** accepted, 2026-08-17
**Supersedes:** nothing. **Depends on:** [ADR-0002](0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md),
[ADR-0005](0005-the-calibration-engine-and-the-frequency-prediction.md)

## Context

Spec §13 did not exist. It was asked for after ADR-0002, and the reason it became
askable is that ADR-0002 changed what the model contains.

The pre-ADR-0002 operator was a graded string. Its knobs were the membrane's own
tension and mass — neither of which any intervention reaches. The transmission
line put the fluid into the operator (`β`, `M`, `R`), and the fluid is the thing a
diuretic or an osmotic agent acts on. The Hopf layer added `μ_H`, which salicylate
and furosemide already move in humans. The detector added `θ`.

So a falsified model was replaced by one with a **therapeutic surface**, and the
question "what does this say about disease" stopped being unanswerable. That
sequence is worth recording: the section is downstream of the falsification, not
of a plan.

## Decision

**A pathology is a transform on the model's existing parameters, and nothing else.**

`src/coclea/pathology.py` defines a `Lesion` whose every field defaults to *no
change*, so `Lesion()` is a healthy cochlea and a lesion is literally the diff.
Seven are catalogued. No pathology introduces a new term, a new equation or a
fitted constant.

Three consequences follow, and they are the reason for the shape:

1. **The null control is free.** `Lesion()` must reproduce the reference
   signature to `0.0`. If the observables drift on their own, every difference in
   the catalogue is that drift, and GATE-D1's third test would not be able to
   tell. It is checked rather than argued.
2. **`BMProfile` is not touched.** Fourteen frozen gates were measured against
   that object; adding fields to it would change what those measurements refer
   to. `LesionedProfile` subclasses it with scale factors that are `1.0` by
   construction, so an unlesioned `LesionedProfile` **is** the reference membrane.
3. **The claim becomes checkable.** "Each pathology enters on a different
   parameter and therefore produces a different signature" is a statement about
   the model that a model with one effective knob would fail. GATE-D1 attacks it.

## The posit, stated as one

**`μ_H = −0.02` for a healthy cochlea has no derivation.** Physiology says the
live cochlea operates close to the bifurcation; it does not say how close, and
nothing in this model constrains it. It is a choice.

Everything in §13 is therefore written as a **direction of movement from** that
point and never as an absolute — which is why the catalogue's table is read by
its zeros and why GATE-D1 reduces every observable to a sign before comparing.

What would falsify the posit: a measured compression knee in a healthy ear that
is inconsistent with `|μ_H|^{3/2}` at any `μ_H` near zero, or a healthy
compression exponent far from 1/3. Both are standard measurements. Neither has
been made here, and until one is, no number in §13 is entitled to a magnitude.

The hydrops factors (`β ×0.6`, `S ×1.6`, `M ×1.3`) are posits of the same kind and
are marked as such in PATHOLOGIES.md §4. Their *sign* drives the predicted
tonotopic shift; their *value* drives only the 11.7%, which is arithmetic and not
a result.

## The collision that is kept

`ohc-loss` and `prestin-block` produce the same sign pattern. They sit on one
axis at two depths, and no single-instant measurement separates two points on one
axis. GATE-D1 **asserts** the collision rather than excluding the pair from the
comparison: a gate that quietly dropped it would pass just as well on a model
that had collapsed all seven lesions onto one knob, which is exactly the failure
the gate exists to catch.

What separates them is asserted separately — the knee is ordered by depth, the
exponent is ordered by depth, and only one of the two is reversible.

## Alternatives rejected

**A per-pathology model.** Each lesion gets its own equations, tuned to reproduce
its clinical picture. Rejected because it cannot fail: with enough per-disease
freedom every audiogram is reproducible and nothing has been predicted. It also
destroys the only interesting claim, which is that the lesions are *distinguished
by which parameters they leave alone*.

**Fitting to audiometric data first.** Rejected on ordering, not on merit. Three
cheaper things can kill §13 (PATHOLOGIES.md §7), and a fit run before them would
be an expensive way to find out the section was wrong.

**Leaving §13 as prose.** Rejected because the workspace rule that produced the
rest of this project applies here more than anywhere: a claim near medicine that
nothing checks is the worst version of a number nobody checks. §13 makes claims
that could matter to a person, so the bar is higher, not lower — hence a gate, a
falsifiability probe, and a *"what the model cannot say"* field on every one of
the four treatment directions.

## Consequences

* `gates/` gains a **D** series. A, B, C and H are about the model being right;
  D is about the model being *discriminating*, which is a different property and
  needed its own letter.
* PATHOLOGIES.md carries a limits section (§8) and a hazard section (§6). The
  hazard — that every amplifier-restoring therapy approaches a boundary it must
  not cross — is a structural consequence of the normal form and is the clearest
  thing on the page that a statistical model could not have said.
* Nothing here has been compared against patient data, and the document says so
  in its first paragraph and its last.
