# Confronting the model with the literature

The output §6.2 asks of the **LITERATURA** role. One verdict, its sensitivity,
and — first — an honest statement of what was and was not checked.

## What this pass did and did not do

**The empirical ranges below are `[read]` from `COCLEA-SR-SPEC.md` §4.5, which
states them, and were NOT independently verified against the primary sources.**
This pass had no web access in the loop, so the LITERATURA role was executed
against the specification's own numbers rather than against the papers §12
lists.

That is a real limitation and it is stated first because the alternative — citing
Liberman or Békésy beside a number taken from the spec — would be manufacturing
provenance. The run records the same caveat in its `empirical_ranges.source`
field, so no figure derived from it can be quoted without it.

**What survives the limitation:** E4's verdict turns on a ceiling — the highest
spontaneous rate an auditory-nerve fibre shows — and on a logarithm. The
sensitivity is reported: a **tenfold** error in that rate moves `θ/σ` by 34.8%.
The ordering of the verdict is therefore safe even if the exact ceiling is not.

## The comparison, and why it is a ratio and not a displacement

The model has no displacement scale — §3.3 defines `ũ = u / u_ref` and never
fixes `u_ref` — so comparing `σ_opt` against nanometres would be a statement
about a scale somebody chose. §4.5 supplies the escape: infer the noise from the
**spontaneous rate** through Rice's crossing rate, inverted:

    θ/σ = sqrt( 2 ln( ω_eff / (2π r₀) ) )

Displacement units cancel. `truth/rice_inverse.py` derives it in sympy; GATE-A10
validates it against a *simulated* spontaneous rate and recovers the true ratio
to **0.25%**.

| quantity | value | status |
|---|---|---|
| model optimum, predicted | `θ/σ = 2.000` | derived, no free parameters |
| model optimum, E3 measured | `θ/σ = 1.792`, 24 curves | **[ran]**, run `e3-sr-curve-10e43434587d` |
| acceptance band | `[1.583, 2.233]` | from E3's own σ-grid resolution, fixed before looking |
| spontaneous rate, auditory nerve | 0–100 sp/s | **[read]** from spec §4.5 |
| stereocilia Brownian noise | 1–3 nm RMS | **[read]**, *not used* — see below |
| threshold BM displacement | 0.1–1 nm | **[read]**, *not used* — see below |

The two displacement ranges are recorded and **deliberately not used**. Both are
displacements; the model has none to compare them against. Using them would
require inventing `u_ref`, and the number that came out would be a property of
that invention.

## The verdict

**The stochastic-resonance optimum is reachable by auditory-nerve fibres up to a
characteristic frequency of about 1 kHz, and is not reachable above it.**

| CF | spontaneous rate required to sit at the optimum | within the empirical ceiling? |
|---|---|---|
| 125 Hz | 10.3 – 35.7 sp/s | yes, comfortably |
| 250 Hz | 20.7 – 71.4 sp/s | yes |
| 500 Hz | 41.3 – 142.8 sp/s | yes, at the high-rate end |
| 1 kHz | 82.6 – 285.6 sp/s | only at the very top |
| 2 kHz | 165 – 571 sp/s | **no** |
| 4 kHz | 331 – 1143 sp/s | **no** |
| 8 kHz | 661 – 2285 sp/s | **no** |

The required rate scales with `ω_eff`, so it rises linearly with characteristic
frequency while the physiological ceiling does not move. That is the whole
mechanism of the crossover.

### What this says about the 1995 hypothesis

It **supports it, and bounds it**. Matias's proposal was that background
physiological noise is functional rather than a defect — that it lets subthreshold
membrane displacements cross the firing threshold. The model reproduces the
mechanism (GATE-B2, 24/24) and, confronted with physiology, says the mechanism is
available to **low-frequency** hearing and unavailable to high-frequency hearing
at the rates fibres actually show.

That is a sharper claim than the original and it is testable: if stochastic
resonance is the mechanism, its signature should be present in low-CF fibres and
absent in high-CF ones. Nothing in this project measured that, and it is the
obvious next experiment.

### The assumption to attack first

`ω_eff` — the effective bandwidth of the internal noise — is taken as `2π·CF`.
This is not verified and it carries the entire verdict:

- a **broader-band** internal noise raises the required rate proportionally and
  moves the crossover **down**, against the hypothesis;
- a **narrower-band** one moves it **up**, in favour.

Anyone attacking this result should attack that number before anything else. It
is recorded as `load_bearing_assumption` in the run.

## What GATE-B1 said about the place map

Separately, and on the operator ADR-0002 introduced: the simulated tonotopic map
correlates with Greenwood's human place-frequency function at **r = +0.9986** in
shape, with a slope of −0.332 per decade against Greenwood's −0.428. Compared on
shape only — spec §R4 is explicit that a one-dimensional abstraction cannot match
it quantitatively, so a close numerical agreement would have been a coincidence
rather than a result.

`Q₁₀dB` comes out **2.2–2.7**, against the much sharper tuning measured in vivo.
Spec §2.7 predicted that in advance and called the gap the quantitative argument
for the Phase-2 active layer. It is reported as a result, not a shortfall.

## What would upgrade this document

1. **Run the LITERATURA role with web access** and replace every `[read]` above
   with a citation to the primary source, then re-run E4. The verdict's ordering
   should not move; the crossover frequency may.
2. **Measure `ω_eff` rather than assume it** — the model can compute the noise
   bandwidth at a probe in closed form, and comparing that against the fibre
   tuning it stands in for is a real check rather than an assumption.
3. **The low-CF versus high-CF prediction** is the falsifiable consequence and
   nothing here tests it.
