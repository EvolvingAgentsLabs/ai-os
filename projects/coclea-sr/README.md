# COCLEA-SR

A project **on** ai-os, not beside it: the basilar membrane as a frequency
decoder, and stochastic resonance as the mechanism that lets a subthreshold
displacement be detected. The hypothesis is Matias's, from ~1995. This is its
first computational test.

It is also the workload that gave `ai-flows` its first declared metric — see
[`doc/16`](../../doc/16-a-workload-with-an-oracle.md) for what the OS learned
from it, which is the other half of why the project is here.

> **State, 2026-08-14.** The MVP is complete and H3's debt is closed.
> **GATE-B2 — the specification's main result — passes: 24 of 24 curves show a
> statistically significant interior maximum in SNR against noise.** The passive
> layer, its energy, the place code and the whole measurement pipeline are
> validated against closed forms. **E4 has emitted its verdict**, figures carry
> their provenance in their own bytes, and one hypothesis was falsified on the
> way with its replacement accepted against a condition registered before it was
> built.

## The result

**Stochastic resonance is there, and it is where the theory says.** For three
drive frequencies at eight positions along the membrane, SNR against noise has an
interior maximum whose 95% interval clears both ends of the grid — 24 curves out
of 24. The measured optimum sits at **11.6%** of the parameter-free prediction

    σ_opt = θ / 2

derived in `truth/rice_sr_toy.py` by maximising Rice's crossing rate. 11.6% is
half a grid spacing: the theory is matched to the resolution of the instrument.

Every free quantity cancels out of that prediction — the noise intensity, the
damping, the drive amplitude, the SNR's proportionality constant. There is
nothing left to tune to make a simulation agree, which is what makes it a gate
rather than a fit.

## What holds, gate by gate

| | what it checks | measured |
|---|---|---|
| **A01** | uniform string against `ω_n = (2n−1)πc/2L` | `9.28e-6`, tolerance `1e-4` |
| **A02** | modes orthogonal to the *closed-form* family under weight `μ` | see below — the spec's own version cannot fail |
| **A03** | mode `n` has `n−1` interior zeros | exact, modes 1–10 |
| **A04** | project and reconstruct, 200 of 2000 modes | `3.99e-7`, tolerance `1e-6` |
| **A05** | energy stays bounded over 100 periods | `5.0e-7`, and **1.00×** the integrator's predicted bound |
| **A06** | energy lost = energy dissipated | `5.3e-7`, order **2.0000** in `dt` |
| **A07** | WKB error falls with mode number | `0.0086` at mode 12, monotone |
| **A08** | exponential profile against the roots of `tan βL = −2β/α` | `2.31e-6`, tolerance `1e-5` |
| **A09** | stationary variance against the Lyapunov solution | within sampling error, 3 parameter sets |
| **A10** | 0-D toy against Rice: `σ_opt = θ/2` | **9.5%**, tolerance 15% |
| **A11** | stiffness symmetric, mass positive definite | `0.0` |
| **A12** | second-order convergence | `2.0015`, band `[1.9, 2.1]` |
| **A13** | what Euler-Maruyama costs | **45.8% bias at the spec's own production step** |
| **A14** | doubling the modes does not move the SNR | `0.019 dB`, tolerance `0.2 dB` |
| **C01** | transmission line against `P = sin(k(1−x))/sin(k)` | `7.3e-7`, order `2.00` |
| **C02** | the traveling wave runs the cochlear way | true at all frequencies; control false at all |
| **C03** | power in at the stapes = power dissipated | residual `4.3e-8` |
| **B1** | the place map against Greenwood | `r = +0.9986` in shape |
| **B2** | **a significant interior maximum in SNR(D)** | **24/24 curves** |
| **E4** | is the auditory nerve near the optimum? | reachable to **~1 kHz**, not above |
| **B3** | do the two noises cooperate? | **no — sub-additive**, `−1.22 dB` `[−1.58, −0.87]` |
| **D1** | does the model tell pathologies apart? | **6 distinct signatures of 7 lesions**, one documented collision |

## The physiological verdict — E4, and what it says about 1995

The model is dimensionless, so `σ_opt = θ/2` cannot be compared against
nanometres without inventing a scale. §4.5 supplies the escape in one
parenthesis: infer the noise from the **spontaneous rate** instead. Rice's
crossing rate inverts to

    θ/σ = sqrt( 2 ln( ω_eff / (2π r₀) ) )

