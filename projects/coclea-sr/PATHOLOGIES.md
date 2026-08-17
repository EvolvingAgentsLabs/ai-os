# Pathologies, and what this model is entitled to say about them

**Spec §13.** Every claim on this page is a statement about a 1-D transmission
line with a scalar active layer and a threshold detector. None of it is clinical
guidance, none of it concerns dosing, and no part of it has been compared against
patient data. What follows is a set of **falsifiable predictions**, written so
that a clinician or an auditory physiologist can disagree with them using
measurements that already exist.

That framing is the whole point. A model that cannot be wrong about a patient is
not saying anything about one.

---

## 1. Why a model of hearing has anything to say about disease

The reason is [ADR-0002](decisions/0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md),
and it is the same event the project's public write-up describes as *"the
experiment told me my model was wrong"*.

The original operator was a graded string: the membrane's own tension carried the
wave. It failed, and it failed for a reason no parameter choice could fix — the
membrane impedance sat in the **numerator** of the local wavenumber, so the wave
was blocked exactly where the membrane is stiff, which is where it has to enter.
The replacement puts the impedance in the **denominator**, which is what fluid
coupling does and membrane tension cannot.

That replacement was accepted because it produced the traveling wave. But it had
a consequence nobody was aiming at: **the fluid became a parameter of the model.**

    k²(x) = β² Ω² / Z(x),     Z(x) = S(x) − Ω²M(x) + iΩR(x)

`β` carries the scala geometry and the fluid it contains. `M` is the membrane
plus the fluid it drags. `R` is viscous loss. A string model has none of these:
its only knobs are the membrane's own tension and mass, and neither is something
a drug can reach.

**Fluid is druggable.** That is the entire mechanism of a loop diuretic, of an
osmotic agent, of every intervention aimed at endolymph volume. So the model that
was forced on us by a failed traveling wave is also the first version of this
model with a therapeutic surface at all. The falsification bought the section.

---

## 2. The parameter surface

Six independent knobs, across three layers:

| knob | layer | what it is | what moves it in a cochlea |
|---|---|---|---|
| `drive` | middle ear | pressure delivered at the stapes | otosclerosis, effusion, perforation |
| `β` | fluid | scala area, density, duct geometry | endolymph volume; osmotic and diuretic agents |
| `S`, `M` | partition | stiffness and entrained mass | distension, fibrosis, mass loading |
| `R` | fluid | viscous loss | viscosity, temperature |
| `μ_H` | active | distance to the Hopf point | OHC count, prestin, endocochlear potential, MOC efferents |
| `θ` | detector | firing threshold | IHC ribbon synapses, ANF complement |

Two of those rows are why this document exists.

**`μ_H` is already druggable in the losing direction.** Salicylate blocks
prestin; furosemide collapses the endocochlear potential. Both reduce the
amplifier, both reversibly, both in humans, today. A knob with a known agent that
turns it one way is a knob, whatever the state of the agent that turns it the
other — and that is an argument about the *model's* structure, not a claim that
the reverse agent exists.

**`θ` and `μ_H` are different knobs.** A model without a detector cannot separate
"the mechanics got worse" from "the thing reading the mechanics got worse". This
project has a detector because stochastic resonance is a statement about a
threshold, and that same detector is what makes synaptopathy representable.

---

## 3. The catalogue, and what the model predicts for each

Implemented in [`src/coclea/pathology.py`](src/coclea/pathology.py); measured by
[GATE-D1](gates/test_D01_pathology_signatures.py). Every number below is **[ran]**,
from `gates/reports/report_D01_*.json`.

| lesion | knob moved | CF at a fixed place | Q | sensitivity | compression exponent | knee drive | optimal noise | self-oscillates |
|---|---|---|---|---|---|---|---|---|
| healthy | — | 1.000 | 1.000 | 0 dB | 0.365 | 0.0028 | 0.500 | no |
| conductive | `drive` ×0.1 | 1.000 | 1.000 | **−20.0 dB** | 0.365 | 0.0028 | 0.500 | no |
| OHC loss | `μ_H` −0.02→−0.5 | 1.000 | 1.000 | 0 dB | **0.811** | **0.354** | 0.500 | no |
| prestin block | `μ_H` −0.02→−0.2 | 1.000 | 1.000 | 0 dB | **0.638** | **0.089** | 0.500 | no |
| hydrops | `β` ×0.6, `S` ×1.6, `M` ×1.3 | **1.117** | **1.056** | **−3.9 dB** | 0.365 | 0.0028 | 0.500 | no |
| synaptopathy | `θ` ×1.8 | 1.000 | 1.000 | 0 dB | 0.365 | 0.0028 | **0.900** | no |
| overdriven | `μ_H` = +0.05 | 1.000 | 1.000 | 0 dB | — | — | 0.500 | **yes** |

