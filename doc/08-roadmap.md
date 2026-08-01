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

## M1 · ai-base runs locally — **not started**

Before designing further against QM, run it: Postgres up, core up, one turn
through the mock harness, one through a real one.

**Done means:** a turn completes locally and `doc/02-ai-base.md` has been
corrected wherever reality disagreed with it.

**Why first:** every seam in [01](01-architecture.md) was read, not exercised.
Reading is how the previous flagship accumulated 18,680 lines and three tests.

## M2 · The first flow — **not started, and the one that justifies the repository**

The smallest honest `ai-flows`: **one shape (`Open`), persisted, resumable.**

1. `flow_` tables; a flow record with goal, state, steps
2. A step's attempt executes as an existing run (`ai-base/src/runs/`)
3. A flow survives process restart and context compaction
4. `forkedFrom { flowId, atStep }` recorded from the first commit — the gap in
   upstream sessions is not reproduced here
5. API routes for create / advance / inspect

Not in M2: shapes beyond `Open`, merge, canvas, new memory.

**Done means:** a flow started on Monday is resumed on Wednesday, after a
restart, with its state intact.

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

**Done means:** the retrieval benchmark runs, against the flat-file baseline,
using acc@1/MRR so it is comparable to the 80/80 result — **and the number is
published whichever way it comes out.**

**Falsified by:** parity on both retrieval and 30-day fact staleness. Then the
upstream flat file wins and this pillar is dropped.

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
