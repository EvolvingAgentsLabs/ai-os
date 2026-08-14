# ADR-0003 — The noise and the place code sit on different operators

**Date:** 2026-08-14
**Status:** accepted as a stated limitation — the unification is specified, **not built**
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