in which the displacement units cancel. GATE-A10 validates that inversion against
a *simulated* spontaneous rate and recovers the true ratio to **0.25%**.

**Verdict: the stochastic-resonance optimum is reachable by auditory-nerve fibres
up to a characteristic frequency of about 1 kHz, and not above it.**

| CF | spontaneous rate needed to sit at the optimum | within the empirical ceiling? |
|---|---|---|
| 125 Hz | 10.3 – 35.7 sp/s | yes, comfortably |
| 500 Hz | 41.3 – 142.8 sp/s | yes, at the high-rate end |
| 1 kHz | 82.6 – 285.6 sp/s | only at the very top |
| 4 kHz | 331 – 1143 sp/s | **no** |

This **supports the 1995 hypothesis and bounds it**. The mechanism is available
to low-frequency hearing and unavailable to high-frequency hearing at the rates
fibres actually show — a sharper claim than the original, and a testable one.

Two things are stated rather than buried. The empirical ranges are **[read] from
the specification's §4.5 and not independently verified**; the sensitivity is
reported beside them (a tenfold error in `r₀` moves `θ/σ` by 34.8%). And the
whole verdict rests on taking `ω_eff = 2π·CF` — **attack that number first**.
Full working in [`literature/comparison.md`](literature/comparison.md).

## GATE-B3 — the two noises do not cooperate

§7.2 sets the standard this project borrows from `harness_eval`: **an absolute
lift with no significant interaction term is not a finding.** So "does mechanical
noise cooperate with neuronal noise" is answered by one coefficient and nothing
else.

A resolution-V half fraction of `2^5` over §7.2's factors, sized by a power
analysis run **first** (σ̂ = 1.18 dB from a pilot → N ≥ 45, used 64), every cell
on **Detector B** — the LIF with separable intrinsic noise, and the first
measurement in the project that uses it.

Both noises raise the SNR strongly on their own (`ξ` **+3.84 dB**, `η` **+2.19
dB**). Their interaction is **`−1.22 dB`, CI `[−1.58, −0.87]`**, surviving Holm.
Together they help **less** than the sum of their separate effects.

> **"Cooperate" is the wrong word for what was measured.** The two channels are
> partially redundant, not synergistic — and the naive reading, that two
> beneficial noises must compound, is exactly what the interaction term exists
> to contradict.

Also answered, in passing: **the spatial structure of the noise matters**
(`noise_scaling` = −1.07 dB, surviving Holm), which §4.1 raised as an open
question, and the neuronal noise helps more when the detector reads velocity
(`xi:detector_input` = +1.61 dB).

**The confound this cannot rule out, and it is stated in the run:** the working
point sits *at* the SR optimum, so raising both noises together pushes the
detector onto the descending flank of its own inverted U. A negative interaction
is what that curvature produces on its own. Separating it from genuine redundancy
needs the levels chosen so the total noise stays below the optimum in every cell,
or the operating point varied as a sixth factor. **The sign is measured; its
cause is not.**

## What was falsified, and it was the model

**A string cannot be a cochlea, however its springs are graded.** ADR-0001 added a
stiffness to ground so the membrane would have a characteristic frequency per
position. It does — and there is still no place map, at any coupling length,
because the local wavenumber makes the response **propagating apical** to the
characteristic place and **evanescent basal** to it. That is Békésy inverted: a
wave entering at the stapes decays by twenty-eight orders of magnitude before
reaching the position it is tuned to.

[ADR-0002](decisions/0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md)
replaced it with the long-wave transmission line, where the membrane impedance
sits in the *denominator* of the wavenumber — which is what fluid coupling does
and membrane tension cannot. Its acceptance condition was written before the
operator existed, and both halves hold: the treatment has the cochlear
orientation at every frequency, and the control still does not.

The place map is then a real one, not a bump that happens to move: `x_cf` from
the solved field and the resonant place from `Re(Z) = 0` agree to four decimals
at 500 Hz, 3 kHz and 12 kHz.

## What is reported and is not a success

* **`Q₁₀dB` is 2.2 to 2.7.** Spec §2.7 predicts a passive model will fall far
  short of physiological tuning and says so in advance. It does. **That gap is
  the quantitative argument for the Phase-2 active layer**, and it is a result.
