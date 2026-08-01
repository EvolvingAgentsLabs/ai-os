# ai-os

**An agent-based operating system.** Built on top of [QM](https://github.com/yc-software/qm),
and going past it in four directions: how work is *shaped* (`ai-flows`), how the
system is *seen* (`ai-ui`), what the system *remembers* (`ai-storage`), and the
operational base it all runs on (`ai-base`).

This is the primary project of Evolving Agents Lab. Everything else in the
organisation is frozen — see [`doc/07-freeze-policy.md`](doc/07-freeze-policy.md).

> **Status: design.** `ai-base/` is a vendored copy of QM and runs. `ai-flows/`,
> `ai-ui/` and `ai-storage/` are specified in `doc/` and not yet implemented.
> Nothing in this README describes software that exists unless it says so.

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

---

<sub>Evolving Agents Lab · Apache 2.0 · `ai-base/` MIT</sub>
