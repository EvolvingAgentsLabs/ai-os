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

## M2 · The first flow — **not started, and the one that justifies the repository**

The smallest honest `ai-flows`: **one shape (`Open`), persisted, resumable.**

1. `flow_` tables; a flow record with goal, state, steps
2. A step's attempt executes as an existing run (`ai-base/src/runs/`), reusing
   `src/core/turn-resume.ts` for crash recovery inside an attempt
3. A flow survives process restart and context compaction
4. `forkedFrom { flowId, atStep }` recorded from the first commit — the gap in
   upstream sessions is not reproduced here
5. API routes for create / advance / inspect
6. **Completes on `pi`, with no subagents and no task rows**
   ([ADR-0004](adr/0004-flows-and-the-subagent-record.md))
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

Two known instrument defects to fix while doing (1), both disclosed in
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