Read the table by its **zeros**. What identifies a lesion here is not the column
that moved but the five that did not.

* A **conductive** loss is a pure attenuation: −20 dB and every shape preserved.
  The place map, the tuning, the compression curve and the useful noise level are
  untouched. The model says conductive loss is the one pathology that a gain
  control can fully undo, which is why a hearing aid works for it and only for it.
* **OHC loss** and **prestin block** touch nothing mechanical and nothing at the
  detector. What they destroy is *compression*: the exponent walks from 0.365
  (near the normal form's exact 1/3) toward 1, which is linearity. Loudness
  recruitment, as a consequence of the normal form rather than an input.
* **Hydrops** is the only lesion in the catalogue that moves the **place map**.
  It is also the only fluid-mechanical one. That coincidence is the section's
  main structural claim and §5.3 is built on it.
* **Synaptopathy** moves exactly one number, and it is one that no mechanical
  model has: the noise level at which detection is best. The audiogram, the
  tuning curve and the compression curve are all normal. This is what "hidden"
  means, stated as a parameter.
* **Overdriven** is past the bifurcation. It is in the catalogue as a hazard
  rather than as a disease — see §6.

### The one collision, which is not a defect

`OHC loss` and `prestin block` have the **same sign pattern**. They are the same
lesion at two depths, and the model is right that a single measurement cannot
separate them. What does separate them is ordered and asserted:

    knee:      healthy 0.0028  <  prestin block 0.089  <  OHC loss 0.354
    exponent:  healthy 0.365   <  prestin block 0.638  <  OHC loss 0.811

plus reversibility, which is not a measurement at one instant at all. Engineering
a sign difference between two points on one axis would be manufacturing a
discrimination the physics does not contain, and GATE-D1 asserts the collision
rather than excluding it — a gate that dropped it would pass equally well on a
model that had collapsed every lesion onto a single knob.

### What GATE-D1 actually checks

Three things, and the last two are what make the first mean anything:

1. Seven lesions produce **six** distinct signatures — the documented collision
   and no other.
2. A lesion that changes nothing reproduces the reference signature to `0.0` in
   every component. Without this, "these differ" could be solver drift.
3. **No single observable separates the catalogue** (best column: 3 distinct
   values out of 7). The diagnosis is in the pattern, so the pattern has to be
   load-bearing.

Probed for falsifiability rather than assumed: setting hydrops' three factors
back to 1.0 collapses it onto healthy and the gate goes red. **[ran]**

---

## 4. Where the model already disagrees with the clinic

Recorded here rather than in a footnote, because these are the places the section
is most likely to be wrong and they are worth more than the agreements.

**Hydrops sharpens tuning in the model (Q +5.6%); Ménière's broadens it.** The
sign of the Q change follows from stiffening the partition, and stiffening is
something this document *posited* rather than derived. If the clinical direction
is right, either the partition does not stiffen or `β` and `M` dominate the Q
budget — both are testable against the same measurement.

**The hydrops factors are inputs, not predictions.** `β ×0.6, S ×1.6, M ×1.3` are
plausible directions, not measured ones, so "the CF shifts by 11.7%" is not a
prediction of the model — the *sign* is, given the sign of the `S/M` change, and
the number is arithmetic. What the model does contribute, and what is not an
input, is that **no other lesion in the catalogue moves the map at all**. That is
the discriminating content, and it survives whatever the factors turn out to be.

**Basal-first grading is absent from the catalogue.** Real hair-cell loss is
patchy and worst at the base; `OHC_LOSS` uses a scalar `μ_H`. The per-site
machinery exists (`pathology.ohc_loss_graded`, `HopfChain.mu` is per-site) and is
what [ADR-0005](decisions/0005-the-calibration-engine-and-the-frequency-prediction.md)
built, but the discrimination question does not need it and it is not exercised
here. A frequency-graded audiogram is not yet something this catalogue predicts.

**`μ_H = −0.02` for a healthy cochlea is a posit.** Physiology says the live
cochlea sits close to the bifurcation; it does not say how close, and this model
cannot derive it. Every claim on this page is therefore a *direction of movement
from* that point and never an absolute. [ADR-0006](decisions/0006-pathology-as-a-parameter-transform.md)
records the choice and what would falsify it.

---

## 5. Treatment directions the model implies

Four, ordered by how cheaply each could be attacked. Each states the mechanism,
what the model predicts, **what would falsify it**, and what the model cannot say.
The last field is not a disclaimer; it is the part that keeps the first three
honest.

### 5.1 Calibrated noise, for a lesion at the detector

**Mechanism.** This project's own hypothesis, pointed at a disease. If the
detector's threshold has risen and the mechanics are intact, the signal is
subthreshold at a detector that used to fire — which is precisely the regime
where added noise recovers detection rather than destroying it.

**What the model predicts.** The useful noise level is Rice's optimum,
`σ_opt = θ/2`, already validated against the toy by GATE-A10. So the level scales
**in proportion to the threshold**: a detector 1.8× harder to trip wants 1.8×
the noise, measured as 0.900 against 0.500 with no free parameter anywhere in the
ratio. GATE-D1 asserts that equality to `1e-12`, and asserts that no mechanical
observable moves.

**And the model bounds where it can work.** E4 — the bridge to auditory-nerve
physiology, which infers the noise from the spontaneous rate — found the
stochastic-resonance regime reachable only **up to a characteristic frequency of
about 1 kHz**, and not above it. So the prediction is not "noise helps hearing". It is:
*noise helps low-frequency, near-threshold detection, in an ear whose mechanics
are intact* — which is a much smaller claim and a much easier one to kill.

**What falsifies it.** Added noise at the predicted level fails to improve
detection in a threshold-elevated ear; or it improves detection but the optimum
does not scale with the threshold; or the benefit persists well above 1 kHz,
which would mean the mechanism is not the one modelled here.

**What the model cannot say.** Where the noise should be injected — acoustic,
electrical, or via an implant — how it should be spectrally shaped, whether it is
tolerable, or whether chronic exposure at that level is safe. Those are the
questions that decide whether this is a therapy, and this model addresses none of
them.

### 5.2 Moving `μ_H` back toward criticality

**Mechanism.** If sensorineural loss is the amplifier retreating from the
bifurcation, the target is the retreat itself rather than its consequences. The
axis is known to be pharmacologically reachable **in the losing direction** —
prestin block, endocochlear potential collapse, and the medial olivocochlear
efferents, which reduce gain through a cholinergic receptor that is itself a drug
target class.

**What the model predicts, for any agent claiming to act here.** Three things
move together, with exponents fixed by the normal form and nothing to tune:

    linear gain     ∝ 1/|μ_H|
    knee drive      ∝ |μ_H|^(3/2)
    exponent        → 1/3 as |μ_H| → 0

So a genuine amplifier-restoring agent must restore **compression**, not just
threshold. An agent that lowers thresholds while the compression exponent stays
near 1 is doing something else — providing gain, not restoring the amplifier —
and the model says the two are distinguishable by a measurement audiology already
performs.

**What falsifies it.** Threshold and compression move independently under an
agent, or the knee moves as a power of the gain other than 3/2. Either kills the
normal-form account of what the drug is doing.

**What the model cannot say.** Any of the biology: which molecule, which cell,
whether hair cells can be pushed back toward criticality at all, or whether
`μ_H` is even a single parameter rather than a summary of several.

### 5.3 Fluid interventions, and the discrimination they make possible

**Mechanism.** `β`, `S`, `M` and `R` are set by the fluid and the geometry it
fills. Endolymph volume, osmolarity and viscosity are what diuretic, osmotic and
vasopressin-axis agents act on. This is the class of intervention that only exists
because ADR-0002 replaced the string.

**What the model predicts.** A fluid-acting agent moves the **place map**, and a
hair-cell-acting agent does not. That is the sharpest clinical statement on this
page, because it converts a mechanism question into an audiometric one: two drugs
that both improve a Ménière's patient's hearing are acting on different targets
if only one of them shifts the tonotopic map, and the shift is measurable without
knowing anything about either drug.

**What falsifies it.** A fluid agent that improves hearing with no measurable
tonotopic shift; or a tonotopic shift under an agent with no fluid action at all.

**What the model cannot say.** The magnitude — the factors in §3 are posited, and
§4 says so. Nor anything about vertigo, which is the symptom Ménière's is usually
treated for and which lives in a part of the labyrinth this model does not
contain.

### 5.4 Ototoxicity screening: measure the knee, not the threshold

**Mechanism.** The cheapest prediction here, and it needs no new therapy at all.
Aminoglycosides and platinum agents damage hair cells progressively. The question
that decides a patient's dose is *how early can the damage be seen*.

**What the model predicts.** The two observables move with **different powers of
the same parameter**:

    gain      ∝ |μ_H|^(-1)      →  a 10× retreat costs 20 dB
    knee      ∝ |μ_H|^(+3/2)    →  the same 10× retreat moves the knee 31.6×

Measured across this catalogue: `μ_H` from −0.02 to −0.2 moves the knee by
**31.6×** while the linear gain falls **10×**. The compression knee is therefore
**1.5× more sensitive in log terms** than the threshold, at every depth, and the
input/output slope of a distortion-product emission is a standard clinic
measurement. The model says a monitoring protocol should watch that slope rather
than the audiogram.

**What falsifies it.** The audiogram moves first, or the two move together. Either
means the loss is not a retreat from criticality and the 3/2 does not apply.

**What the model cannot say.** Whether the retreat is monotone in dose, whether
it recovers, or how any of it maps to time.

---

## 6. The hazard: this therapeutic window has an edge

Every therapy in §5.2 pushes `μ_H` toward zero. **Zero is the bifurcation.** Past
it the oscillator runs with no input at all, which is the model's account of a
spontaneous otoacoustic emission and of the tonal tinnitus that sometimes
accompanies one. `OVERDRIVEN` is in the catalogue for this reason and for no
other.

So the model's structural statement about amplifier-restoring therapy is:

> The target is a point the treatment must approach and must not cross, and the
> failure mode on the far side is a symptom — not merely an absence of benefit.

A physical model can say that. A statistical model fitted to outcomes cannot,
because the failure lives on the other side of a boundary the data would not
contain. It is the clearest example on this page of why the mechanism was worth
building, and it is stated as a hazard rather than a result: **the model has not
been shown to predict tinnitus in anyone.** What it does is locate the edge in
its own parameter, and say which observable — self-oscillation with no drive —
would be the sign of having crossed it.

---

## 7. What would have to be built next

In the order a cheap-to-falsify path would take them:

1. **Grade the amplifier lesion along the membrane.** `ohc_loss_graded` exists
   and is unused. A basal-first `μ_H` should reproduce a sloping high-frequency
   audiogram; if it does not, §5.2 is describing the wrong lesion shape.
2. **Run the synaptopathy prediction end to end.** §5.1's claim is currently a
   closed form (`σ_opt = θ/2`) asserted about the detector. The full pipeline —
   line, active layer, detector, SNR against noise — has never been run with `θ`
   raised. It is one sweep, it reuses GATE-B2's machinery entirely, and it can
   fail.
3. **Attack the hydrops factors.** They are the weakest inputs on this page. Any
   independent constraint on how hydrops changes `S`, `M` and `β` turns §5.3 from
   a sign into a number.
4. **Only then, literature.** Comparing against measured DPOAE input/output
   slopes is what would make §5.4 a claim about ears rather than about a normal
   form. It is last because it is the expensive one and because three cheaper
   things can kill the section first.

---

## 8. The limit, restated

This is a 1-D transmission line with a scalar active layer and a threshold
detector. It has no middle ear, no vestibular system, no efferent dynamics, no
spatial structure inside the organ of Corti, and no biology of any kind. Its
healthy operating point is posited. Two of its lesions are parameterised by hand.

What it has is **six knobs that move six different patterns of observables**, and
gates that check that claim can go red. Everything on this page is downstream of
that, and nothing on this page is downstream of a patient.

> Agents are allowed to be wrong. Claims have to survive verification. A claim
> about a person has to survive a person, and none of these has been near one.