* **The noise and the place code sit on different operators.** E3 runs on the
  string, as §4.1 and §5.3 specify; E2's place map comes from the transmission
  line. So E3's spatial modulation is the string's mode shapes, not a place code,
  and the thing §R2 calls the interesting result — is the resonance sharpest
  *where the membrane is tuned* — cannot yet be asked.
  [ADR-0003](decisions/0003-the-noise-and-the-place-code-sit-on-different-operators.md)
  names the route (reciprocity: one solve per frequency, not one per source) and
  its stopping condition, and does not build it.
* **Euler-Maruyama misses the specification's own bar.** §5.3 allows it at 1%
  error; at §5.4's production step it is off by **45.8%** and needs a step 32×
  finer. Production uses the exact Van Loan scheme, which has no step-size bias
  at all.

## Run it

```bash
cd projects/coclea-sr
python3.12 -m venv .venv && .venv/bin/pip install numpy scipy sympy mpmath pytest

.venv/bin/python -m pytest gates/ -q                            # every gate
PYTHONPATH=src .venv/bin/python experiments/e2_tonotopy.py      # the place map, 3 arms
PYTHONPATH=src .venv/bin/python experiments/e3_sr_curve.py      # the SR curve — GATE-B2
PYTHONPATH=src .venv/bin/python experiments/e4_physiological.py # the verdict
PYTHONPATH=src .venv/bin/python experiments/b3_interactions.py  # GATE-B3
PYTHONPATH=src .venv/bin/python experiments/figures.py          # report/, stamped
python3 verify_ledger.py                                        # re-derive the chain
make reproduce                                                  # bit-for-bit, §8.3
```

`verify_ledger.py` uses the standard library only and imports nothing from
`src/`. That is the point of it: a verifier sharing code with the thing it
verifies checks self-consistency, not truth.

**`make reproduce` re-runs every experiment and reports whether anything moved.**
Content-addressed run directories make that automatic: a rerun producing the same
bytes lands in the same directory and the ledger does not grow. Verified — all
four experiments land on their existing hashes, with `OMP_NUM_THREADS=1` pinned
because a multithreaded BLAS reduction is not bit-reproducible.

**A divergence from the spec, stated:** §8.2 asks for a verifier under 100 lines.
It is **136** — 92 non-blank non-comment, and about 79 once docstrings are
removed. The stdlib-only requirement holds; the line count does not, and the
growth is the readability check described below rather than machinery.

## Layout

| | |
|---|---|
| [`COCLEA-SR-SPEC.md`](COCLEA-SR-SPEC.md) | The specification. Where code and spec disagree, the spec wins — and where the spec is wrong, an ADR says so |
| [`truth/`](truth/) | Closed forms in sympy and mpmath. **Imports nothing from `src/`** (spec §6.4 rule 4) |
| [`src/coclea/`](src/coclea/) | units, profiles, assembly, modal, forced, transmission, dynamics, stochastic, detector, analysis, calibrate, sr, hopf, fitting, pathology, attest |
| [`gates/`](gates/) | One module per gate. Each writes `gates/reports/*.json` on **every** outcome |
| [`experiments/`](experiments/) | E2 and E3, each with its control arms |
| [`PATHOLOGIES.md`](PATHOLOGIES.md) | Spec §13. Each pathology as a parameter transform, four treatment directions, and what the model **cannot** say about any of them |
| [`decisions/`](decisions/) | Six ADRs. The second says the first was wrong; the third says what the second left open; the sixth says which numbers in §13 are posits |
| [`literature/`](literature/) | The LITERATURA role's output: the verdict, its sensitivity, and what was **not** checked |
| [`report/`](report/) | Figures. Each carries its run id, result hash and commit **in the PNG's own metadata** (§8.4) |
| [`runs/`](runs/) | Content-addressed run directories with manifests |
| `ledger.jsonl` | Hash-chained, one line per artefact transition |

## The attestation caught its own store

`verify_ledger.py` originally checked hashes, and a hash says the bytes are the
ones recorded — **it says nothing about whether anything can read them.** Two
attested runs, including the one behind GATE-B2, contained Python's `NaN` and
`-Infinity` literals: perfectly intact, correctly hashed, and parseable in no
language but Python.

