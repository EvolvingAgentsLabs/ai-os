# ADR-0002 — The place code needs fluid coupling, not a ground spring

**Date:** 2026-08-14
**Status:** accepted as the specification of the next operator — **not built**
**Supersedes:** [ADR-0001](0001-the-place-code-needs-a-term-the-spec-absorbs.md)
**Raised by:** run `e2-tonotopy`, which falsified ADR-0001 across its whole
coupling sweep

## What the measurement said

ADR-0001 added a stiffness to ground to spec equation (2.1) so that the membrane
would have a characteristic frequency per position. It does. The place map still
does not appear, at any coupling length from ε = 0.005 to ε = 0.1, and the run
reports why: the traveling wave is **inverted**.

For the operator `−ε²(K φ′)′ + (K − Ω²μ) φ = 0` the local wavenumber is

    k²(x) = (Ω² μ(x) − K(x)) / (ε² K(x))

which is **positive — propagating — apical to the characteristic place**, and
negative basal to it. A wave entering at the stapes is evanescent from the first
node and has decayed by twenty-eight orders of magnitude before it reaches the
position it is tuned to.

## Why a ground spring can never fix this

The sign of `k²` is set by where the membrane impedance sits in the equation. In
a string with a spring to ground, the impedance sits in the **numerator**: stiff
regions resist, so the wave is blocked exactly where stiffness is high — which
is the base, which is where the wave must enter.

The cochlea inverts this through the fluid. Sections do not pull on each other;
they push on a shared incompressible fluid, and the coupling equation is one on
the **pressure difference** across the partition, with the membrane impedance in
the denominator:

    P″(x) + k²(x) P(x) = 0,      k²(x) = (2 ρ / H) Ω² / Z(x)
    Z(x) = s(x) − Ω² m(x) + i Ω r(x)      the partition's point impedance
    U(x) = P(x) / Z(x)                     membrane displacement

Now the signs come out right, and they come out right *for the physical reason*:

* **Basal to the place**, `s(x) ≫ Ω² m(x)`, so `Z > 0` and `k² > 0` — the wave
  **propagates**, slowing as `Z` falls.
* **At the place**, `Z → iΩr`, `k²` turns large and imaginary: the wavelength
  collapses, the envelope piles up, and the energy goes into the damping. This is
  Békésy's peak, and it is a consequence rather than an input.
* **Apical to the place**, `Ω² m > s`, `Z < 0` and `k² < 0` — **evanescent**.

The two models are not different parametrisations of one equation. Stiffness in
the numerator and stiffness in the denominator are opposite physics, and no
choice of `ε`, `α_K` or `α_μ` moves one to the other.

## Decision

The next operator is the long-wave transmission line above. Concretely:

* the unknown becomes the pressure difference `P(x)`, with `U = P / Z`;
* the system is **frequency-dependent** — `Z` contains `Ω` — so it is a linear
  solve per drive frequency and **not a generalised eigenvalue problem**;
* the boundary conditions become `P(0)` set by the stapes and `P(L) = 0` at the
  helicotrema, where the two scalae connect and the pressure difference vanishes.

## What this costs, and what survives

**`modal.py` does not apply to it.** There is no `Sm φ = ω² M φ` to solve, so
GATE-A1, A2, A3, A4, A7, A8 and A12 — the whole analytic spine — are gates on
the passive string and stay gates on the passive string. They are not wasted:
the string is the operator spec §2.1 defines, all 45 of its checks are green,
and it remains the object the WKB derivation of §2.5 is about. It is simply not
the object that has a place code.

**`forced.py` mostly does apply.** It is already a banded solve per frequency,
already extracts `x_cf` and `Q₁₀dB`, and already refuses to call a peak at the
edge of the membrane a characteristic place. The transmission line changes what
goes into the three bands and nothing about what comes out.

**New truth values are needed.** The transmission line has a WKB solution with
an Airy turning point at the place, which gives an independent closed form to
gate against — the analogue of GATE-A8 for the new operator, and the reason not
to build it without one.

## Why it is not built in this pass

The workspace rule is to count redesigns: "fine once, suspicious twice, and by
the third it is looking for the result rather than measuring it." This is the
third change to the model in one session — κ absorbed, κ made explicit, κ
re-scaled as a coupling length — and each one moved the instrument closer to the
answer it wanted. Stopping here, with the falsification recorded and the next
operator specified but unbuilt, is the discipline the count exists to enforce.

The stopping condition for the next pass is written before it runs: **the
transmission line is accepted only if `cochlear_orientation` is true and the
control arm — this operator — remains false.** Both arms already exist in
`experiments/e2_tonotopy.py`.
