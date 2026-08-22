# HEMO-VERIFIED v0.1 — a ground-truth-free verification suite for flow-field predictions

**Status:** specification. Nothing has been built or run. Every number below is a
target or a threshold, not a measurement.

---

## 1. What this is for

A neural surrogate can produce a plausible velocity field in a second where a CFD
solver needs hours. The problem is not producing it. The problem is that **on a
new geometry there is no ground truth, so nothing tells you whether this
particular prediction is usable.** Every published surrogate reports mean error
over a test set; a mean says nothing about the case in front of you.

This project builds the missing half: a suite of **oracles** — pure functions of
the predicted field, the mesh and the boundary conditions — that score a single
prediction without ever seeing the truth, and a measurement of **how well those
scores actually rank the true error**.

The product is not the surrogate. It is the loop:

```
predict -> verify -> accept | reject | escalate to the solver
```

### The three things this is useful for, in order of confidence

1. **A reusable verification suite.** The oracles are solver-agnostic: they read
   fields on a mesh, not a file format. Anyone training a flow surrogate faces
   the same question and today answers it with held-out error. A tested suite
   with *published detection power* is usable by them on day one, and HydroGym's
   six solver backends make "solver-agnostic" testable rather than asserted.
2. **A transferable negative result, if it holds.** Section 5 predicts that gates
   which duplicate the surrogate's training loss detect that surrogate's failures
   worst. If true, it is a design rule for everyone building this kind of gate,
   and it is worth more than another surrogate.
3. **For ai-os: the first workload where an agent budgets its own compute against
   a verifier that is not a language model.** COCLEA-SR showed an external oracle
   can falsify an agent's hypothesis. This shows an agent using the cheap path
   where physics says it is safe and paying for the expensive one where it is
   not. The accept/escalate decision is an arm-selection problem whose reward is
   a Navier-Stokes residual.

### What it is not

Not diagnostic. Not a risk score. No patient-level output of any kind in v0.1,
and no clinical claim at any point in this document. The cardiac geometry in H2
is a *transport test* for the oracles, not a study of anyone's heart.

---

## 2. The claim, and the one number that settles it

> **Oracles with no access to ground truth can rank the true error of individual
> flow-field predictions well enough to route them, and the routing saves real
> compute.**

The chain has four links, and each can break independently:

| # | link | broken if |
|---|------|-----------|
| a | oracle score correlates with true error | AUC < 0.8 on H0 |
| b | an operating point exists with acceptable false-accept | no τ reaches ≤2% false-accept above chance |
| c | at that τ, most predictions are accepted | escalation fraction so high the saving vanishes |
| d | an agent can run the loop unattended | the loop needs a human at any accept/reject |

**The reported number is (c), not (a).** A specification that asks for AUC ≥ 0.9
*and* a 100x speedup as separate conditions can be satisfied by a useless system:
AUC 0.95 with an operating point that escalates 80% of cases saves nothing. The
single honest metric couples them:

```
S = (N · C_solver) / (N · C_surrogate + N · C_oracles + N_escalated · C_solver)

reported at the τ that holds false-accept <= 2%
```

`S` is bounded above by `1 / escalation_fraction` no matter how fast the
surrogate is. Report `S`, τ, the false-accept rate and the escalation fraction
together or not at all.

---

## 3. Clean room, enforced rather than promised

This repository is open source and must remain publishable. It is **allow-list
only**: nothing enters but the inputs declared in `PROVENANCE.md` and what is
written here from scratch — no code, no weights, no meshes, no thresholds and no
geometry from any undeclared source, and nothing derived from one.

A promise does not make a repository publishable. A check does.

- `PROVENANCE.md` lists every external input: origin, licence, version, hash.
- `verify_provenance.py` (stdlib only, like the other guards in this workspace)
  fails if a tracked file does not descend from a declared input, and fails if a
  declared input's hash has moved.
- It runs in `make verify` and in CI. A red provenance check blocks a release the
  way a red gate blocks a freeze.

Declared inputs for v0.1 are exactly two, both MIT:

- **HydroGym** (`dynamicslab/hydrogym`) — 61+ flow environments over six solver
  backends, Gymnasium API.
