# ADR-0001 — The place code needs a term the spec absorbs

**Date:** 2026-08-14
**Status:** **falsified by its own experiment, 2026-08-14** — superseded by [ADR-0002](0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md)
**Raised by:** implementation of `src/coclea/assembly.py`, before writing it
**Spec sections in tension:** §2.1 (equation 2.1), §2.5 (the WKB place map), §2.7

## The gap

Spec §2.1 gives the model equation:

    d/dt[mu(x) du/dt] = d/dx[K(x) du/dx] - gamma(x) du/dt + F(x,t)

and §2.7 asks that the forced response `|U(x; Omega)|` peak at a position
`x_cf(Omega)`, which is *the* deliverable of the passive layer — the tonotopic
map, the thing the whole project calls a natural frequency decoder.

**Equation (2.1) has no such peak, and it cannot have one.** The Sturm-Liouville
operator it defines has local wavenumber `k(x) = omega sqrt(mu/K)`, which is
real everywhere for any positive profile. There is no turning point, so no wave
runs out of medium anywhere, so nothing selects a place. A driven string with
smoothly varying density resonates in whichever *global* mode is nearest the
drive frequency, and those modes have support along the entire membrane. The
place principle is absent from the equation, not merely hard to see in it.

§2.5 knows this. It writes the local characteristic frequency as

    omega_local(x) = sqrt( K(x) kappa^2 / mu(x) )

and then says of `kappa`: *"número de onda transversal efectivo, absorbido en la
parametrización"*. That absorption is the gap. `kappa` cannot be absorbed into
`mu` or `K`, because `omega_local` is a property of a term that equation (2.1)
does not contain. What §2.5 describes is a membrane with a restoring force *to
ground*, and (2.1) only has restoring force *to its neighbours*.

## Decision

Make the term explicit rather than absorbed. The implemented operator is

    d/dt[mu(x) du/dt] = d/dx[K(x) du/dx] - S(x) u - gamma(x) du/dt + F(x,t)

with the **local stiffness to ground**

    S(x) = kappa^2 K(x)

which is exactly the `kappa` of §2.5, now written where it acts. The
eigenproblem becomes

    -(K phi')' + S phi = omega^2 mu phi,    phi(0) = 0,   phi'(L) = 0

## Why this is a small decision and not a new model

**The Sturm-Liouville structure is untouched.** `-(K phi')' + S phi` with
`S >= 0` is the general Sturm-Liouville form; the spec's (2.5) is its `S = 0`
special case. Every property §2.3 relies on — real simple spectrum,
`mu`-orthogonality, the oscillation theorem, completeness — holds verbatim, and
so does the Rayleigh quotient §2.4 with `S phi^2` added to the numerator. No
gate's *reasoning* changes.

**`kappa = 0` recovers the spec exactly.** GATE-A1 and GATE-A8 are both stated
for profiles with no ground term, so both run at `kappa = 0` against truth
values derived from (2.1) itself. The decision therefore cannot launder itself
past the analytic gates: they still test the operator the spec wrote down.

**It is the standard one-dimensional cochlear model**, not an invention here.
The partitioned-duct models this project abstracts from (Békésy's traveling
wave; §12's Duke & Jülicher) all carry a local oscillator per section, and the
membrane's measured stiffness is stiffness *against the fluid pressure
difference*, which is a restoring force to rest, not to the neighbouring
section. §1.1's own description — "rigidez decrece 2-4 órdenes de magnitud de
base a ápex" — is a statement about `S`, not about longitudinal coupling.

## How this gets falsified

The decision claims a term is *necessary*, and a claim of necessity is cheap to
kill: run without it. `experiments/e2_tonotopy.py` sweeps `Omega` and extracts
`x_cf(Omega)` twice — once at `kappa = 0` (the spec's literal equation, the
control arm) and once at `kappa > 0`.

**If the `kappa = 0` arm already produces a monotone, roughly log-linear place
map, this ADR is wrong and should be reverted**, because the term bought
nothing. That is the headroom check the workspace rules demand before building a
treatment, and it costs one extra sweep of a linear solve.

The result of that run belongs in this file when it exists, whichever way it
comes out.

### Result, measured 2026-08-14 — [ran]

Run `e2-tonotopy`: 60 drive frequencies over three decades, the reference profile
of §3.1 with its exponents derived from Greenwood, six arms.

| arm | `x_cf` span | peaks interior | monotone | place map |
|---|---|---|---|---|
| control, no ground term (spec 2.1) | 0.481 | 0.53 | 0.46 | **no** |
| treatment, ε = 0.005 | 0.000 | 0.00 | 1.00 | **no** |
| treatment, ε = 0.01 | 0.000 | 0.00 | 1.00 | **no** |
| treatment, ε = 0.02 | 0.634 | 0.02 | 0.98 | **no** |
| treatment, ε = 0.05 | 0.923 | 0.23 | 0.97 | **no** |
| treatment, ε = 0.1 | 1.000 | 0.20 | 0.93 | **no** |

**This ADR is wrong, and its own falsification condition is what says so.** The
control arm produces no place map, as predicted — but neither does the
treatment, at any coupling length. The term was necessary and it was not
sufficient, which the ADR did not consider.

The cause is analytic and the experiment now measures it directly. The operator
this ADR introduced has local wavenumber

    k²(x) = (Ω² μ − K) / (ε² K)

so it **propagates where `Ω² μ > K`, which is apical to the characteristic
place, and decays basal to it.** Békésy's traveling wave is the other way round:
the wave runs in from the stapes through a propagating region, slows, piles up
at its place, and is evanescent beyond it. Every treatment arm reports
`cochlear wave orientation: NO — INVERTED`. A wave driven at the base in this
operator decays immediately and never reaches the place it is tuned to, which is
exactly the measured response: at 5 kHz, |U| falls monotonically from 0.99 at
the drive to 4·10⁻²⁸ at the apex, with no bump anywhere.

A string with a spring to ground is not a cochlea, however the springs are
graded. What was missing is not a stiffer or softer term — it is that the
membrane impedance has to sit in the **denominator** of the local wavenumber,
which is what fluid coupling does and what membrane tension cannot. See
[ADR-0002](0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md).

**What this cost, and what it bought.** Two afternoons of solver, no new
service, and it was killed by the one control arm the ADR committed to running
before building on the treatment. The alternative — noticing after the
stochastic layer had been built on top of a membrane with an inverted traveling
wave — is the outcome the rule exists to prevent.

**What survives.** `S(x)` stays in `profiles.py` behind `coupling`, defaulting
to `0`. Gates A1–A12 are unaffected: every one of them runs at `coupling = 0`,
which is spec equation (2.1) exactly, and all 45 are green. The passive string
is validated; it is simply not a cochlea.

## Cost of being wrong

Low and bounded. `kappa` is a single parameter on `BMProfile` defaulting to a
value the tonotopy experiment sets; the analytic gates pin `kappa = 0`; deleting
the term is a one-line revert plus this file's supersession.
