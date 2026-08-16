# ADR-0004 — The narrowed model: a free-end string with variable mass, Fourier, and SR

**Date:** 2026-08-15
**Status:** built and measured. The narrowing holds for everything except §R2 —
the transmission line turned out to be **required** there, not optional
**Raised by:** "¿podemos acotar la solución a transformada de Fourier, resonancia
estocástica, ecuación de la cuerda con un extremo libre y masa variable?"

## The question

Can the project stand on three ingredients — the fixed-free string with variable
mass, Fourier analysis, and stochastic resonance — and set aside the
transmission line (ADR-0002), the Hopf layer (§7.5) and the factorial (§7.3)?

Worth asking before more is built on top: each of those is a separate operator
with its own gates, and if the narrowed model answers the same questions, the
rest is cost without an argument.

## What was measured — [ran] 2026-08-15

### 1. Variable mass alone produces a place code

Fixed-free string, `μ = e^{α_μ x}`, `K = 1`, **no ground term and no fluid
coupling**. Peak position of the first six modes:

| | ω₁…ω₆ | peak position of each mode |
|---|---|---|
| uniform, `α_μ = 0` | 1.57, 4.71, 7.85, 11.0, 14.1, 17.3 | 1.0, 1.0, 0.6, 1.0, 1.0, 1.0 |
| graded, `α_μ = 4` | 0.33, 1.41, 2.42, 3.41, 4.40, 5.39 | 1.0, **0.515, 0.375, 0.297, 0.247, 0.215** |

Monotone, and absent in the control. **The place map does not need ADR-0002.**
What ADR-0002 produces that this does not is a *traveling wave* — a peak that
moves continuously with drive frequency rather than a discrete set of mode
peaks. That distinction is real and it is not what §R2 asks about.

### 2. SR on that string reproduces the parameter-free law

`σ_opt` lands at 0.50–0.79 `θ` across probes against the adiabatic `θ/2`, at the
grid resolution used. Nothing here needed a traveling wave, which ADR-0003
already said.

### 3. §R2 — co-tuning — is answered **weakly**, and only after a fix

`sr_curve` cannot answer a spatial question: it calibrates the tone to be
subthreshold *at each probe* and picks `θ` from that probe's grid, so every probe
is a separately equalised instrument. Comparing them measures the
normalisation. Measured, on the graded string: **13.02 dB at `x=0.20` against
10.80 dB at `x=0.375`**, which is mode 3's own peak — the ordering inverted, by
the instrument.

`sr.shared_sr_curve` applies **one** stapes drive, **one** threshold and **one**
noise intensity to the whole membrane, which is the arrangement §R2 is about and
the same correction ADR-0003 made for the transmission line:

| drive | `x_cf` | highest peak SNR at | within one probe spacing? |
|---|---|---|---|
| mode 2, ω=1.41 | 0.515 | 0.35 | **no** |
| mode 4, ω=3.41 | 0.297 | 0.35 | yes |
| mode 6, ω=5.39 | 0.215 | 0.15 | yes |

Two of three, at 0.15 probe spacing — and the one failure was off by 0.165,
inside the grid's own resolution. That is a reason to re-measure, not to believe
either answer, so it was re-measured at **0.06 spacing, fourteen probes**:

| drive | `x_cf` | highest peak SNR at | within one probe spacing? |
|---|---|---|---|
| mode 2, ω=1.41 | 0.515 | 0.36 | **no** |
| mode 4, ω=3.41 | 0.297 | 0.36 | yes |
| mode 6, ω=5.39 | 0.215 | **0.12** | **no** |

**One of three. The finer measurement made it worse, and that is the answer.**

The reason is visible in the curves rather than inferred. Peak SNR on the plain
string is **broad and flat** — mode 2 reads 9.0, 9.8, 10.1, 9.5, 9.6, 8.9 across
`x = 0.24…0.48`, a 1.1 dB spread over a third of the membrane — punctuated by
sharp dips where a mode's node lands on a probe (`−0.1`, `−0.4`, `0.1`). The
argmax is then decided by **which probe happens to miss a node**, not by where
the string is tuned. Adding probes adds nodes to trip over, which is why the
answer degraded.

Compare the transmission line on the identical question: **3 of 3**, 3.17 dB at
`x_cf` against −0.9…+1.5 dB everywhere else, and a statistically significant
interior maximum *only* at or beside `x_cf`.

## Decision

**The narrowed model is the default for everything except §R2, and the
transmission line is required — not optional — for §R2.**

- H1–H3, the A-series gates, E3 and A9/A10/A14 sit on the string already and are
  unaffected. So is the place map, which needs neither the ground term nor the
  fluid coupling.
- **Co-tuning is a property of the traveling-wave operator, not of a resonant
  string.** A string with graded mass has modes that peak in different places;
  it does not have a place where a *given tone* is preferentially amplified. The
  narrowed model was expected to reproduce §R2 more cheaply and does not, and
  that is a result about the physics rather than about the instrument.
- §7.5 (Hopf) and §7.3 (factorial) are **not** required by anything above and
  stay unbuilt until something needs them.

## What this cost, and what it bought

`shared_sr_curve` was written to make the comparison possible at all, and it is
worth keeping regardless: it is the only way to ask a spatial question of the
string, and `sr_curve` silently cannot. Its first result on the string —
13.02 dB at `x=0.20` against 10.80 dB at the tuned place — was produced by
per-probe normalisation and is exactly the kind of number that would have been
published as a finding.

## What would change this

Nothing cheap. The one obvious re-measurement — a finer probe grid — was run and
made the answer worse. A version that measured peak SNR *averaged over probes
between nodes*, rather than at probes, would remove the artefact this ADR
attributes the failure to; if it then showed co-tuning, this conclusion is wrong
and the string is enough. Not run, and stated as the test that would overturn
this rather than left as an impression.

**Status corrected 2026-08-15**: this ADR opened saying the transmission line
would be "downgraded". The measurement said the opposite.