- **STACOM 2025 Public Cardiac CT Dataset** (`Bjonze/Public-Cardiac-CT-Dataset`,
  arXiv 2510.06090) — CT with segmentation labels including LA (2), LAA (8) and
  PV (10). Geometry only: **the dataset contains no flow**, so every ground truth
  in H2 must be computed here, from these labels, with open tools.

---

## 4. The oracles

Each is a pure function `(fields, mesh, bc) -> {pass, score, detail, slack}`,
read-only, content-hashed at boot. No oracle may consult ground truth, the
training set, or any statistic derived from either beyond the fixed thresholds in
`oracles/thresholds.yaml`.

| id  | law                  | quantity                                                  | class |
|-----|----------------------|-----------------------------------------------------------|-------|
| A1  | mass, global         | inlet flux − outlet flux − dV/dt, over mean inflow         | soft  |
| A2  | mass, local          | ‖∇·U‖ per cell, normalised by ‖∇U‖                         | soft  |
| A3  | momentum             | weak-form Navier–Stokes residual per cell, normalised      | soft  |
| A4  | no-slip              | ‖U‖ on wall nodes                                          | hard  |
| A5  | boundary consistency | inlet profile against the prescribed BC                    | soft  |
| A6  | energy               | d/dt KE − inflow work + viscous dissipation                | soft  |
| A7  | WSS bounds           | TAWSS finite, non-negative, below a viscous scale          | hard  |
| A8  | scalar bounds        | residence-time scalar in [0, t_max], monotone where sealed | hard  |
| A9  | symmetry             | mirrored geometry gives mirrored fields                    | test  |
| A10 | temporal envelope    | phase-to-phase ‖ΔU‖ against a solver-derived envelope       | soft  |

Verdict: any hard failure → `REJECT`. Otherwise a weighted soft score; below τ →
`ESCALATE`; else `ACCEPT`.

### Every threshold records its slack

A threshold is only evidence in proportion to how tightly it binds. Each oracle
report records `slack = threshold / measurement`, and the audit flags both ends:
slack above ~10³ means the gate is passing because it constrains nothing, and
below ~2 means it will fire on drift that means nothing. This is not a
speculative precaution. It was found in this workspace on 2026-08-22, in
COCLEA-SR, where one gate was green with 760,000x of room and another sat 8% from
red — both on numbers nobody had chosen.

**Thresholds are not tuned against the CFD that defines truth.** Calibrating a
gate on the same solutions used to score it is how a gate learns to pass.
Thresholds are set on the analytical cases of H0 and on solver noise floors,
versioned in `thresholds.yaml`, and every change is an ADR.

---

## 5. The hypothesis this project exists to test

Two of the oracles measure exactly what a physics-informed surrogate is trained
to minimise. If the loss is `MSE + λ · (divergence residual)`, then A2 is the
loss, and A3 is its near neighbour.

> **A gate that duplicates the training objective has systematically reduced
> power to detect that model's failures.**

The optimiser can drive the residual down without the field being right where it
matters, and the gate is then satisfied by construction. Stated as a prediction,
before anything runs:

- On a surrogate trained **with** the residual term, A2 and A3 have the **lowest**
  drop-one AUC of the soft oracles.
- On a surrogate trained **without** it, their drop-one AUC is materially higher.
- The gates that carry the signal in the first case are the ones the loss cannot
  reach: A4, A6, A8, A10.

If this holds it is the most transferable thing the project produces, and it
generalises past fluids: **a verifier that checks what the generator was
optimised for is measuring the optimiser, not the generator.**

---

## 6. Experiments

Kill conditions are written here, before any of them run.

### H0 — do the oracles rank error at all? *(hours, zero CFD)*

Exact solutions where the answer is known in closed form: **Poiseuille** (steady,
rigid tube) and **Womersley** (pulsatile, rigid tube). Corrupt them by controlled
amounts — additive noise at a set SNR, an injected gradient field, wall slip,
phase jitter, amplitude bias — each at several magnitudes, giving a true-error
axis that is known by construction.

Measured: AUC and Spearman ρ of oracle score against true error. Also the
unit-test property the suite must have before anything else is built — every
oracle **passes** on the exact solution and **fails** on each perturbation above
its threshold.

