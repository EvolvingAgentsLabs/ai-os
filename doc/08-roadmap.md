# 08 · Roadmap

<img src="assets/08-roadmap.jpg" alt="" width="100%">

<sub>Two milestones solid, the rest still outlines.</sub>

Milestones in dependency order. Each states what "done" means and what would
show it was not worth doing. No dates — this organisation's estimates have not
been informative.

## M0 · Foundation — **done** (2026-08-01)

Repository, licensing, and QM vendored as a subtree with lineage.

- Apache 2.0 + `NOTICE`, MIT preserved verbatim at `ai-base/LICENSE`
- `ai-base` = `yc-software/qm@7f2c916`, added via `git subtree` so upstream stays pullable
- Architecture verified against the source, not the README: three usable seams
  (`MemoryService`, plugin chassis, `Harness`) and five confirmed gaps

**Done means:** the licensing question is settled in writing
([06](06-licensing.md)) and every claim about QM cites a file.

## M1 · ai-base runs locally — **done** (2026-08-01)

Running took under an hour. No Postgres (in-memory stores), no build step, and
the suite was already green: **3,712 tests, 3,580 pass, 0 fail**, plus a clean
`tsc --noEmit`.

> **"No Postgres" was a fact about M1, not a standing property.** It is carried
> here because it is what happened, but it stops being true at M2 — see
> [Phase 0](#phase-0--durable-by-default--new-and-it-is-not-optional). In-memory
> stores are per-process, so a second process cannot see the first one's state and
> nothing survives a restart, which is most of what M2 promises.

Real turns completed against `deepseek/deepseek-v4-flash` through OpenRouter on
`HARNESS=pi` — a smoke reply, a memory write observed on disk, and a tool call
that failed honestly because the sandbox image was not built.

**It paid for itself immediately.** Seven material errors in `doc/` were found
and corrected — two of them had already hardened into
[ADR-0002](adr/0002-flow-as-first-class-object.md), now superseded by
[ADR-0004](adr/0004-flows-and-the-subagent-record.md). The one worth naming:
**subagent delegation and OpenRouter models live on disjoint sets of harnesses**,
so cheap-model and multi-agent cannot be had together. No amount of reading
surfaced that; configuring it did.

**That finding expired on 2026-08-06** — upstream gave `pi` delegation through
workspace-defined markdown agents while it kept OpenRouter, and the disjointness
is gone (corrected matrix in
[01-architecture](01-architecture.md#the-harness-capability-matrix)). Worth
leaving here rather than deleting, because it sharpens the M1 lesson instead of
softening it: a **[ran]** claim about a weekly-pulled dependency is a measurement
with a shelf life, and this one was cited in four documents by the time it went
stale. The rule that follows is in
[12-conformation](12-conformation.md#what-this-cost-to-find): a claim about
upstream capability names the file and line that would have to change for it to
stop being true.

**The standing rule that comes out of M1:** claims in `doc/` are marked **[read]**
or **[ran]**. Reading is how the previous flagship reached 18,680 lines with three
test functions.

### Prerequisites — all met (2026-08-01)

- **Docker + sandbox image** — built (`qm-sandbox-local:latest`, 1.31 GB).
  `execute` runs real commands, and `/workspace` persists across sessions in the
  same scope. Both verified.
- **A signed-request client.** HMAC-SHA256 over
  `v0:{unix-seconds}:{METHOD}\n{path}\n{body}`, five-minute replay window.

**One cost to plan around:** the sandbox image is `linux/amd64`, so on Apple
Silicon every tool call is emulated — ~47 s cold, ~25 s warm, against ~4 s for a
turn without tools. M2's iteration loop is therefore minutes per cycle. Either
budget for that or build an arm64 image first; do not discover it mid-milestone.

## The path to a version worth iterating on — **added 2026-08-06**

The milestones below are in dependency order but they are not a plan, because
they do not say which of them are *blocked* and by what. Five things are missing
from a running system: the flow engine, the canvas, scoped memory, depth-2
delegation, and agent principals. **They are not five comparable work items**, and
treating them as a list to burn down is the mistake this section exists to
prevent.

Sorted by what is actually in the way:

| Missing | Status | What is in the way |
|---|---|---|
| Durable stores | **prerequisite, undeclared until now** | nothing — it is configuration |
| Flow engine (M2) | **unblocked** | the signed HTTP client, which nobody has written |
| The canvas (M5) | **blocked on M2** | there is no flow state to render |
| Scoped memory (M4) | **gate passed 2026-08-06** | nothing — baseline 3.0 on a long-horizon fixture, so the axis has room. Building it is a milestone |
| Depth-2 delegation | **deferred, and un-instrumentable** | delegation leaves no trace on `pi` — no `tasks` rows, no tool-call entries — so the planned instrument cannot be built |
| Agent principals | **deferred, condition sharpened** | the 2026-08-07 refusal was a service account, not an agent needing rights — [ADR-0009](adr/0009-a-flow-records-who-it-acts-for.md) |

Only the first two are work. The third follows from the second. The last three
are decisions already made, and reopening them is a separate argument from
scheduling them.

> **Where this stands, same day.** Phase 0 done (148 `test:pg` green, and the
> cross-process claim verified rather than assumed). Phase 1 done — the signed
> client and the engine exist, M2 passes 6/6 on `pi` and on `mock`, and its
> deliverables are ticked off in [M2](#m2--the-first-flow--built-and-proven-live-2026-08-06).
> Phase 2 built and **not falsified**: the page renders, the stopwatch test needs
> a person and three days. Phase 3: the M4 gate has one half run and one half
> pending; depth-2 instrumentation is unbuilt; agent principals correctly
> untouched. **Updated 2026-08-07: all three of Phase 3's gates have now been run
> — M4's opened, depth-2's instrument turned out to be un-constructible, and the
> agent-principal signal was misread and is corrected in
> [ADR-0009](adr/0009-a-flow-records-who-it-acts-for.md).**

### What "a version worth iterating on" has to mean

Not feature-completeness. The smallest system whose *loop closes*: **work that
survives interruption, and a way to see it.** An agent OS that cannot be left and
returned to is a chat app, and one whose state cannot be seen cannot be steered.
That is Phase 0 plus Phase 1 plus Phase 2 below. Everything after is improvement
to a thing that must first exist.

### Phase 0 · Durable by default — **new, and it is not optional**

M1 recorded "Postgres optional (in-memory stores work)". That was true of M1 and
is false of everything after it, and running the system on 2026-08-06 is what
showed it **[ran]**:

- A project created in the web UI was **invisible to the conformation projector**
  running as a second process against the same `dataDir`. With `store=memory` the
  `ProjectStore` lives inside the core's process; another process sees workspace
  files and none of the state ([manual § Part 4](manual.md#part-4--what-the-holes-told-us-running-it-live)).
- `SessionStore.distinctScopes()` returned 0 for the same reason, so the scope
  list had to be recovered by decoding directory names.
- A flow that resumes on Wednesday cannot resume out of a process that exited on
  Monday. **M2's own definition of done is unreachable on in-memory stores.**

So: `DATABASE_URL` set, `npm run test:pg` green, and the in-memory stores demoted
to what they are — a unit-test fixture. Small, and it is the floor everything else
stands on.

### Phase 1 · The flow engine (M2)

Unchanged in substance from M2 below. Two things the milestone does not say, and
both are the actual first tasks:

1. **The signed HTTP client does not exist.** [ADR-0006](adr/0006-ai-flows-lives-outside-core.md)
   decided `ai-flows` advances a step by calling the signed API rather than
   importing core — HMAC-SHA256 over `v0:{unix}:{METHOD}\n{path}\n{body}`, five
   minute replay window. That client is first-party ai-os code and **nobody has
   written it**. It is perhaps a day, it is on the critical path, and every later
   phase runs through it.
2. **The first slice is one flow, one step, `Open`.** Create a flow, advance it by
   `POST /v1/turns?async=1`, poll `GET /v1/runs/:id` to terminal, record the
   attempt and its observation. Anything beyond that — shapes, fork, diff — is M3
   and M6 and does not belong in the slice that proves the seam.

**Falsified by:** the step cannot be made to execute through the public API and
needs core modification after all. That kills ADR-0006, not the flow, and it is
better to find out in the first slice than in the seventh deliverable.

### Phase 2 · Seeing it — and the cheap version comes first

M5 is a canvas: Lit, `dockview-core`, spatial layout, a fifth plugin. That is a
quarter of infrastructure to answer a question that can be answered in an
afternoon, and this workspace has a standing rule against paying the second price
before the first.

**Build the read-only view first.** The conformation projector already emits a
document with scopes, agents, rosters, the communication graph and its holes. Add
flow state to it and render it — one page, no layout persistence, no drag, no
generated components. Then run **M5's own falsification, unchanged**: the
stopwatch test, a three-day-old flow, canvas against transcript.

If the flat read-only view already lets a person pick a flow up after three days,
**the canvas is not the next thing to build** and M5 should be reargued rather
than scheduled. If it does not, the stopwatch says exactly what was missing, and
that is a better specification for a canvas than [04](04-ai-ui.md) is.

### Phase 3 · The three gates — **all three run, 2026-08-06/07**

The phase was never "build these three". It was **run their gates**, so the
decisions would be made on evidence. All three gates have now been run, and none
of them produced code. Two produced decisions and one produced a dead end.

**Scoped memory (M4) — the gate opened.** Extend the bench until the flat-file
baseline drops to at most 7 on `staleness`, or M4 does not proceed. It scored
**10.0** on a fixture revising one fact six times in thirteen turns, and **3.0**
on one revising a policy once across forty-three — density does not break the flat
file, horizon does. The condition is met with room to spare, **M4 proceeds**, and
the number it has to beat is 3.0. Details and the two caveats are in
[§ M4](#m4--ai-storage-v1--not-started). Building M4 is a milestone, not this
phase.

**Depth-2 delegation — the plan's instrument cannot be built.** This phase said
the cheap move was not to build depth-2 but to *instrument for it*: record whether
a delegated child's task contained separable sub-work, and if that never fires,
the cap costs nothing. **That instrument is not constructible on this base
[ran]:** `pi` writes no `tasks` rows, and session entries carry only
`user` / `system` / `thinking` / `assistant` — there is no tool-call record
anywhere, so a delegation leaves no trace at all. Nothing can observe what a child
was asked to do.

So the item is not pending; it is **inexecutable as written**. Depth-2 stays
deferred under [ADR-0008](adr/0008-conformation-is-projected.md), and reopening it
now requires either a different signal (a CLI-backed harness does write `tasks`
rows) or an upstream change. Recording this rather than leaving the item open is
the point: a plan step that cannot be performed should say so, not sit unticked
implying somebody just has not got to it.

**Agent principals — the condition did not fire, and something cheaper did.**
Running a composed flow in a project scope was refused: *"you're not a member of
that context"*. That was first recorded as ADR-0008's condition firing — *an agent
that must appear in a roster* — and **that reading was wrong**.

What was refused was a service account. The fix a service account suggests, put it
on the roster, is not what the situation calls for: somebody created that flow,
that person is already on the roster, and they are who the audit log should name.
The system did not lack an agent identity. **It lacked provenance it already had
and threw away** — `Flow` records `scopeId` and nothing about who it is for.

[ADR-0009](adr/0009-a-flow-records-who-it-acts-for.md) decides the cheap correct
thing: a flow records the principal it acts for, a step runs as that principal,
`FLOWS_ACTOR` is deleted, and **no new `PrincipalType` is added**. It also
sharpens ADR-0008's condition so it cannot be misread the same way twice — an
agent principal needs a right *no human requester has*, and a refused service
account is not that.

**Decided, not yet built.** The schema change and the two routes are not
implemented.

### What this plan deliberately does not contain

Beyond [§ Deliberately not planned](#deliberately-not-planned): **no attempt to do
Phases 1 and 2 in parallel.** The view renders flow state; building it against a
flow engine that does not exist yet means designing for imagined state, and the
one thing this repository has repeatedly proven is that imagined state is where
the instrument starts flattering its author.

## M2 · The first flow — **built and proven live (2026-08-06)**

The smallest honest `ai-flows`: **one shape (`Open`), persisted, resumable.**

**Status per deliverable, all [ran] on 2026-08-06** against Postgres, the real
core, and both `pi` and `mock`:

| # | Deliverable | |
|---|---|---|
| 1 | `flow_` tables | ✅ pre-existing |
| 2 | Step executes as a run, `turn-resume` reused | ✅ *by construction* — see below |
| 3 | Survives restart **and compaction** | ✅ 6/6 and 6/6 |
| 4 | `forkedFrom` recorded | ✅ exercised through the API |
| 5 | API routes create / advance / inspect | ✅ `ai-flows/src/server.ts` |
| 6 | Completes with no subagents, no `tasks` rows | ✅ 6/6 on `mock` |
| 7 | An observation per attempt | ✅ every attempt |

**Deliverable 2 is met by a different mechanism than its wording implies, and the
wording was unsatisfiable.** It asks `ai-flows` to reuse `src/core/turn-resume.ts`
— a module [ADR-0006](adr/0006-ai-flows-lives-outside-core.md) forbids it from
importing. The resolution is that it does not have to: a step's attempt **is** a
core run, `turn-resume` is imported by `core/orchestrator.ts:111` on that path,
and the crash recovery inside a turn is therefore inherited rather than
re-implemented. A deliverable that could only be met by breaking an ADR was a
deliverable written before the ADR existed.

**What "resumable" turned out to require**, and it is one ordering decision:
`startAttempt` takes the `runId` at open and cannot be given one later, so the
turn is queued **first** and the attempt records the id it got. The alternative —
open the attempt, then launch — produces an attempt saying `running` with
`runId: null`, which a process restarting on Wednesday cannot interpret. The cost
is a crash window that orphans a run and does the step twice; a bounded duplicate
is recoverable and an ambiguous attempt is not.

1. `flow_` tables; a flow record with goal, state, steps
2. A step's attempt executes as an existing run (`ai-base/src/runs/`), reusing
   `src/core/turn-resume.ts` for crash recovery inside an attempt
3. A flow survives process restart and context compaction
4. `forkedFrom { flowId, atStep }` recorded from the first commit — the gap in
   upstream sessions is not reproduced here
5. API routes for create / advance / inspect
6. **Completes with no subagents and no task rows**
   ([ADR-0004](adr/0004-flows-and-the-subagent-record.md)) — the harness that
   enforces this is now `mock`, not `pi`; `pi` gained delegation on 2026-08-06.
   The deliverable is unchanged: a flow that needs children to finish is a flow
   that does not finish everywhere
7. **An observation per attempt, captured when it closes**
   ([ADR-0007](adr/0007-observation-captured-not-derived.md)) — not an addition
   to M2 but the instrument M2's own falsification already requires. Without it
   the comparison in §How this gets falsified is an anecdote, and upstream's
   telemetry is deleted an hour after the attempt that produced it

**One number M2 owed, now paid.** δ — the rate at which identical work produces
different state — is **0% over normalized text and 21.1% over raw**, measured on
`pi` / `deepseek-v4-flash` across 22 turns **[ran]**
([10 § What was measured](10-observability.md)). Every "the flow kept its work and
the session lost it" claim is a claim that two states differ, and that claim is
only as good as the instrument making it. The afternoon it cost did not invalidate
the drift machinery — it corrected it: `digestOf` normalizes now, because raw bytes
were carrying 21% noise for no gain.

Not in M2: shapes beyond `Open`, merge, canvas, new memory.

**Done means:** a flow started on Monday is resumed on Wednesday, after a
restart, with its state intact — **on both `pi` and one CLI-backed harness.**
Testing on one alone would tune the design to whichever happened to be
configured that week.

**Met, with one substitution stated rather than hidden.** `scripts/flow-smoke.ts`
passes 6/6 on `pi` and 6/6 on `mock`. `mock` is not CLI-backed — it is the harness
with neither delegation nor `tasks`, which is what deliverable 6 is about. The
second-harness requirement was written to stop the design being tuned to one
configuration, and running it against a harness whose reply is a bare echo did
catch exactly that: a content check that passed on the echo while testing nothing.
A CLI-backed harness remains unrun.

**Falsified by:** a plain QM session doing the same. See
[03](03-ai-flows.md#how-this-gets-falsified). This is the pillar that forces the
fork, so it carries the highest burden of proof.

## M3 · Flow diff — **not started**

Fork a flow, run both, diff them: steps diverged, artifacts differing,
conclusions conflicting.

**Done means:** `diff` over two forked flows returns something a human uses to
decide which branch to keep.

Diff stands alone and ships before merge. If merge never happens, this is still
the most useful thing in `ai-flows`.

## M4 · ai-storage v1 — **not started**

Four levels behind QM's `MemoryService`, level-ordered recall, explicit
promotion. **No embeddings.** ([05](05-ai-storage.md))

**Done means:** a levelled strategy is added to the **existing** upstream
harness (`npm run bench:memory`, `src/memory/bench.ts`) and scored by the same
judge as upstream's three — `staleness` first, `signalToNoise` and
`inferenceVsObservation` as guards. **The number is published whichever way it
comes out.**

**Falsified by — rewritten 2026-08-05, because the original condition cannot fire.**
It read: _no reduction in `staleness` against the flat-file baseline_. That is
unfalsifiable on this harness. The flat-file baseline **already scores `staleness`
10.0 out of 10** on all six conversations **[ran]**, so no strategy can reduce
anything and every arm ties at the ceiling. A condition that cannot fail is not a
falsification condition, and shipping M4 against it would have produced a tie
readable as a success.

The replacement has two parts, and the first is a gate rather than a claim:

1. **Headroom, before the levels are built.** Extend
   `test/memory-bench/conversations/` until the flat-file baseline scores **at most 7
   on `staleness`** — conversations where a fact is superseded several times, or
   across a horizon long enough that a 300-bullet FIFO starts dropping things. If the
   baseline cannot be pushed off the ceiling, the axis has no room on this instrument
   and **M4 does not proceed on it**. Publish the fixtures either way; they are useful
   to upstream regardless of what we conclude.
2. **Then the claim, unchanged in substance.** Level-ordered recall lowers `staleness`
   against the flat file without losing `signalToNoise` or
   `inferenceVsObservation`. Without that, the flat file wins and this pillar is
   dropped.

**The gate was run, and it opened — 2026-08-06 [ran].** Two fixtures, and they
disagree in a way that locates where the axis has room:

| fixture | shape | turns | **staleness** |
|---|---|---:|---:|
| existing six | — | 5–12 | **10.0** (the ceiling that made the old condition unfalsifiable) |
| `supersession-storm` | one fact revised **six times**, short horizon | 13 | **10.0** |
| `long-horizon-eviction` | one policy revised **once, far later**, buried under volume | 43 | **3.0** |

**Density does not break the flat file; horizon does.** Revising a fact six times
inside thirteen turns is handled perfectly — the judge noted it kept *"no stale
intermediate values"*. Stating a policy, burying it under fifty turns of
unrelated ownership and doc-path detail, and then contradicting it once at the
end produces a notebook that *"retains the superseded deploy policy"* and scores
**3.0**, below even the bench's own quality floor of 4.

So the gate's condition — *push the baseline to at most 7, or M4 does not proceed
on this instrument* — **is met, with room to spare**, and it is met by the second
half of the gate rather than the first. Had only `supersession-storm` been run,
the honest conclusion would have been the opposite one, and the axis would have
been dropped on a fixture that was testing the wrong property.

**M4 proceeds.** The claim it now has to beat is stated in (2) below and the
baseline it must beat is 3.0 on `long-horizon-eviction`, not 10.0 on anything.

Two things this does not establish, and both belong next to the number wherever
it is quoted:

- **One fixture is not a benchmark.** `long-horizon-eviction` was written by the
  same hand that wants the axis to have room, which is exactly the failure mode
  [05](05-ai-storage.md) warns about. Before M4's own claim is scored, the
  fixture set needs at least one more long-horizon conversation written to a
  different shape, and the six existing ones stay in as guards.
- **The judge is still deepseek grading deepseek's own summariser**, which is the
  weakest form of this evidence.

Two known instrument defects to fix while doing (1)Two known instrument defects to fix while doing (1), both disclosed in
[05](05-ai-storage.md#two-disclosures-about-the-arms): the judge penalises every arm
that writes `- (YYYY-MM-DD)` bullets for "inferring" the date, which is upstream's own
grammar being scored as speculation; and on this configuration the judge is
deepseek grading deepseek's own summariser, which is the weakest form of the evidence
and should be stated wherever the number is quoted.

**One experiment runs ahead of this milestone**, because it needs M4's instrument
and none of M4's design: `MEMORY_STRATEGY=dream` distils the notebook from the raw
episodic log instead of from per-turn extractions, reusing `scratch-promote`'s
prompt verbatim so the comparison is one variable wide
([05 § Experiment 1](05-ai-storage.md#experiment-1--distil-at-rest-memory_strategydream)).
It is the cheapest test of the mechanism this organisation invented first and the
vendored tree does not have. Building it also repaired the benchmark: its
credential guard hard-exited on `ANTHROPIC_API_KEY`, so **the only benchmark in the
tree could not run on the configuration M1 verified** — a reminder that an
instrument nobody has run on the current setup is not yet an instrument.

**It came back falsified, and it took M4's measurement plan with it [ran].**
`dream` and `per-turn` both score `staleness` 10.0; `per-turn` is at a perfect
10/10/10 on five of six conversations. The benchmark is **saturated**, so it cannot
settle this question — and M4 above proposes scoring level-ordered recall on the
same axis against the same ceiling. **M4's falsification condition needs rewriting
before M4 starts**, against an instrument with headroom that is checkable up front.

## M5 · ai-ui v1 — **not started**

One running flow on a canvas, live, with persisted layout, as a fifth plugin on
the existing chassis. ([04](04-ai-ui.md))

**Done means:** the stopwatch test — state of a 3-day-old flow, canvas vs
transcript — is run and reported.

**Depends on M2:** there is nothing to render until flows exist. Building the
canvas first would be building an interface for a system that does not have a
state to project.

## M6 · Flow shapes — **not started**

`Sequence`, `Loop`, `Fan-out`, `Deliberation`, `Watch` — each added only when a
real piece of work needs it, with promotion from `Open`.

## M7 · Flow merge — **blocked on M3, and honestly hard**

Rejoin a forked flow. Different artifacts in different files is mechanical.
**Two different conclusions about the same file is the open problem**, and it
needs a reconciler, not a text merge.

Not scheduled. It becomes tractable once M3 has produced real diffs to look at —
the conflict model should be derived from actual divergences, not designed ahead
of them.

## Upstream, in parallel

Not a milestone; continuous.

- **Weekly** `git subtree pull` from `yc-software/qm@main`
- **First proposal to send:** record `forkedFrom { sessionId, upToSeq }` on
  session fork. Small, self-contained, useful to them without us. Human-written
  text in their `adrs/` format, as their `CONTRIBUTING.md` asks — not a
  generated PR.

## Freeze, in parallel

[07](07-freeze-policy.md). Three repositories to freeze; `evolving-agents` needs
its README and `PLAN.md` made true first, because 452 stars is the only real
distribution the new project has.

## Deliberately not planned

**A new harness.** Six ship upstream. If a model is missing, add it there.

**Replacing `web-ui`.** `ai-ui` is a fifth plugin. Running both is what makes the
canvas comparison possible instead of asserted.

**A general workflow runtime.** `ai-flows` sequences _agent work_. The moment it
starts growing arbitrary code execution, retries-with-backoff and a DSL, it has
become Airflow, and Airflow exists.

**Re-implementing anything in `ai-base`.** Identity, ACL, sandbox, credentials,
policy, audit. Wanting to change one is evidence the design above it is wrong.
