# coclea-sr as a physics-gated RL environment

An export of this research project as tasks with **verifiers that are theorems**:
closed-form eigenvalues, Sturm-Liouville orthogonality, a Lyapunov solution.
Built against the real `verifiers.v1` interface (`vf.Task`, `@vf.reward`,
`runtime.run_uv_script`), read from `PrimeIntellect-ai/verifiers` on 2026-08-16.

| task | gate | tolerance |
|---|---|---|
| `uniform` | A1 | 1e-4 |
| `orthogonality` | A2, A3 | 1e-8 |
| `exponential` | A8 | 1e-5 |
| `stationary_variance` | A9 | 1e-6 |

## Why it resists reward hacking

Two processes that never coexist with each other's inputs:

* `run_candidate.py` — numpy and scipy, runs in a directory holding the candidate
  and nothing else, and **knows no truth**;
* `score.py` — mpmath and sympy, handed `results.json`, **never sees the source**.

Measured, not asserted:

```
reference   uniform 1.0   exponential 1.0   orthogonality 1.0   stationary_variance 1.0
cheater     0.0           0.0               0.0                 0.0
```

`fixtures/cheater.py` tries three routes — import the project's truth module,
re-derive with mpmath, read an expected-answer file out of the working
directory. All three return nothing.

## Three defects this found, two of them in itself

1. **The scorer re-derived the truth and got it wrong.** It solved
   `tan(bL) = -2b/a`, which has a pole inside every bracket. The *correct*
   reference solution scored 0.0. Fixed by bundling the project's gated `truth/`
   byte-identically, with a drift test.
2. **A prompt that never stated its convention.** The reference scored 0.0 with
   relative error exactly 1.0 — the factor of two between `<xi xi> = 2D delta`
   and `= D delta`. An environment that rewards guessing the author's convention
   measures telepathy.
3. **The reference's free end was first order.** It gave the apex node a full
   cell of mass instead of half — the project's own documented `lumped-full-cell`
   defect. It scored 0.89 on `exponential`, and Richardson made it *worse*, which
   is the giveaway. Fixing the half cell took the error from 2.5e-5 to **5.4e-9**.

```bash
python -m pytest tests/ -q     # 13 checks
```
