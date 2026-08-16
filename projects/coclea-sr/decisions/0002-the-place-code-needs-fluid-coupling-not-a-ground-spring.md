# ADR-0002 — The place code needs fluid coupling, not a ground spring

**Date:** 2026-08-14
**Status:** **built and accepted, 2026-08-14** — its pre-registered condition was met
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

## Why it was not built in the pass that specified it

The workspace rule is to count redesigns: "fine once, suspicious twice, and by
the third it is looking for the result rather than measuring it." That pass had
already changed the model three times — κ absorbed, κ made explicit, κ re-scaled
as a coupling length — and each change moved the instrument closer to the answer
it wanted. Stopping there, with the falsification recorded and the next operator
specified but unbuilt, is the discipline the count exists to enforce.

The stopping condition was therefore **written before the operator existed**:
the transmission line is accepted only if `cochlear_orientation` is true and the
control arm — the string with a ground spring — remains false.

## Result, measured 2026-08-14 — [ran]

Built in `src/coclea/transmission.py`. **Both halves of the pre-registered
condition hold**, and they are gates rather than a note:

| | treatment (transmission line) | control (string + ground spring) |
|---|---|---|
| `cochlear_orientation` | **true at all six frequencies** | **false at all six** |
| peak is interior | true at all six | false |
| gate | `GATE-C2` | `GATE-C2`, control arm |

And the operator is validated as a solver before being trusted as physics:

* **GATE-C1** — against the closed form `P(x) = sin(k(1−x))/sin(k)` for the
  constant-impedance box, in complex arithmetic: `7.3e-7` relative at N = 4000,
  converging at **order 2.00**.
* **GATE-C2** — the peak lands where the impedance resonates. `x_cf` from the
  solved field and `characteristic_place` from `Re(Z) = 0` agree to better than
  five grid spacings at every frequency: 500 Hz → 0.5358 vs 0.5357, 3 kHz →
  0.2777 vs 0.2778, 12 kHz → 0.0780 vs 0.0783. **A peak that moves is not a
  place code; a peak that moves to where the membrane is tuned is.**
* **GATE-C3** — power in at the stapes equals power dissipated in the membrane,
  computed independently from a boundary term and a volume integral: relative
  residual `4.3e-8`, falling with the grid.

Two findings that were not anticipated and are recorded because they corrected
an expectation rather than confirming one:

* **Damping does not control the delivered power.** Over three decades of `ζ`
  the power the stapes delivers moves by 16% while the peak displacement moves
  by a factor of 400. The stapes delivers what the line's input impedance
  accepts; `ζ` decides only where and how sharply it is absorbed. An assertion
  that "more damping dissipates more" was written, failed, and was replaced by
  the law that does hold: **|U|ₘₐₓ ∝ 1/ζ**, constant to 6% across `ζ = 0.01…0.4`.
* **The 1/ζ law is grid-limited at small damping.** At `ζ = 1e-3` a 2000-point
  grid reads `|U|ₘₐₓ·ζ = 2.50` instead of 4.21 — a 40% error that looks like the
  law breaking and is the grid failing to resolve the peak. It recovers on
  refinement: 2.497, 3.885, 4.205 at N = 2000, 8000, 32000.

**The decision stands and ADR-0001 stays superseded.**
