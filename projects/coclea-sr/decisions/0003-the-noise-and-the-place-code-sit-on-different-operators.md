# ADR-0003 — The noise and the place code sit on different operators

**Date:** 2026-08-14
**Status:** **resolved, 2026-08-15** — the unification is built and accepted
**Raised by:** E3 reaching GATE-B2 while E2's place map comes from ADR-0002's operator

## The seam

Two halves of the project now run on two different equations, and both are the
one the specification names for their own half:

| | operator | what it produces | where the specification says so |
|---|---|---|---|
| **E2 / B1** | ADR-0002's long-wave transmission line | the tonotopic place map | §2.7 asks for `x_cf(Ω)`; ADR-0002 is what can produce it |
| **E3 / B2** | spec (2.1)'s passive string, modal OU | the stochastic-resonance curve | §4.1 adds `η` to equation (2.1); §5.3's scheme is per-eigenmode |

This is not an oversight of the specification. §4.1 writes the noise into (2.1)
explicitly, §4.3's Lyapunov gate is stated per mode, and §5.3.2's exact scheme is
an Ornstein-Uhlenbeck process in the modal basis — **all of which require an
eigenvalue problem**, and the transmission line does not have one, because its
impedance depends on the drive frequency.

## Why it is being recorded rather than fixed now

The measured consequence is bounded and known:

* **E3's result does not depend on the place code.** GATE-B2 is about whether a
  threshold detector fed a weak tone plus noise shows a significant interior
  maximum in SNR. It holds at all 24 probe-and-frequency combinations, and the
  measured optimum matches the parameter-free prediction `σ_opt = θ/2` to 11.6% —
  which is the resolution of the σ grid. None of that reasoning uses a traveling
  wave.
* **What E3 cannot yet say** is the thing spec §R2 calls the interesting result:
  whether the resonance is *sharpest where the membrane is tuned to the tone*.
  The spatial modulation E3 does report — peak SNR falling from 15.5 dB at
  `x = 0.15` to 7.4 dB at `x = 0.85` — is the string's mode shapes, not a place
  code, and saying otherwise would be the claim this ADR exists to prevent.

## How to unify them, when it is built

The transmission line is linear, so the noise-driven field is a stationary
Gaussian process and only its **spectrum** is needed:

    S_u(x_p, ω) = S_η · Σ_j |G(x_p, x_j, ω)|²

which looks like it needs the full Green's function — one solve per source node,
per frequency. It does not. The operator is symmetric, so **reciprocity** gives
`G(x_p, x_j, ω) = G(x_j, x_p, ω)`, and the sum becomes the squared norm of the
response to a *single* point source at the probe:

    S_u(x_p, ω) = S_η · ‖ g_ω ‖²,     g_ω = line solved with a unit source at x_p

**One tridiagonal solve per frequency bin.** A time series with that spectrum is
then synthesised by FFT, the analytic tone superposed as it already is, and
`detector.py` and `analysis.py` are unchanged.

## The stopping condition, written before it runs

Unifying them is accepted only if:

1. GATE-A9's analogue holds — the synthesised field's variance matches the
   spectrum integral, so the new sampler is validated before it is trusted; and
2. the SR optimum still lands within the grid resolution of `σ_opt = θ/2`, which
   is a property of the detector and must survive changing the field; and
3. **peak SNR is maximised near `x_cf(Ω)`** rather than falling monotonically —
   the thing the current arrangement cannot show and the only reason to build it.

If (3) fails, the place code and the resonance are independent, which is a real
result and a more interesting one than the arrangement that assumes them linked.


---

## Result, measured 2026-08-15 — [ran]

Built in `src/coclea/tl_stochastic.py` and `sr.tl_sr_curve`, run as
`experiments/e5_tl_resonance.py`. The reciprocity route works as described: one
tridiagonal solve per frequency instead of one per source node, which is a
factor of `N = 1000` and the difference between a module and a cluster job.

### The question §R2 calls the interesting one, answered

**Yes — the resonance is sharpest where the membrane is tuned.**

| drive | `x_cf` from the impedance alone | probe with the highest peak SNR | within one probe spacing? |
|---|---|---|---|
| 800 Hz | 0.4680 | 0.48 | yes |
| 3 kHz | 0.2775 | 0.24 | yes |
| 9 kHz | 0.1195 | 0.08 | yes |

And it is not a small preference. At 3 kHz the peak is **3.17 dB** at the tuned
place and between −0.9 and +1.5 dB everywhere else, and **only the probes at or
next to `x_cf` show a statistically significant interior maximum at all.** Away
from the tuned place there is no stochastic resonance to speak of.

The asymmetry that produces it is visible in the calibration: with one noise
intensity, one threshold and one stapes drive for the whole membrane, the tone
at 3 kHz is `0.500 θ` at `x_cf` and between `0.001 θ` and `0.03 θ` everywhere
else, while `σ/θ` ranges from 0.14 to 2.8. **The tone is sharply place-coded and
the noise is not.**

### Condition 1 — passed, after catching a factor of two

The synthesised field's variance matches the closed-form spectrum integral to
within 2%. It did not at first: the sampler carried exactly **half** the
predicted variance, ratio 0.4929, from a one-sided/two-sided convention. That is
what this condition was pre-registered to catch, and it caught it — the error is
invisible in any curve that is only ever compared against itself.

### Condition 2 — **failed, and it was mis-specified**

The condition required the optimum to stay within grid resolution of
`σ_opt = θ/2`, on the reasoning that this "is a property of the detector and
must survive changing the field". **That reasoning is wrong.** The law is derived
in the *adiabatic* limit — spec §4.2's `Ω ≪ 1/τ_corr` — and is a property of the
detector *and the regime*.

Measured, and the numbers are unambiguous:

| | tone period / `τ_corr` |
|---|---|
| GATE-A10, where the law was validated | **62.8** — adiabatic |
| transmission line at `x_cf`, 800 Hz / 3 kHz / 9 kHz | **0.308 / 0.311 / 0.308** |

Two hundred times off the regime, on the opposite side, and **constant across
frequency** — because the membrane at `x_cf` *is* a tuned filter, so its noise is
centred on the tone's own frequency and its bandwidth scales with it. The cochlea
cannot be adiabatic: the mechanism that creates the place code is the same one
that forces signal and noise into the same band.

The condition is left **failing and recorded** rather than relaxed — relaxing a
pre-registered condition after seeing the data is how a result gets arranged. A
correctly scoped replacement is reported beside it: **`c2b`, the optimum must be
a stable property across probes and frequencies even where its adiabatic value
does not apply.** Measured `σ_opt/θ` clusters at 0.55–0.64 against the adiabatic
0.5, with a spread below 0.1. That passes.

### What this changes about the project's own claims

E3's spatial modulation was the string's mode shapes and is now superseded for
any spatial statement: the string has no place code, so "where the membrane is
tuned" had no referent in it. E3 remains the validation of the *detector and
estimator* against a parameter-free law in the regime where that law holds.

**A new, sharper prediction falls out.** If stochastic resonance is a place-coded
mechanism, then the deviation of `σ_opt/θ` from the adiabatic 0.5 is a *signature
of co-tuning* — and it should be present in real fibres for the same structural
reason. Nothing here measures that.