The verifier now checks readability as well, with `parse_constant` set to reject
those literals — without it Python accepts its own invalid output and the check
passes on exactly the files it exists to catch.

The two runs were not deleted. §6.4 rule 2 says never modify a frozen artefact:
make a new version. `attest.supersede` records that, the replacements have
**bit-identical numbers** (verified by diffing every leaf), and the verifier
reports the originals as a warning rather than a failure — because a verifier
that fails forever on history is one nobody runs.

## Nine ways the instrument lied

None of them was found by reading. Kept because the workspace rules ask for it
and because each first looked like a result.

**The reference profile violated the specification's own constraint.** §3.1 fixes
the exponents by `(α_K + α_μ)/2 ≈ ln(f_base/f_apex)`; a hand-picked pair gave 4.0
against the required 6.95, so the membrane spanned 1.7 of the 3.0 decades it
needed and `x_cf` came out flat — which reads as "a compressed place map" rather
than "the wrong profile". Now derived from the same Greenwood constants
`units.py` holds.

**A convergence gate measuring its own eigensolver.** Error ratios of 4.000,
3.997, 4.017, then **4.423** — the last refinement sat twice above the solver's
precision floor. The fitted order read 2.0306: inside the band, clean, wrong
subject. Caught because an independent TypeScript implementation reported 1.9841
for the same quantity, also inside the band.

**A gate that could not fail.** §2.3's Gram check against the identity is
guaranteed by construction when eigenvectors come from `eigh`. It now compares
against the *closed-form* family, which can fail.

**An unpaired comparison reported as truncation error.** GATE-A14 measured
0.238 dB between 40 and 80 modes and would have called it truncation. The two
arms consumed different amounts of randomness, so they were independent
realisations: paired against identical noise streams the shift is **0.019 dB**,
13× smaller, and the starved-basis control still moves 1.67 dB.

**A physical law that was a grid artefact.** `|U|ₘₐₓ ∝ 1/ζ` holds to 6% across
`ζ = 0.01…0.4` and appears to break at `ζ = 1e-3`, reading 2.50 instead of 4.21.
It is the grid failing to resolve the peak: 2.497, 3.885, 4.205 at N = 2000,
8000, 32000.

**`-Infinity` in a JSON file.** Python's `json.dumps` writes it; JSON has no such
value. Two GATE-A10 reports carried an SNR of `-inf` where the detector never
fires, `JSON.parse` threw on the TypeScript side, and **four cross-language drift
tests reported themselves as skipped rather than failing.** An interchange break
that presented as a quiet loss of coverage. Both writers now sanitise to `null`
with `allow_nan=False`, and both readers now distinguish *absent* from
*unreadable*.

**A robustness claim written before it was measured.** `truth/rice_inverse.py`
said a tenfold error in the spontaneous rate was worth "about 20%". Measured:
**41%**, and only downward — upward it runs into the ceiling where the crossing
picture stops applying. The first `sensitivity_to_rate` took the larger of the
two arms and returned 97.9%, a figure produced entirely by that clamp.

**A convergence order asserted with the wrong sign.** GATE-A6 fits the residual
against `dt`, where a falling error has a *positive* slope; GATE-A12 fits against
`N`, where it has a negative one. Copying A12's negation asserted that the
residual must **grow** under refinement, and the measured `-2.000` read as a
failure of the exact behaviour it was confirming. An order of precisely 2.000 is
a strong hint that the code is right and the assertion is not.

**A figure drawn from a superseded run.** Run directories are content-addressed,
so `sorted()` on their names gives no ordering at all — `figures.py` took the
lexically last one and reached for a *stale* E2 result. It failed with a
`KeyError` only because the schema had changed in between; had it not, the figure
would have shown old numbers under a correct-looking provenance stamp. Runs are
now ordered by their manifest timestamp.

## The deliberate defect

`assembly.py` implements `scheme="lumped-full-cell"`: the apex node gets a whole
cell of mass instead of the half it owns. It is there because **a gate that has
never gone red is not evidence that it works.** It leaves the matrix symmetric,
the mass positive, the spectrum ordered and every mode's zero count correct — and
the naive "does the mass integrate to the continuum value" check *prefers* it.

Do not remove it. `gates/test_A12_convergence.py` asserts that GATE-A12 rejects
it; if that assertion ever passes, the gate has stopped measuring.
