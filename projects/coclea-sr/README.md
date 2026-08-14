# COCLEA-SR

A project **on** ai-os, not beside it: the basilar membrane as a frequency
decoder, and stochastic resonance as the mechanism that lets a subthreshold
displacement be detected. The hypothesis is Matias's, from ~1995. This is its
first computational test.

It is also the workload that gave `ai-flows` its first declared metric — see
[`doc/16`](../../doc/16-a-workload-with-an-oracle.md) for what the OS learned
from it, which is the other half of why the project is here.

> **State, 2026-08-14.** The MVP is complete. **GATE-B2 — the specification's
> main result — passes: 24 of 24 curves show a statistically significant interior
> maximum in SNR against noise.** The passive layer, the place code and the whole
> measurement pipeline are validated against closed forms. One hypothesis was
> falsified on the way and its replacement was accepted against a condition
> registered before it was built.

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

.venv/bin/python -m pytest gates/ -q                        # every gate
PYTHONPATH=src .venv/bin/python experiments/e2_tonotopy.py  # the place map, 3 arms
PYTHONPATH=src .venv/bin/python experiments/e3_sr_curve.py  # the SR curve — GATE-B2
python3 verify_ledger.py                                    # re-derive the chain
```

`verify_ledger.py` uses the standard library only and imports nothing from
`src/`. That is the point of it: a verifier sharing code with the thing it
verifies checks self-consistency, not truth.

## Layout

| | |
|---|---|
| [`COCLEA-SR-SPEC.md`](COCLEA-SR-SPEC.md) | The specification. Where code and spec disagree, the spec wins — and where the spec is wrong, an ADR says so |
| [`truth/`](truth/) | Closed forms in sympy and mpmath. **Imports nothing from `src/`** (spec §6.4 rule 4) |
| [`src/coclea/`](src/coclea/) | units, profiles, assembly, modal, forced, transmission, stochastic, detector, analysis, calibrate, sr, attest |
| [`gates/`](gates/) | One module per gate. Each writes `gates/reports/*.json` on **every** outcome |
| [`experiments/`](experiments/) | E2 and E3, each with its control arms |
| [`decisions/`](decisions/) | Three ADRs. The second says the first was wrong; the third says what the second left open |
| [`runs/`](runs/) | Content-addressed run directories with manifests |
| `ledger.jsonl` | Hash-chained, one line per artefact transition |

## Six ways the instrument lied

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

## The deliberate defect

`assembly.py` implements `scheme="lumped-full-cell"`: the apex node gets a whole
cell of mass instead of the half it owns. It is there because **a gate that has
never gone red is not evidence that it works.** It leaves the matrix symmetric,
the mass positive, the spectrum ordered and every mode's zero count correct — and
the naive "does the mass integrate to the continuum value" check *prefers* it.

Do not remove it. `gates/test_A12_convergence.py` asserts that GATE-A12 rejects
it; if that assertion ever passes, the gate has stopped measuring.
