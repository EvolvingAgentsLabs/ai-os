# 10 · Observability — can the work be watched at all?

<img src="assets/10-observability.jpg" alt="" width="100%">

<sub>A repeat standing out from noise. Until the noise wins.</sub>


> **Status: the module is implemented and tested. The number it depends on has
> not been measured.** `ai-flows/src/observability.ts` — 20 tests, all passing
> **[ran]**; 36 across `ai-flows`.

## The question this asks that the others do not

Every shape in [03](03-ai-flows.md) has a *Fails when*. `Open`'s is the vaguest
and the most common: *"the goal has not moved across N steps — drift, not
failure."*

That sentence hides two different problems wearing one symptom:

- **Drift.** The flow is legible and it is not moving. More steps might help.
- **Unreadable.** Whether it is moving cannot be told from what it records. More
  steps definitely will not help — the instrument is wrong.

Collapsing them is the same mistake as collapsing `waiting` and `blocked`, one
level down. A system that cannot tell *stuck* from *unmeasured* will answer
"still working on it" forever, and be right in the only sense it can check.

## Why this is a measurement problem, not a design one

To say "it has not moved" you must compare the state after attempt *n* with the
state after attempt *n+1*. Run two attempts of the *same* work from the *same*
starting state and the model will not necessarily produce the same thing twice.
So the comparison has a false-change rate, and every claim built on it inherits
that rate.

Call it **δ**: the probability that identical work yields a different
fingerprint.

The comparison is a binary observation, but not a symmetric one:

```
state unchanged ──(1−δ)──▶ same fingerprint
                ──( δ )──▶ different          ← noise
state changed   ──( 1 )──▶ different
```

Nothing manufactures a *repeat*. Non-determinism manufactures *differences*.
Hence the asymmetry that shapes the whole module:

> **A repeat is proof. A difference is a rumour.**

This is a Z-channel. Its capacity, in bits per comparison:

$$C(\delta) = \log_2\left(1 + (1-\delta)\,\delta^{\frac{\delta}{1-\delta}}\right)$$

$C(0) = 1$: a perfect instrument. $C(1) = 0$: one that reports "different"
whatever happens, and therefore reports nothing. Note $C(0.5) = \log_2 1.25
\approx 0.32$ — a *symmetric* channel would be dead at a coin-flip error rate,
and this one is not. The asymmetry is worth something, and it is the part worth
keeping.

## The curve that decides whether any of this is worth running

A stuck flow has exactly one way to announce itself: repeating its fingerprint.
Noise breaks repeats. So the probability of ever noticing one, over a window of
$w$ attempts, is

$$P(\text{caught}) = (1-\delta)^w$$

| δ | 0.0 | 0.1 | 0.2 | 0.3 | 0.5 | 0.8 | 0.9 |
|---|---|---|---|---|---|---|---|
| $C(\delta)$ bits | 1.000 | 0.763 | 0.618 | 0.504 | 0.322 | 0.114 | 0.055 |
| $(1-\delta)^3$ | 1.000 | 0.729 | 0.512 | 0.343 | 0.125 | **0.008** | 0.001 |

<img src="assets/noise-floor.svg" alt="Capacity and detection probability against the noise floor" width="100%">

<sub>Both curves are computed, not drawn — the values come straight from <code>channelCapacity</code> and <code>detectionProbability</code>.</sub>

At δ = 0.8, roughly eight stuck flows in a thousand are ever seen. A flow can be
dead for a week while the system reports progress, and **waiting longer makes it
worse, because waiting is what the noise destroys.**

That is the argument for measuring δ before building anything on top of it, and
it is the argument this document is here to make.

## What the module does

`observabilityOf(digests, { floor })` takes the fingerprints of successive
attempts and δ, and returns one of four verdicts. It reports; it decides nothing.

| Verdict | Meaning | The right response |
|---|---|---|
| `insufficient` | fewer observations than the window | none — not a finding |
| `drift` | fingerprints repeating | the flow is legible and stopped. Escalate or redirect |
| `progressing` | fingerprints moving, **and** a stuck flow would have been caught | let it run |
| `unreadable` | δ is high enough that a stuck flow would look exactly like this | fix the fingerprint, not the step count |

The order of the checks carries the asymmetry: a repeat is trusted **whatever δ
is**, because noise only ever manufactures difference. Only the *absence* of a
repeat is something a noisy instrument cannot be trusted about.

Every verdict carries δ, the detection probability and the capacity with it, so a
verdict is never read without the number that bounds it.

## The second axis, and why it is not an ADR yet

Observability answers *can it be seen*. It does not answer *can it be moved*, and
those failures want different people.

Controllability is always relative to a **named** input set. Upstream offers
exactly two — `abort` and `steer` (`run-signal-store.ts:3` **[read]**) — plus
whatever a flow engine adds. A controllability claim that does not name its
inputs describes a system that does not exist.

|  | **Controllable** | **Not controllable** |
|---|---|---|
| **Observable** | `autonomous` — it runs | `escalate` — visibly stuck, no available input reaches it. Ask a person for something *specific* |
| **Not observable** | `instrument` — steering blind. Fix the recording | `abandon` — and record which half was missing |

`quadrantOf` computes this. **Nothing consumes it.** It is not wired into
`FLOW_STATES` and there is no ADR proposing that it should be, because the
proposition — that these four cells describe real work — has not been tested. The
function exists so the claim can be measured, not so it can be assumed. Compare
[ADR-0007](adr/0007-observation-captured-not-derived.md), which *is* an ADR
because upstream forced the decision and left no alternative.

## How this gets falsified

**Two measurements, in order. The first can kill the whole document in an
afternoon.**

**1 · Is δ small enough to work with?** Run the same piece of work from the same
starting state, repeatedly, on `pi`. Record fingerprints. Compute δ with
`divergenceRate`.

- **δ near 1 — the fingerprint never repeats.** Then `(1-\delta)^w \approx 0`, no
  stuck flow is ever detected, and every verdict this module can produce is
  `unreadable`. **Delete the module.** The finding is still worth publishing: it
  says agent state is not fingerprintable by the method tried, which constrains
  every drift-detection scheme anyone builds next, including the ones that never
  measured it.
- **δ small.** The module is usable and measurement 2 becomes meaningful.

An open choice inside this experiment: **what the fingerprint is over.** Files
touched is cheapest. Free text will be dominated by phrasing noise, and that is
itself a result. Whichever is used gets recorded in `Observation.source`, so two
flows are never compared across incompatible instruments.

**2 · Does the drift / unreadable split describe anything real?** Across real
`Open` flows, count the stuck ones landing in each verdict.

**If every stuck flow turns out to be `drift`,** the split is a distinction
without a difference — **delete this document rather than defend it**, and keep
`Open`'s original one-line rule.

**Portability:** everything here reads fingerprints off sequential attempts. No
subagents, no parallelism, no harness-specific machinery. It runs on `pi`
([03 § The portability constraint](03-ai-flows.md#the-portability-constraint)).

## What this is not

- **Not a convergence gate.** It never refuses to start a flow and never derives
  a budget. It answers whether a flow can be watched.
- **Not a score.** `Observation.digest` answers *can these be told apart*, which
  is defined for every shape. `Observation.value` answers *by how much*, and is
  `null` everywhere today because no shape declares a metric — `Loop` will, in
  M6, and the same machinery gains resolution without changing shape.
- **Not filtering.** Detrending, passbands and differencing over a numeric
  signal are for when there *is* a numeric signal. Until then δ is the whole of
  the content, and it is the load-bearing part.
