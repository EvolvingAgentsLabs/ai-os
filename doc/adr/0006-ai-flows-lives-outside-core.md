# ADR-0006 · `ai-flows` is built against the signed HTTP seam, not inside core

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

[01-architecture](../01-architecture.md) puts `ai-flows` in its divergence table
as *"New service inside core + new store + new API routes"*, cost **High**, and
calls it *"the one that genuinely diverges"*. That line is load-bearing well
beyond this pillar: it is the stated reason the fork exists at all
([ADR-0001](0001-fork-vs-dependency.md)), and it is why `ai-flows` was said to
carry the maintenance burden for the whole project.

The same document states the rule that contradicts it:

> **anything that _can_ be built against a public seam is built against a public
> seam, even when editing core would be quicker. Every line added to
> `ai-base/src/` is a line we merge by hand forever.**

Nobody had checked which of the two applies, because checking requires reading
the route table rather than the architecture. Read at `7f2c916`
(`src/api/routes/turns.ts:154-161`), the public surface is **[read]**:

| Route | Auth | What a flow needs it for |
|---|---|---|
| `POST /v1/turns` | `source` | Run a step. With `async`, returns `{ status: "queued", runId }` |
| `GET /v1/runs/:id` | `source` | Poll that run to a terminal state and read its result |
| `POST /v1/runs/:id/signal` | `source` | `steer` or `abort` a step in flight |
| `GET /v1/runs?threadRef=` | `source` | Find the live run on a thread |

`auth: "source"` is the HMAC-signed ingress that M1 exercised against a running
instance **[ran]** — `v0:{unix-seconds}:{METHOD}\n{path}\n{body}`, five-minute
replay window.

**That is create, advance, inspect, steer and abort — the whole of
[M2](../08-roadmap.md).** No core modification is required to build the first
flow.

## Decision

**`ai-flows` is a first-party Apache-2.0 package at `/ai-flows`. It owns its own
`flow_` tables and its own database handle, and it advances a step by calling the
signed HTTP API. It imports nothing from `ai-base`.**

Consequences that follow directly:

- The `Harness` is reached *through* the API, never constructed. The rule "a
  model call goes through `Harness`, never a vendor SDK" is satisfied by never
  making a model call at all — core makes it.
- Crash recovery inside an attempt is **not** reimplemented and not imported.
  `src/core/turn-resume.ts` runs behind the seam, on the run the flow enqueued;
  the flow observes the run's terminal state and keeps its own `attempts[]`.
  M2's deliverable said "reuse, not rebuild"; the seam makes reuse the only
  option, which is stronger than a rule.
- `tasks` stays untouched by construction rather than by discipline
  ([ADR-0004](0004-flows-and-the-subagent-record.md)): there is no route to it.

## Alternatives rejected

**A service inside `ai-base/src/flows/`** — the plan of record, and what
`AI-OS-PATCHES.md` listed under "planned, not yet made". Rejected on the
project's own design rule now that the seam is known to be sufficient. It would
have made the largest subsystem in the project MIT rather than Apache 2.0
([06](../06-licensing.md)), permanently hand-merged, and would have foreclosed
the [ADR-0001](0001-fork-vs-dependency.md) re-evaluation that the roadmap
schedules at exactly this milestone.

**A plugin under `deploy/layers/evolvingagents/`.** Rejected: that directory is
org deployment material, never upstreamed and never published, and `ai-flows` is
the pillar the repository exists for.

**Importing `ai-base` as a library from `/ai-flows`.** Rejected: it is the
in-core option with extra steps. The import graph, not the directory, is what
creates the merge burden.

## Consequences

**Gain — the highest-risk item in the project stops being high-risk.** The
divergence table's `High` for `ai-flows` becomes `Low`, and total divergence
stays at the two recorded files. This ADR supersedes that row of
[01-architecture](../01-architecture.md); the document is updated to point here
rather than being quietly rewritten.

**Cost — the flow engine is a client, and clients see less.** It gets what the
API returns, not core's internal state. For M2 that is sufficient and checked.
It may not be for `ai-ui`'s live canvas, or for the merge reconciler.

**Risk, and the signal to watch:** *the first time `ai-flows` genuinely needs
something the API does not expose, the right move is to propose that route
upstream, not to import core.* If a proposal is refused and the need is real,
this ADR is revisited. Reaching into `ai-base/src/` without that sequence is the
erosion this ADR exists to prevent — the same shape as ADR-0004's "link but do
not own".

**Also required:** the signed-request client is now first-party ai-os code with
no upstream equivalent to inherit. It is small — HMAC over a canonical string —
and it is the one piece of plumbing this decision buys us.