**Kill:** AUC < 0.8. The gates are insufficient, the write-up says so, and 6,000
core-hours of CFD are not spent. This is the whole claim in miniature and it
costs an afternoon.

### H1 — the gated loop on real solvers *(days, HydroGym, no OpenFOAM)*

The same oracles against real solutions from HydroGym environments, a surrogate
trained on them, and the accept/reject/escalate loop closed end to end. This is
where the router gets a reward that is not a language model's opinion.

Measured: `S`, τ, false-accept, escalation fraction — together. Plus the drop-one
ablation that tests §5, on two surrogates, with and without the residual term.

**Headroom check first, before any oracle is scored:** the distribution of the
surrogate's *true* error across predictions. If it is uniformly good or uniformly
bad there is nothing to rank, every AUC lands near 0.5, and the finding would be
about the surrogate rather than the gates. This check is cheap, it comes before
the treatment, and it is here because in this workspace a treatment has already
been built on top of a baseline pinned to the floor.

**Kill:** `S` < 5 at ≤2% false-accept. The gate cannot pay for itself.

### H2 — does it transport to cardiac geometry? *(only if H0 and H1 survive)*

**20 geometries, not 400.** Clean-room path: STACOM labels → surface → mesh →
solver, all with open tools. Same oracles, same code path for indices whatever
produced the fields.

Measured: whether H1's AUC and τ survive the move to LA/LAA geometry, or whether
the thresholds have to move — and if they move, by how much and on what evidence.

**Kill:** thresholds must be refitted per geometry family. That would mean the
suite is not solver- or domain-agnostic, which is the property that made it worth
publishing.

A full batch is not funded until H2 reports.

---

## 7. Invariants

1. Indices are computed once, by one code path, from fields of either origin.
2. No oracle sees ground truth or training statistics.
3. Every prediction is logged with geometry hash, model hash, oracle hashes,
   verdict, scores and slack: append-only, hash-chained.
4. Thresholds are versioned; changing one is a commit with an ADR.
5. No experiment starts before `tests/test_oracles.py` passes on the analytical
   cases: every oracle passes the exact solution and fails the perturbed ones.
6. Provenance is verified mechanically, not asserted.

---

## 8. Out of scope for v0.1

Moving walls and FSI, non-Newtonian rheology, mitral valve geometry, 4D-flow
assimilation, any risk score, any patient-level output, and the 400-geometry
batch. Each with a one-line reason in `LATER.md`.

---

## 9. Layout

```
hemo-verified/
  oracles/     a01_mass.py ... a10_envelope.py, thresholds.yaml, verdict.py
  indices/     wss.py, residence.py, laa.py        # one path, either origin
  analytical/  poiseuille.py, womersley.py, perturb.py
  envs/        hydrogym_adapter.py
  surrogate/   train.py, predict.py
  geom/        stacom_labels.py, surface.py, mesh.py    # H2 only
  eval/        h0.py, h1.py, h2.py, ablation.py
  tests/       test_oracles.py, test_indices.py, test_provenance.py
  decisions/   ADRs
  PROVENANCE.md  verify_provenance.py  LATER.md
```

---

## 10. Done when

```
python eval/h0.py --report      # AUC of oracle score vs known error
python eval/h1.py --report      # S, tau, false-accept, escalation, together
```

H0 reports AUC ≥ 0.8 on the analytical cases, and H1 reports `S` ≥ 5 at a false-
accept rate ≤ 2% with the escalation fraction stated beside it.

If H0 lands below 0.8, the finding is that these oracles are insufficient, and
that gets written up with the same care as a success — it is the cheapest true
thing this project can produce, and it costs an afternoon instead of a quarter.

## 11. What would make us stop

- H0 below 0.8 → the gates do not rank error; nothing downstream is worth
  building.
- H1's `S` below 5 → the gate cannot pay for itself, whatever its AUC.
- §5's prediction fails in the *opposite* direction — the loss-duplicating gates
  detect best — → the mental model behind the whole suite is wrong and the design
  needs rebuilding, not extending.
- H2 needing per-family thresholds → the suite is not general, and generality was
  the reason to publish it.
