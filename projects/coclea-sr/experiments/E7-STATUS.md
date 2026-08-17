# E7 (§7.4) — where it stands, 2026-08-16

Stopped mid-run to resume tomorrow. Nothing is uncommitted and nothing is
half-written; this file is what makes picking it up cheap.

## To resume

```bash
cd ~/evolvingagents/ai-os && make up          # needs Docker running
cd projects/coclea-sr
export OPENROUTER_API_KEY=...                 # or read it from ai-memory/.env
.venv/bin/python -u experiments/e7_explorer_verifier_ratio.py --reps 3
.venv/bin/python experiments/e7_analyse.py    # the corrected metrics
```

`~45 min` when healthy, `~$1`. The key had **$7.09 remaining** of a $20 limit.

## The setup, so it does not have to be re-derived

**Question:** what is the observed order of convergence of the
`lumped-full-cell` assembly scheme? Chosen because **the wrong answer is the
plausible one** — the scheme is second order in the interior and first order at
the free end, and every docstring in `assembly.py` says "second order" about the
interior stencil.

**Ground truth, measured before the design:**

    flux               order 2.000
    lumped-full-cell   order 1.016     <- the answer

**Arms:** total agents fixed at six so a difference is the mix, not the size.
`5:1` (5 explorers, 1 verifier), `2:1` (4, 2), `1:1` (3, 3).

**Model:** `qwen/qwen3.8-27b`, wired in `ai-base/.env` as `PI_MODEL`.

## Data so far

| arm | rep | final | correct | cost | secs |
|---|---|---|---|---|---|
| 5:1 | 1 | 1.005 | yes | $0.0944 | 362 |

Plus, from the two earlier aborted runs — same task, same model, **different
runner**, so they are context and not data:

    5:1 rep1  1.007  correct     5:1 rep2  1.002  correct
    5:1 rep3  1.004  correct     1:1 rep1  1.008  correct

## The thing to be honest about when it finishes

**Every 5:1 flow so far has been correct.** The explorers are *measuring* rather
than reasoning from the docstrings, which is what the task was designed to
punish. If that holds across arms the result is **null** — verification bought
nothing here — and that is a legitimate finding about the task's difficulty for
this model, not a reason to look for a kinder reading.

If it does come out null, the honest next move is a harder task rather than a
softer analysis: the level-3 style diagnosis, where the explorer has to find a
defect rather than measure a number.

## Two corrections already made, so they are not re-discovered

**The retraction metric was biased by arm.** "Any explorer-verifier pair
disagrees" has 5 pairs at 5:1 and 9 at 1:1, so it rises with the verifier count
whether or not anything was caught. `e7_analyse.py` recomputes an unbiased
version from the stored per-verifier claims — dissent *per verifier*, and
"flows where the explorers' median was wrong AND the final answer was right",
which is the only quantity that measures what verification is for.

**Cost attribution is not fully verified.** Per-flow cost is the delta of
OpenRouter's account-wide `total_usage`, which is only attributable if nothing
else spends on the account concurrently. Worse: `auth/key`'s `usage` field did
**not** move at all across ~$0.5 of flows, so the two endpoints measure different
things and neither has been cross-checked. Resolve this before any cost number is
published.

## What this experiment already produced, independent of its own result

A real defect in `ai-flows`, found only because the workload was live: an attempt
sat `running` for **3,316 seconds** while the flow reported `waiting` — the same
state a working flow reports. Fixed with `staleAttemptMs` (commit `80bc3ab`),
three tests, 406/406.

Infrastructure failures are frequent enough under this load to matter: the runner
now detects and retries them rather than spinning to its deadline, and excludes
them from the accuracy denominator. **How often they happen is worth reporting on
its own** — it is a measurement of the harness, which is what §7.4 is about.
