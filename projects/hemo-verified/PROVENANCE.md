# Provenance — every input this project is allowed to have

This repository is open source and must stay publishable. It is **allow-list
only**: it may contain nothing but the inputs declared below and what is written
here from scratch. No code, no weights, no meshes, no thresholds and no geometry
enter from anywhere else, and nothing derived from an undeclared source does
either.

**A promise does not make a repository publishable. A check does.**
`verify_provenance.py` fails if a tracked file does not descend from an input
declared here, or if a declared input's hash has moved under us. It runs in
`make verify` and in CI, and a red provenance check blocks a release the way a
red gate blocks a freeze.

## Declared inputs

| input | version pinned | licence | what it provides | what it does **not** provide |
|-------|----------------|---------|------------------|------------------------------|
| [dynamicslab/hydrogym](https://github.com/dynamicslab/hydrogym) | `a7223b07d24a` (2026-08-22) | MIT | 61+ flow environments over six solver backends (Firedrake FEM, MAIA LBM, MAIA FV, NEK5000, JAX-Fluids), Gymnasium API | anything cardiac. It is the instrument, not the domain |
| [Bjonze/Public-Cardiac-CT-Dataset](https://github.com/Bjonze/Public-Cardiac-CT-Dataset) — STACOM 2025, [arXiv 2510.06090](https://arxiv.org/abs/2510.06090) | `5a9a0b6657a3` (2025-10-16) | MIT | cardiac CT with segmentation labels: LA (2), LAA (8), PV (10), among others | **any flow data.** The dataset is geometry. Every ground-truth field in H2 is computed here, from these labels, with open tools |

Cite the STACOM paper if the dataset is used; the repository asks for it and the
citation is part of the licence hygiene, not a courtesy.

## What is excluded

Everything not in the table. An allow-list needs no list of exclusions, which is
the point of writing it as one: undeclared code, models, checkpoints, meshes,
thresholds and geometry are out by default, whether they would be vendored,
adapted, or paraphrased into a specification. Patient data beyond the public
dataset above is out on the same rule.

The boundary is a property of the artifact, not of anyone's memory of it. That is
the whole reason the check exists.

## Adding an input

1. Add a row above: origin, pinned version, licence, what it provides and what it
   does not.
2. Record its hash in `provenance.lock`.
3. Open an ADR if the input changes what the project can claim — a new solver
   backend does, a patch release does not.
