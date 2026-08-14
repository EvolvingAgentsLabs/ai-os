# COCLEA-SR

A project **on** ai-os, not beside it: the basilar membrane as a frequency
decoder, and stochastic resonance as the mechanism that lets a subthreshold
displacement be detected. The hypothesis is Matias's, from ~1995. This is the
first computational pass at it.

It is also the workload that gave `ai-flows` its first declared metric — see
[`doc/16`](../../doc/16-a-workload-with-an-oracle.md) for what the OS learned
from it, which is the other half of why the project is here.

> **State, 2026-08-14.** The passive layer is built and validated: **45 gates
> green [ran]**. The place code is **not** built, and the reason is a measured
> negative result rather than an unfinished task — see below. The stochastic
> layer (§4 of the spec) is not started.

## What holds, and what does not

**[ran] The passive membrane is correct.** Eigenvalues match their closed forms
to `9.3e-6` (uniform, GATE-A01) and `2.3e-6` (exponential profile, GATE-A08),
converge at order 2.00, are orthogonal under the weight `mu`, satisfy the Sturm
oscillation theorem, reconstruct a smooth initial condition to `4e-7` from 200
modes, and follow the WKB quantisation with an error that falls monotonically
with mode number, as a semiclassical approximation must.

**[ran] The model in the specification cannot produce a cochlear traveling
wave.** `experiments/e2_tonotopy.py` swept 60 frequencies across three decades,
in six arms. Neither the specification's own equation (2.1) nor the ground-spring
term of [ADR-0001](decisions/0001-the-place-code-needs-a-term-the-spec-absorbs.md)
produces a place map, at any coupling length. The reason is analytic: the local
wavenumber makes the response **propagating apical to the characteristic place
and evanescent basal to it** — the inverse of Békésy. A wave entering at the
stapes decays by twenty-eight orders of magnitude before reaching the position it
is tuned to.

The replacement operator — a long-wave transmission line, with the membrane
impedance in the *denominator* of the wavenumber, which is what fluid coupling
does and membrane tension cannot — is specified in
[ADR-0002](decisions/0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md)
and **deliberately not built**. Three model changes in one session is the point
at which the workspace rule says to stop and write down what was measured.

## Run it

```bash
cd projects/coclea-sr
python3.12 -m venv .venv && .venv/bin/pip install numpy scipy sympy mpmath pytest

.venv/bin/python -m pytest gates/ -q                       # the 45 gates
PYTHONPATH=src .venv/bin/python experiments/e2_tonotopy.py # E2, both arms
python3 verify_ledger.py                                   # re-derive the chain
```

`verify_ledger.py` uses the standard library only and imports nothing from
`src/`. That is the point of it: a verifier sharing code with the thing it
verifies checks self-consistency, not truth.

## Layout

| | |
|---|---|
| [`COCLEA-SR-SPEC.md`](COCLEA-SR-SPEC.md) | The specification. Where code and spec disagree, the spec wins — and where the spec is wrong, an ADR says so |
| [`truth/`](truth/) | Closed forms in sympy and mpmath. **Imports nothing from `src/`** (spec §6.4 rule 4) |
| [`src/coclea/`](src/coclea/) | The solver: units, profiles, assembly, modal, forced, attestation |
| [`gates/`](gates/) | One pytest module per gate. Each writes `gates/reports/*.json` on **every** outcome |
| [`experiments/`](experiments/) | E2 and its control arm |
| [`decisions/`](decisions/) | Two ADRs. Both are about the same gap, and the second says the first was wrong |
| [`runs/`](runs/) | Content-addressed run directories, with manifests |
| `ledger.jsonl` | Hash-chained, one line per artefact transition |

## Three ways the instrument lied, and how each was caught

Kept because the workspace rules ask for it, and because none of them was found
by reading.

**The reference profile violated the specification's own constraint.** §3.1 fixes
the exponents by requiring `(alpha_K + alpha_mu)/2 ≈ ln(f_base/f_apex)`. A
hand-picked pair gave 4.0 against the required 6.95, so the membrane spanned 1.7
of the 3.0 decades it needed, and the symptom was a flat `x_cf` that reads as *"a
compressed place map"* rather than *"the wrong profile"*. The exponents are now
derived from the same Greenwood constants `units.py` holds.

**A convergence gate measuring its own solver.** Error ratios of 4.000, 3.997,
4.017, then **4.423** — the last refinement sat twice above the eigensolver's
precision floor. The fitted order was 2.0306: inside the gate's band, clean, and
about the wrong thing. Caught because an independent TypeScript implementation
reported 1.9841 for the same quantity, also inside the band. GATE-A12 now
computes its floor and names the grids it drops.

**A gate that could not fail.** GATE-A2 as specified compares `phi^T M phi`
against the identity — which `eigh_tridiagonal` guarantees *by construction*, and
would guarantee for a solver orthogonalising against the wrong weight entirely.
The gate now compares the numeric modes against the **closed-form** family in the
same weighted inner product, which can fail. The structural version is still
reported, labelled as structural.

## Where the specification is wrong, and it is recorded rather than worked around

§5.1 asks for a second-order Neumann condition via a ghost node **and** for
`||S - S^T|| < 1e-12`. The ghost-node substitution makes the apex row asymmetric,
so the assembly §5.1 prescribes fails the gate §5.1 demands. The finite-volume
form in [`assembly.py`](src/coclea/assembly.py) satisfies both, and its docstring
says why rather than quietly diverging.

## The deliberate defect

`assembly.py` implements `scheme="lumped-full-cell"`: the apex node gets a whole
cell of mass instead of the half it owns. It is there because **a gate that has
never gone red is not evidence that it works.** It leaves the matrix symmetric,
the mass positive, the spectrum ordered and every mode's zero count correct — and
the naive "does the mass integrate to the continuum value" check *prefers* it.

Do not remove it. `gates/test_A12_convergence.py` asserts that GATE-A12 rejects
it; if that assertion ever passes, the gate has stopped measuring.
