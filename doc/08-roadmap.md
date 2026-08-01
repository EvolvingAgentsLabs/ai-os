# 08 · Roadmap

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

**Falsified by:** no reduction in `staleness` against the flat-file baseline.
That is the claim four levels exist to make; without it the upstream flat file
wins and this pillar is dropped.

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

**A general workflow runtime.** `ai-flows` sequences *agent work*. The moment it
starts growing arbitrary code execution, retries-with-backoff and a DSL, it has
become Airflow, and Airflow exists.

**Re-implementing anything in `ai-base`.** Identity, ACL, sandbox, credentials,
policy, audit. Wanting to change one is evidence the design above it is wrong.
