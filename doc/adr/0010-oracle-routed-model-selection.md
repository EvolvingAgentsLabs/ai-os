# ADR-0010 · Oracle-routed model selection is a non-stationary bandit, and its first move is a control arm

- **Date:** 2026-08-17
- **Status:** Proposed — **nothing built**, and phase 0 is allowed to kill it

## Context

Ismael's suggestion, as put: given a problem, evaluate it with more than one LLM;
a powerful model **or a mathematical or physical oracle** decides which prediction
is best, and therefore which model best solves that problem; route to that model
from then on; keep monitoring so that when it stops being the most efficient — a
scheduled re-validation, an oracle verdict, or a domain that drifted — the expert
is re-chosen. Wrap it in [LiteLLM](https://www.litellm.ai/) so local and frontier
models mix behind one API, and add continuous finetuning and evaluation so new
experts are produced and switched to.

The references given are Raschka's multi-token-prediction gallery entry and
[arXiv 2404.19737](https://arxiv.org/abs/2404.19737) (Gloeckle et al.).

## What is right about it, and it is the rare part

**The oracle.** Published routers — RouteLLM and its descendants — train on
preference data or score with an LLM judge, so the router inherits the judge's
failure modes. Scoring with a *mathematical or physical* oracle is a different
kind of thing: it does not share a failure mode with the thing it scores, which
is the same property `truth/` not importing `src/` buys in `coclea-sr`.

**And this organisation already owns one.** 28 gates score an answer to within
`1e-6` of a closed form without asking a model anything. Almost nobody proposing
a router has a free, exact reward signal; we have 135 of them.

## What the proposal is missing, in the order it matters

### 1 · The unit of routing is a *class* of problem, and the class is the hard part

"This model is best at this problem" is not actionable: by the time it is known,
the problem is solved. The saving lands on the *next* problem, and only if the
next problem can be recognised as the same kind.

So the difficulty is not the router. It is the **equivalence relation on
problems**, and the proposal does not contain one. Anything built before that is
built on the assumption that it will be easy.

The cheap first version is not embeddings: it is the identifiers a workload
already has — gate id, task family, tool signature. If routing does not pay with
a hand-labelled equivalence relation, it will not pay with a learned one.

### 2 · The economics may be inverted, and this is computable before building

Learning which model is best costs N model calls plus an oracle call. That is
*more* than always using the best model. It pays only if the decision generalises
over many later problems and the cheap model wins often enough. With frontier cost
`C_f`, near-zero local cost, oracle cost `C_o` and probing every `k`-th problem:

    routing pays  iff  (fraction routed cheap) x C_f  >  C_o / k

That inequality can be filled in this week from prices we already pay. It should
be, before anything is written.

### 3 · Our own two most recent results are evidence against the naive version

* **E7:** `qwen3.8-27b` answered a convergence-order question correctly in 10 of
  10 flows, with all 40 agent claims inside a 0.034 band against a 0.25
  tolerance. A router would have chosen the cheap model and been right — and so
  would a coin.
* **physics-verifiers:** a frontier judge caught 12 of 12 fabrications and 9 of 9
  subtle numerical defects.

So on the tasks this organisation actually runs, the cheap model is already good
enough and the frontier model is already a reliable judge. **A router needs a
regime where models genuinely differ, and we have not yet found one in our own
workload.** Finding one is the first experiment, not a detail.

### 4 · "Scheduled re-validation" is the wrong mechanism for drift

A schedule is a parameter nobody can set correctly and a subsystem to maintain.
The same behaviour falls out of the estimator for free: make the posterior
**non-stationary** — discounted or sliding-window Thompson sampling — and an
expert that stops winning decays out of the routing on its own, at a rate set by
one number.

That reframing is the main technical contribution this ADR makes to the idea:

> It is not a router with a monitor bolted on. It is a **contextual bandit with a
> free reward signal and a discount factor**, and "who is the expert now" is what
> a bandit computes.

### 5 · The oracle should itself be routed

The proposal routes *answering* and pays full price for *scoring*. Scoring is the
part with a real hierarchy:

1. **a gate** — free, exact, narrow;
2. **cross-model agreement** — cheap, no ground truth, and it already told us
   something (E7's only "retraction" was a verifier that said WRONG and then
   agreed numerically, so agreement must be measured on the *number*, not the
   prose);
3. **a frontier judge** — expensive, broad, and measured to be good.

Escalate only when the cheaper tier is inconclusive. This is probably where most
of the saving is, and it is not in the proposal.

### 6 · Continual finetuning is a different product

It is the most expensive part — data, eval, hosting, versioning — and it is
downstream of everything above being worth doing. It belongs after phase 3, and
the idea should not be sold on it.

## The framing worth sending back

**This is speculative decoding, lifted from tokens to tasks.** A cheap draft
proposes, an expensive verifier accepts or rejects, and the **acceptance rate is
the entire economics**. That is also the honest reading of the MTP references:
multi-token prediction is a *training objective* that makes the draft head free,
not a routing architecture — the connection is the draft-and-verify pattern
underneath, and taking it seriously hands us the speculative-decoding literature's
break-even algebra for nothing.

## Decision

**Phased, and phase 0 is a control arm that is allowed to end it.**

**Phase 0 — is there any headroom? (~an afternoon, ~$5, no new code beyond a
script.)** Run three models — local, mid-cloud, frontier — over tasks derived from
the existing gate suite, scored by the gates. Ask only: *does the best model
differ by task class?*

> **Falsification, registered before running:** if the same model is best on 90%
> or more of task classes, routing cannot beat "always use the best" by more than
> 10%, and we stop.

This is the arm E7 did not buy first, and the rule it broke is in `CLAUDE.md`.

**Phase 1 — the policy as a pure function.** `route(signature) -> model` and
`observe(signature, model, score, cost)`, with a discounted Beta posterior per
(signature, model). No service, no proxy, no daemon; a strategy module, testable
without a network. This is the workspace's stated preference and it is also what
makes phase 0's data replayable against later policies.

**Phase 2 — the scoring hierarchy** of §5, which is where the saving is.

**Phase 3 — the LiteLLM adapter**, thin. LiteLLM is right for *distribution* and
wrong for the intelligence: if the policy can only run behind a proxy, every
experiment needs a proxy, and the policy stops being testable.

**Phase 4 — continual finetuning**, only if 0–3 paid.

## Consequences

* Nothing is built until phase 0 reports, and phase 0 can report "stop".
* If phase 0 finds headroom it also produces the first artefact anyone else
  proposing a router lacks: a benchmark whose reward is a closed form rather than
  a judge.
* If it does not, the finding is publishable on its own and cost an afternoon —
  *on our workload, model choice did not matter*, which is a more useful thing to
  know than most positive results about routers.

## Alternatives rejected

**Build the LiteLLM product first and measure later.** Rejected: it is the
expensive kind of progress, and this organisation has a documented case (18,680
lines, three test functions) of exactly that.

**Use an LLM judge as the router's oracle from the start.** Rejected for phase 0
only. `physics-verifiers` measured frontier judges to be good, so this is not a
capability objection — it is that a judge costs money per decision and a gate
costs nothing, and phase 0's question can be answered entirely with gates.
