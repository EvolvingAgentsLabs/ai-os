<img src="doc/assets/icon.png" alt="" width="76" align="left" hspace="14">

# ai-os

<img src="doc/assets/hero.jpg" alt="" width="100%">

**An agent-based operating system.** Built on top of [QM](https://github.com/yc-software/qm),
and going past it in four directions: how work is *shaped* (`ai-flows`), how the
system is *seen* (`ai-ui`), what the system *remembers* (`ai-storage`), and the
operational base it all runs on (`ai-base`).

This is the primary project of Evolving Agents Lab. Everything else in the
organisation is frozen — see [`doc/07-freeze-policy.md`](doc/07-freeze-policy.md).

**[Español](README.es.md)** · English is the canonical version of every document
here; see [Languages](#languages).

> **Status: design, with two measured pieces.** `ai-base/` is a vendored copy of
> QM and runs. `ai-flows/` is specified in `doc/` and mostly unbuilt — what exists
> and runs is its flow store, its observability instrument
> ([10](doc/10-observability.md)) and its conformation projector
> ([12](doc/12-conformation.md)), 137 tests. The flow *engine* — a step executing
> as a run — is not built. `ai-ui/` and `ai-storage/` are specified and not
> implemented at all. Nothing in this README describes software that exists unless
> it says so.

## The problem: AI is still single-player

<table>
<tr><td>

> **The best work tools became more powerful when they became multiplayer. But AI
> is still mostly trapped in private chats, with agents working in sessions that
> teammates can’t join or influence.**
>
> **The next generation of AI tools will let teams work with agents together in
> real time: watching, redirecting, and handing off work across engineering,
> sales, support, legal, finance, and more. AI’s multiplayer moment is coming.**

<sub>— **Y Combinator**, [@ycombinator](https://x.com/ycombinator/status/2079963728439832823)
· [video](https://x.com/ycombinator/status/2079963728439832823/video/1)</sub>

</td></tr>
</table>

That is the problem ai-os exists to solve, and it names the gap more legibly than
our own framing did.

**Why a session cannot be multiplayer.** You cannot hand off a conversation. A
handoff needs a *thing* — something with a declared goal, a current state and a
history, that another person can open, read, redirect and take over. A session is
none of those: it is an append-only transcript, private to its participants,
summarised away by compaction, and forked without recording that it forked. The
unit is wrong, so everything above it is single-player by construction.

Each pillar is one half of that answer:

| | The multiplayer problem it answers |
|---|---|
| [`ai-flows`](ai-flows/) | **The thing you hand off.** A flow is a persisted object with a goal, a state and a lineage — addressable by anyone with the scope, not owned by one conversation |
| [`ai-ui`](ai-ui/) | **Watching and redirecting.** A canvas projects the *state* of the work, which a third party can read. A transcript is only legible to the people who were in it |
| [`ai-storage`](ai-storage/) | **What the team knows.** Project- and system-level memory, so context is not stranded in one person's private chat |
| [`ai-base`](ai-base/) | **Who is allowed.** QM's scopes, permissions and audit — already multiplayer, and the reason we did not start here |

### One precision, stated up front

The tweet says **"in real time"**. ai-os is making a narrower and, we think,
more defensible claim: **asynchronous multiplayer** — a durable object several
people act on across days, hand off, fork and rejoin. Not several cursors on one
canvas at once; [`ai-ui`'s v1 explicitly excludes simultaneous editing](doc/04-ai-ui.md#scope-of-v1).

Real-time co-presence is a legitimate goal and not the one we are building
toward first. Handing off work that is still running, without losing what it
learned, is the harder half and the part nobody has.

## Before the interface: can a flow even be watched?

Multiplayer means a second person opens running work and asks *is this fine?*
That is an instrument question before it is an interface question — and every
instrument has noise.

A flow records a fingerprint of the state each attempt produced. Comparing two of
them looks binary. The channel is not symmetric:

```
state unchanged ──(1−δ)──▶ same fingerprint
                ──( δ )──▶ different          ← noise, not progress
state changed   ──( 1 )──▶ different
```

Only a real change can *break* a repeat, but non-determinism can invent a
difference out of nothing. So:

> **A repeat is proof. A difference is a rumour.**

**δ** is the rate at which *identical* work produces *different* fingerprints. It
is not a constant of nature — it moves with the model, the harness, and what the
fingerprint is taken over — so it has to be measured, not assumed. Two curves say
why measuring it comes first.

**What one comparison can carry.** This is a Z-channel, and its capacity is

$$C(\delta) = \log_2\left(1 + (1-\delta)\,\delta^{\frac{\delta}{1-\delta}}\right)$$

<img src="doc/assets/noise-floor.svg" alt="Capacity and detection probability against the noise floor" width="100%">

<sub>Computed, not drawn — straight from <code>channelCapacity</code> and <code>detectionProbability</code>. The right-hand curve is $(1-\delta)^w$: a stuck flow announces itself <b>only</b> by repeating, and noise breaks the repeat.</sub>

| δ | 0.0 | 0.2 | 0.5 | 0.8 |
|---|---|---|---|---|
| bits per comparison | 1.000 | 0.618 | 0.322 | 0.114 |
| stuck flows ever noticed | 100% | 51% | 13% | **0.8%** |

At δ = 0.8 a flow can sit dead for a week while the system reports progress.
Waiting longer does not help; waiting is precisely what the noise is destroying.

**So the gate goes on the instrument, not on the flow.** Before drift detection,
budgets or any convergence rule mean anything, δ has to be a number.
[`observabilityOf`](ai-flows/src/observability.ts) refuses to call a flow
*progressing* when δ says a stuck one would have gone unseen; it answers
`unreadable`, which is a claim about the recording rather than about the work.

That is the distinction flows actually need. **Drift** — visible and not moving —
wants more steps. **Unreadable** — moving as far as anyone can tell — wants a
better instrument, and no number of steps substitutes for one.

> **Status: measured.** 22 turns on `pi` / `deepseek-v4-flash`, repeating identical
> work. **δ = 21.1% over raw reply text, 0% once normalized** — and every divergence
> was presentation, in the worst group literally backticks. Zero observed is not
> zero: the 95% upper bound is 14.6%, so a stuck flow is still caught at least 62%
> of the time. **The measurement changed the code** — `digestOf` normalizes now,
> because it did not before. Full result, and the three things it does *not*
> establish, in [doc/10-observability.md](doc/10-observability.md).

## Why this exists

QM solves the part most agent projects get wrong: a real multi-tenant harness
with scoped identity, permissions, sandboxes, audit and a swappable model layer.
72,000 lines of it, in production shape. Rebuilding that would be a year of work
to arrive where someone already is.

What QM does not have is a **layer of the system above the turn.** It runs turns —
one input, one reply, with crons and triggers to start them. It has no notion of a
durable, resumable, inspectable *unit of work* that spans many turns, many agents,
and many days. It has no memory model beyond a capped markdown file per scope. Its
interface is a chat window with panels.

An operating system needs those three things. That is what ai-os adds.

## Layout

| Directory | What it is | License |
|---|---|---|
| [`doc/`](doc/) | The design, in detail. **Read this first — it is ahead of the code by construction.** | Apache 2.0 |
| [`ai-base/`](ai-base/) | Vendored QM. The operational base: harness, scopes, sandbox, identity, policy, audit. | **MIT** (upstream) |
| [`ai-flows/`](ai-flows/) | Flows: declarative, resumable, multi-turn units of work. | Apache 2.0 |
| [`ai-ui/`](ai-ui/) | The OS-level interface — an intelligent canvas, not a chat log. | Apache 2.0 |
| [`ai-storage/`](ai-storage/) | Memory at four levels: system, user, project, flow. | Apache 2.0 |

## Licensing in one paragraph

The repository is **Apache 2.0**. `ai-base/` stays **MIT**, because it is derived
from QM and because keeping it MIT is what lets us send patches back upstream
without a license mismatch. MIT explicitly grants `sublicense`, so this
combination is sound; the original copyright notice is preserved verbatim at
[`ai-base/LICENSE`](ai-base/LICENSE) and attributed in [`NOTICE`](NOTICE). The
full analysis, including what we may *not* do, is in
[`doc/06-licensing.md`](doc/06-licensing.md).

## Relationship to QM

We work from a copy, on purpose — see [ADR-0001](doc/adr/0001-fork-vs-dependency.md).
That buys full control over the evolution and costs us the merge burden forever.
The vendoring is a `git subtree` against `yc-software/qm@main`, so upstream stays
pullable rather than being a one-way snapshot.

We are not competing with QM and we do not pretend to be affiliated with it.
Where a change belongs upstream, it goes upstream, as human-written text in their
`adrs/` format — that is what their `CONTRIBUTING.md` asks for.

## Languages

**English is canonical.** Every document has a Spanish counterpart, and where the
two disagree the English one is correct — a translation that has drifted is worse
than no translation, so the rule is written down rather than assumed.

| | English | Español |
|---|---|---|
| This file | `README.md` | [`README.es.md`](README.es.md) |
| Design documents | [`doc/`](doc/) | [`doc/es/`](doc/es/) |

A change to a design document is not finished until its Spanish counterpart moves
with it, in the same pull request. Splitting them across two PRs is how the copy
that nobody reviews starts lying.

---

<sub>Evolving Agents Lab · Apache 2.0 · `ai-base/` MIT</sub>
