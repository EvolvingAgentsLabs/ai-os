# Working in coclea-sr (for coding agents)

The specification is [`COCLEA-SR-SPEC.md`](COCLEA-SR-SPEC.md). **Read it before
writing code.** These are the rules of §6.4, plus what running it has since
taught.

## The rules

1. **The spec is the only valid specification.** Where it is ambiguous, write an
   ADR in `decisions/` before implementing — do not improvise. Where it is
   *wrong*, write an ADR saying so and record the divergence in the module's own
   docstring. §5.1's ghost node and §2.5's absorbed `kappa` are both examples,
   and both are written down.
2. **Never modify a frozen artefact.** Make a new version and re-run its gates.
3. **Every number in a figure or table traces to a run id in the ledger.** If it
   does not, it does not ship.
4. **`truth/` must not import `src/`.** The value a gate is checked against
   cannot be produced by the code under test. This is the load-bearing rule; the
   directory layout is the enforcement.
5. **The gate is written as a failing test before the functionality.**
6. **No stochastic run without an explicit seed in the manifest.**
7. **One commit per gate**, naming the measured number:
   `GATE-A8 green: exponential eigenvalues, rel.err 2.3e-6`.

## What running it added

**Count the redesigns.** Three model changes in one session — `kappa` absorbed,
`kappa` made explicit, `kappa` rescaled as a coupling length — each moved the
instrument closer to the answer it wanted. The third is where you stop, record
the falsification, and specify the next operator without building it. That is
what [ADR-0002](decisions/0002-the-place-code-needs-fluid-coupling-not-a-ground-spring.md)
is.

**Check headroom before building the treatment.** ADR-0001 committed to running
its control arm first and was killed by it. The alternative — discovering the
traveling wave was inverted after the stochastic layer had been built on top of
it — is what the rule exists to prevent.

**A check that cannot fail is not a check.** Before adding a gate, ask what
would make it go red. If the answer is "nothing the solver could plausibly do",
the gate is measuring the method, not the result. Say so in the docstring and
find the version that can fail — GATE-A2 is the worked example.

**A gate can be contaminated by its own instrument.** GATE-A12's precision floor
rises as fast as the discretisation error falls. Any gate that fits a trend must
know where its own floor is and must **name** the points it drops. Bounding a
measurement is fine; bounding it silently reads as full coverage.

**Report on every outcome, never only on success.** `gates/conftest.py` writes
the report from a fixture finaliser for exactly this reason: the run somebody
needs to read is the one that failed.

## The seam with ai-os

Gate reports are the interchange format. `ai-flows/src/gates.ts` reads
`gates/reports/*.json` and computes the freeze verdict — TypeScript reading
Python, sharing nothing but JSON. Two consequences for anything written here:

- **Do not change the report shape** (`gate`, `test`, `spec`, `passed`) without
  updating `ai-flows/test/gates.test.ts`, which reads these files for real.
- **Digests are over the file's bytes, never a re-serialisation.** Python and
  JavaScript disagree on float formatting between `1e-5` and `1e-7`, which is
  exactly where gate measurements live.

`ai-ui/test/cochlea-demo.test.ts` compares this project's numbers against an
independent TypeScript eigensolver. If they disagree, one of them is wrong and
the build says so — that disagreement is how the GATE-A12 contamination was
found.

## Running the gate

```bash
.venv/bin/python -m pytest gates/ -q     # 45, all green
python3 verify_ledger.py                 # the chain, in stdlib only
```

Set `OMP_NUM_THREADS=1` for anything attested: a multithreaded BLAS reduction is
not bit-reproducible, and the manifest records the value rather than assuming it.
