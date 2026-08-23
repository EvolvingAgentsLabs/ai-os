# HEMO-VERIFIED

Can a set of physics checks tell you that a flow prediction is wrong, without
ever seeing the right answer?

The specification is in [SPEC.md](SPEC.md); the general-audience article is
[ARTICLE.md](ARTICLE.md) ([es](ARTICLE.es.md)). This file records what has been
built and what it measured.

## Status: H0 survives

H0 is the pre-registered kill gate — the cheapest experiment that could end the
project. Oracles are run on exact solutions of the Navier–Stokes equations
(steady Poiseuille and pulsatile Womersley) and on those same solutions
corrupted by amounts chosen in advance, so the true error is known by
construction rather than estimated.

```
98 predictions, 32% of them worse than 5% true error

  AUC (composite)   0.906     kill below 0.80  ->  SURVIVES
  Spearman rho      0.822
  false-accept      2.1%      target <= 2%
  decisions         ACCEPT 48   ESCALATE 18   REJECT 32
```

Every corruption type that produces more than 5% error is caught:

| corruption | bad cases | not accepted | AUC alone |
|------------|-----------|--------------|-----------|
| phase      | 5         | 5/5          | 1.000     |
| bias       | 8         | 7/8          | 0.988     |
| divergence | 4         | 4/4          | 0.982     |
| noise      | 8         | 8/8          | 0.863     |
| slip       | 6         | 6/6          | 0.819     |

The one false accept is a Womersley bias case whose true error is 0.050 against
a bad-case boundary of 0.050 — the boundary itself, not a miss.

**The suite is not one oracle with decorations.** A3 alone reaches 0.838, but
removing both A3 and A4 still leaves 0.896: individually weak gates cover
different failures, and the portfolio beats each member.

| oracle | alone | catches |
|--------|-------|---------|
| A3 momentum residual | 0.838 | most things |
| A4 no-slip (hard)    | 0.652 | slip — **and see below: this row moves between machines** |
| A10 temporal envelope| 0.639 | phase |
| A2 local mass        | 0.590 | divergence |
| A1 global mass       | 0.585 | divergence |
| A6 energy budget     | 0.522 | bias, steady only |
| A5 inlet vs BC       | 0.521 | bias, steady only |

Every number here is read out of `gates/reports/h0.json` by
[`scripts/check-h0-table.py`](../../scripts/check-h0-table.py), because two of
these seven cells had been wrong: A5 and A6 were transposed, and A4 said 0.706.

## The honest limit of this result

**The corruptions and the oracles were designed by the same author.** H0 shows
the gates rank errors of a kind we thought of. It cannot show they rank the
errors a trained surrogate actually makes, because no surrogate has been trained
yet. That is H1, and it is the next gate — not a refinement of this one.

Two other things this does not yet show: A7 (wall shear bounds) and A8
(residence-time scalar) are specified and unbuilt, because neither quantity
exists on an analytical pipe; and every number here is on a rigid axisymmetric
tube, which is the simplest geometry that has an exact solution and nothing like
an atrium.

## What was caught while building it

Five defects that each produced a plausible number first, in the workspace
tradition of writing these down. The fifth was found by somebody who had never
run this project, which is the only way it could have been found at all:

- **The quadrature was biased 2.6%.** Summing `2πr·dr` at every node overshoots
  the cross-section, because both endpoints are counted in full. That bias is
  larger than A1's 1% threshold, so the mass oracle would have been measuring
  the integration rule. Trapezoidal ends fix it to machine precision.
- **Womersley had a sign error.** The closed form left an O(1) momentum residual
  and its quasi-steady limit went to zero instead of Poiseuille. Caught by the
  limit check, not by reading.
- **H0 was not reproducible.** The perturbations were seeded with `hash()`, and
  Python randomises string hashing per process, so every run reported a slightly
  different AUC. It moved in the fourth decimal and changed no conclusion —
  which is luck, not a property. Now seeded with a stable checksum, with a test
  that runs the pipeline in two separate processes and demands they agree
  exactly.
- **A10's threshold was invented and fired on a perfect field.** See
  [ADR-0001](decisions/0001-the-envelope-threshold-is-derived-not-chosen.md).
  The replacement is derived from the momentum equation and holds a flat slack
  of 2.1 across a 16x range of sampling rates.
- **The attested report was not produced by the attested code, and A4's AUC is
  a property of the machine.** Found on 2026-08-23 by building the suite from a
  clean clone on a different BLAS. Two things, and the first is the sharper one:

  `eval/h0.py` writes `runtime: {seconds}`; the committed `gates/reports/h0.json`
  carried a top-level `seconds` and no `runtime` at all. That nesting was
  introduced by the same commit that fixed the seeding, so **the artifact in the
  repository could not have come from the code in the repository** — it was
  regenerated mid-change and never again. A report whose provenance nobody
  checks is a report, not an attestation.

  Then, on a fresh run: the composite AUC, the Spearman coefficient, the
  decision counts and the false-accept rate came back **bit-identical**, and
  `A4 alone` moved 0.706 → 0.652. 49 of 98 A4 measurements differ in their last
  decimals, which is ordinary; what is not is that 66 of the 98 are exactly
  `0.0`, so one uncorrupted case sitting at `1.03e-13` on one machine and `0.0`
  on the other crosses into a 66-wide tie block and drags the rank statistic
  with it. The composite is untouched because A4 is `HARD` — it contributes a
  pass/fail against a threshold far above the noise floor, never its score.

  `make reproduce` is the instrument that was missing, and `h0.json` now records
  the environment it was produced on so the next comparison can tell *disagrees*
  from *was produced somewhere else*.

The first two would each have produced a clean H0 number that meant nothing. The
third and fifth would have produced one nobody could reproduce — and the fifth
would have looked reproducible while doing it, because the test the third one
added compares two processes on one machine and never reads the committed
artifact at all.

## Run it

```sh
python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"

make test       # 13 tests: the precondition, before any experiment
make h0         # the kill gate
make verify     # tests plus the slack audit
make reproduce  # re-run H0 and diff it against the attested report
```

**The first line was not written down until 2026-08-23.** There was no
`pyproject.toml` at all: the `Makefile` called `.venv/bin/python`, the README
said `make test`, and nothing anywhere said what to install — so the project
could be run only by somebody who already had it working. The manifest names its
three importable packages explicitly, because a flat layout makes setuptools
refuse otherwise, and that refusal is the first thing a clean clone met.

`gates/check_slack.py` is COCLEA-SR's auditor, running here **unmodified** on a
different domain.
