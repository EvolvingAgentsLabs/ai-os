# 14 · Does adding a reviewer help? — and how a full stop invented a finding

<img src="assets/14-review-study.jpg" alt="" width="100%">

<sub>The study this document was written to report. It did not happen.</sub>

> **Status: the study ran and produced nothing, and the first version of this
> document reported a finding that was an artefact of one character. [ran]
> 2026-08-08.** Kept in full, because the artefact is more instructive than the
> finding would have been.

[13-degradation](13-degradation.md) documented the g-AMIE result — physician
oversight improved 6.7% of scenarios, changed nothing in 71.6%, and **reduced
quality in 21.7%**. This document was meant to be that study, reproduced here.

## What the first run appeared to show

A producer answered twelve tasks; a reviewer checked and issued the final answer.
Two reviewer postures. The numbers came back looking like g-AMIE's:

| | correct before | correct after | improved | unchanged | **reduced** |
|---|---:|---:|---:|---:|---:|
| deferential reviewer | 75.0% | 91.7% | 3 | 8 | **1** |
| sceptical reviewer | 58.3% | 91.7% | 4 | 8 | 0 |

`trailing-zeros-100-factorial` went ✓ → ✗ under the deferential reviewer. **A
review step had taken a correct answer and made it wrong** — the exact outcome the
study exists to catch, in our own system, with a rising headline score hiding it.
It was about to go in the README.

## What actually happened

The check for that scenario expects `24`. The producer said `24 trailing zeros.`
and the reviewer said `24.`

`statesNumber` used `(?<![\w.])24(?![\w.])`. The `.` was excluded from both
boundaries to keep `3.24` from matching — and it therefore **rejected every
correct answer that ended a sentence**. `"The answer is 24."` scored as wrong.

The reviewer had been right. So had the producer. **The instrument built to catch
a bad reviewer produced a bad reviewer**, out of a full stop.

## What the study shows once the boundary is fixed

The boundaries are now asymmetric — a `.` before the number disqualifies it only
when a digit precedes the dot, a `.` after only when a digit follows:

| | correct before | correct after | improved | unchanged | reduced |
|---|---:|---:|---:|---:|---:|
| deferential reviewer | **100%** | 100% | 0 | 11 | 0 |
| sceptical reviewer | **100%** | 100% | 0 | 12 | 0 |

`NO HEADROOM FOR REPAIR`. The producer answers all twelve correctly, so a reviewer
can only damage, and neither did. **This suite cannot run the g-AMIE study**, and
the version of it in the first draft of this document was noise.

### Everything measured on this suite before the fix is void

The contamination is not confined to this document:

| claimed | actually |
|---|---|
| baseline 9, 10, 9 across three runs — "±1 scenario of noise" | 12, 12. The variance was periods |
| "headroom exists, the comparison is worth paying for" | there is none |
| `single-step-recall` 10/12 vs `verify-then-answer` 12/12, `COMPARABLE` | both 12/12 |
| a reviewer damaged a correct answer | it did not |

The corrected state of that comparison is recorded in
[13 § The loop](13-degradation.md).

## The part worth keeping

**The headroom guard could not catch this, and could not have.** `evaluation.ts`
refuses to report a comparison when every arm ties at the limit — and it was
satisfied, because the broken check produced 9/12 and 10/12, which look exactly
like a suite with room. **A guard that reads the same numbers the broken check
produced cannot tell that they are broken.**

Four ceiling failures were already recorded here. This is the fifth, and the first
where the ceiling was *hidden* rather than visible — which makes it the expensive
kind. The guard against a tie at the limit does not protect against a check that
manufactures a spread.

So the rule this leaves is narrower and more useful than "watch for ceilings":

> **A check that can fail while the capability works does not only lose signal —
> it manufactures one.** The suite looked like it had 25% headroom. Every point of
> it was punctuation.

And the reason it was caught: the finding was inspected before it was published.
The screenshot taken for the README showed step 0 answering `24 trailing zeros.`
and step 1 answering `24.` — two correct answers, one of them scored as damage.
**The number was wrong and the transcript was right there.**

## What this suite would need to run the study

Scenarios where a competent producer is genuinely wrong some of the time. Twelve
arithmetic questions a model answers correctly in one step are not that, and
making them harder by adding digits mostly makes them slower. The g-AMIE shape
needs a domain where the *first* answer is contestable — which is why their study
is in clinical reasoning and not in arithmetic.

That is the next expensive thing, and it remains scenarios rather than code: the
harness works, and it correctly reported that it had nothing to measure.

## How to run it

```bash
cd ai-os/ai-flows
node --env-file=/path/to/core.env scripts/review-study.ts                    # deferential
node --env-file=/path/to/core.env scripts/review-study.ts --strict-reviewer  # sceptical
```

It says `NO HEADROOM FOR REPAIR` when the producer was right about everything, and
`NO HEADROOM FOR DAMAGE` for the mirror case. Both are worth more than the number
above them.
