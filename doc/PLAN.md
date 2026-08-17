# The plan, as of 2026-08-17

> **Project.** A working state-of-play, written so work can stop and resume
> without re-deriving anything. [08 · Roadmap](08-roadmap.md) is the milestone
> view; this is what is actually in flight and what it costs to pick up.

## Where the workload got to

`projects/coclea-sr` reached the far end of its arc — mathematics, a falsified
model, a repair accepted against a pre-registered condition, bounded results, and
a gated pathology section. The write-up is
[18](18-from-a-hypothesis-to-a-therapeutic-surface.md).

**28 gates / 135 checks, all green [ran].** `ai-base`, `ai-flows` and `ai-ui` run
**618 tests of our own [ran]**.

| | |
|---|---|
| **A01–A14** | the passive string against closed forms |
| **B1–B3** | the place map, the SR result (24/24), the interaction estimator |
| **C01–C04** | the transmission line, its power balance, its noise |
| **H1–H4** | the Hopf layer's two asymptotic regimes and the prescription |
| **D1** | seven lesions, six distinct signatures, one documented collision |
| **D2** | a graded lesion produces a graded audiogram — 26.0 dB at the base to 6.0 at the apex, with both controls |

Experiments: E2, E3, E4, E5, E6, **E7 (null)**, **E8 (§5.1 survives)**,
**E9 (the cost counter lags)**.

## What is open, in the order it should be taken

### 1 · E7 needs a task with headroom — the largest open item

E7 answered nothing because every arm was already correct: forty of forty agent
claims landed within 0.034 of each other against a tolerance of 0.25. The task
was built so that reasoning from docstrings gives the wrong answer and measuring
gives the right one, and the model **measured every time**.

The replacement is a *diagnosis* task rather than a *measurement* task: not
"measure this number" but "this result is wrong, find out why", where running a
sweep is not available as an escape.

**And the control comes first this time.** One flow of the plainest configuration,
checked for failing often enough to leave room, before any arm is bought. That is
the rule in `CLAUDE.md` that E7 broke, and it costs one flow to obey.

### 2 · Cost accounting has to move to generation records

[E9](../projects/coclea-sr/experiments/e9_cost_attribution.py) measured the
instrument: OpenRouter's account counter lags **five to six minutes**, and every
E7 flow ran 221–562 seconds with its cost read the moment it finished. Each delta
was the previous flow's spend wearing this flow's label.

Nothing that depends on a per-flow dollar figure ships until the accounting comes
from `/generation` records, which are attributable by construction rather than by
hoping nothing else is spending. This blocks §7.4's cost axis and nothing else.

### 3 · The hydrops factors are the weakest inputs in §13

`β ×0.6, S ×1.6, M ×1.3` are posited. The *sign* of the tonotopic shift follows
from them; the 11.7% is arithmetic. Any independent constraint turns
[PATHOLOGIES](../projects/coclea-sr/PATHOLOGIES.md) §5.3 from a sign into a
number — and the model already disagrees with the clinic there (it sharpens
tuning where Ménière's broadens it), which is the cheapest place for §13 to be
wrong.

### 4 · Literature, last and deliberately

The LITERATURA pass ran with no web access, against ranges read from our own
specification. Three cheaper things above can kill §13 first. But the moment any
of §13 is quoted outside this repository, that stops being an upgrade and becomes
a precondition —
[`literature/comparison.md`](../projects/coclea-sr/literature/comparison.md) says
so at item 4.

## Standing rules this week re-earned

* **Check headroom before building the treatment.** E7 cost ten flows to relearn
  a rule already written down. Writing a rule down is not applying it.
* **Measure the instrument, not only through it.** E9 exists because a number was
  distrusted rather than explained.
* **A finding belongs in the product, not the demo.** The supersession rule was
  implemented in `ai-ui` and moved into `ai-flows`; a demo with a private
  instrument is a demo measuring itself.
* **Look at the screen.** `attempt undefined · no run` passed build, typecheck and
  every test.

## Under consideration, not started

**An oracle-routed model router** — see
[ADR-0010](adr/0010-oracle-routed-model-selection.md) for the analysis. It is the
first idea in a while whose cheapest version is a strategy module rather than a
service, and this project already owns the rarest thing it needs: gates that
score an answer without asking a model.
