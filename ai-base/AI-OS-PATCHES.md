# ai-os modifications to ai-base

<!-- SPDX-License-Identifier: MIT -->

`ai-base/` is vendored QM (MIT). This file is the complete list of every change
ai-os has made inside it.

**Why this file exists.** It is the conflict-resolution map for
`git subtree pull`. Without it, every upstream pull is an archaeology exercise.
[ADR-0001](../doc/adr/0001-fork-vs-dependency.md) accepts a permanent merge
burden; this file is what makes that burden survivable.

**Rules**

1. Everything under `ai-base/` is **MIT**, including our own additions, so that
   patches stay eligible to go upstream without a per-patch relicense. See
   [`doc/06-licensing.md`](../doc/06-licensing.md).
2. Never edit or delete `ai-base/LICENSE`.
3. Prefer not modifying at all — build against a seam
   ([`doc/01-architecture.md`](../doc/01-architecture.md)). Every line here is a
   line merged by hand forever.
4. If you must, make the smallest possible widening and record it below **in the
   same commit**.

## Vendoring

|             |                                                         |
| ----------- | ------------------------------------------------------- |
| Upstream    | `https://github.com/yc-software/qm`                     |
| Branch      | `main`                                                  |
| Vendored at | `7f2c916360f1797a8ff2a77ce2ce40c5fabab087` (2026-07-31) |
| Method      | `git subtree --squash`                                  |
| Cadence     | weekly                                                  |

```bash
# pull upstream
git subtree pull --prefix=ai-base https://github.com/yc-software/qm.git main --squash
```

### Do not use the bundled fork skills as-is

QM ships `.claude/skills/update-qm` and `.claude/skills/upstream-pr` for private
forks. **Both assume the repository root is qm** and dispatch on `git remote -v`.
Under our subtree, qm's root is `ai-base/` and `origin` is not a qm fork, so both
misread the situation. Use `git subtree pull` above instead.

Their _content_ still applies and should be read before any upstream push:

- **Merge, never rebase.** Published history is tracked by other clones.
- **Nothing under `deploy/layers/` reaches upstream** — not config, not infra
  coordinates, not the names of systems or people inside them.
- **An upstream push is permanent.** It stays reachable by SHA in every clone and
  fork even after a deleted branch or a force-push. Scrub before pushing, not
  after.

### Where ai-os deployment material goes

`deploy/layers/evolvingagents/` — QM's sanctioned location for org-specific
deployment config, sandbox tools, org plugin images and infrastructure. Generate
it with `qm init` rather than hand-building, so the `.gitignore` that keeps
`.env` and Terraform state out of Git comes with it:

```bash
node cli/bin/qm.ts init deploy/layers/evolvingagents --org evolvingagents --target fly
```

This directory is org material, never upstreamed, and `ai-ui` ships as a plugin
under it.

## Pull checklist

Run after every pull, before committing the merge:

- [ ] Every entry in the ledger below still applies, or is removed with a reason
- [ ] `SCOPE_KINDS` in `src/types.ts` still carries `flow` and `system`
      ([ADR-0003](../doc/adr/0003-storage-scope-axis.md))
- [ ] Every upstream `switch` over `ScopeKind` still handles the new kinds —
      **and any that falls through to a `default` fails closed, not open.**
      TypeScript will not catch that one; `test/scope-kind-fail-closed.test.ts`
      does, and its union census is what forces a widening to be handled rather
      than inherited. Run it first after every pull.
- [ ] `MemoryService` (`src/memory/memory-service.ts`) interface unchanged, or
      `ai-storage` updated
- [ ] `MemoryStrategyKind` in `src/memory/strategy.ts` still carries `dream`, and
      `KNOWN_KINDS` in `scripts/memory-bench.ts` still lists it. Upstream owns
      both lists; a pull that rewrites either drops an arm of the experiment in
      [05](../doc/05-ai-storage.md#experiment-1--distil-at-rest-memory_strategydream)
      silently, because nothing fails when a benchmark simply stops running a row
- [ ] `Harness` (`src/harness/harness.ts`) interface unchanged, or `ai-flows`
      updated
- [ ] Plugin chassis contract unchanged, or `ai-ui` updated
- [ ] `ai-base/LICENSE` still present and byte-identical
- [ ] `.github/workflows/ci.yml` **at the repository root** still runs the jobs we
      depend on. GitHub reads only the root `.github/workflows`, so
      `ai-base/.github/` is inert here: upstream can add, rename or fix a CI job
      and nothing about it reaches us. Ours is a deliberate subset — scope guard,
      typecheck, five test shards, Postgres, lint, ledger — and it drops
      upstream's CLI and plugin-image jobs, which cover code ai-os does not
      modify. Postgres is in because `test/postgres-store.test.ts` skips itself
      without `DATABASE_URL`, and it is the only place the run store's
      one-running-per-session claim is exercised — the constraint
      [03](../doc/03-ai-flows.md#the-concurrency-constraint) builds on.
- [ ] `package-lock.json` still byte-identical to the vendored one. A stray local
      `npm install` is the easiest unrecorded divergence to create and the least
      visible; the ledger job catches the commit, not the habit.

## Ledger

| Date       | File                                                          | Change                                                                                                                                                                                                                                                                                                                                                                                                                             | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Upstreamable?                                                  | Offered  |
| ---------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| 2026-08-02 | `src/triggers/run-trigger.ts`                                 | `actorMayReadScope` enumerates the kinds it grants instead of falling through to `return true`                                                                                                                                                                                                                                                                                                                                     | It granted read on **any** scope kind other than `channel`/`group`, including a malformed or unrecognised one, so a cron or monitor whose home scope did not parse ran the turn for an actor with no membership evidence. Identical behaviour for all five current kinds, with and without a directory                                                                                                                                                                                              | **Yes** — a live fail-open independent of ai-os                | not sent |
| 2026-08-02 | `test/scope-kind-fail-closed.test.ts`                         | New test: every ACL decision denies a scope kind it does not explicitly handle                                                                                                                                                                                                                                                                                                                                                     | [ADR-0003](../doc/adr/0003-storage-scope-axis.md) requires new kinds to fail closed and calls this "the first thing to test". Includes a union census that **fails the day `SCOPE_KINDS` is widened**, forcing the author to give the new kind an explicit row rather than inheriting a default                                                                                                                                                                                                     | **Yes**                                                        | not sent |
| 2026-08-05 | `src/agents/agent-definition.ts`                              | **New directory.** An agent is `agents/<name>.md` in the workspace: frontmatter `description` + `tools`, body is its instructions. Parsing, the delegated-tool allowlist, the child policy suffix, and a name guard on the path builder                                                                                                                                                                                            | Upstream defines its subagents as **three TypeScript literals sharing one prompt** (`claude-harness.ts:341` — `research`/`code`/`consult`), so an agent cannot be authored, diffed, versioned or evolved. A markdown definition can, and it needs no new plumbing: `ToolContext.read`/`write` already reach the workspace, so an agent can read and rewrite its own agents                                                                                                                          | **Yes** — additive, no core behaviour changes                  | not sent |
| 2026-08-05 | `src/harness/pi-tools.ts`                                     | `delegate` tool, plus `runChild` and `childTools` options. The tool exists only when the harness supplies `runChild`; `childTools` filters by name and composes with the existing `readOnly` filter                                                                                                                                                                                                                                | `pi` is the only harness that reaches OpenRouter and the only one with **no subagents** — the other three borrow the delegation of the CLI they wrap, which speaks only to its own vendor. That is why M1 found subagents and cheap models disjoint, and it is accidental rather than fundamental. A child is built without `runChild`, so it has no `delegate`: the tree is bounded at one level by construction, not by instruction                                                               | **Yes** — qm wants subagents on `pi` as much as we do          | not sent |
| 2026-08-05 | `src/harness/pi-harness.ts`                                   | Extracted `runIsolatedSession`; `oneShot` is that helper with no tools, a delegated agent is it with the subset its definition declares. `runChild` wired into the turn's tool construction, sharing the parent's `ToolContextRef`                                                                                                                                                                                                 | `runTurn` already routes through `createTurnSession(sessionId, systemPrompt, history, …)`, so a child run is different arguments rather than new architecture. One body for both paths, per the repo's rule about solving at the layer all paths flow through. **Known limit:** a child run takes no abort signal, so an aborted parent turn abandons rather than cancels it                                                                                                                        | **Yes**                                                        | not sent |
| 2026-08-05 | `test/agent-definition.test.ts`, `test/delegate-tool.test.ts` | New tests: 12 over parsing, the allowlist and path safety; 10 over the tool's behaviour, error paths and the child filter                                                                                                                                                                                                                                                                                                          | One found a real defect while being written: `agentDefinitionPath` built `agents/../../etc/passwd.md` and handed it to the read layer, because name validation lived in `parseAgentDefinition`, which runs after. Production refused it via the workspace store's `safeJoin` — a downstream guard, not the layer all paths flow through. The guard moved to the path builder and the test pins it there                                                                                             | **Yes**                                                        | not sent |
| 2026-08-05 | `src/memory/strategies/dream.ts`                              | **New file.** A fourth `MemoryStrategy`: `onTurnEnd` appends the raw exchange to a dated episodic log and spends no model call; `maintain` is the pass at rest, distilling the log into the notebook (`PROMOTION_PROMPT` + `DREAM_EPISODE_ADDENDUM`) and into a procedural `memory/STRATEGIES.md`, which `recall` returns alongside the notebook. Self-triggers after `MEMORY_CONSOLIDATE_AFTER` turns, prunes episodes at 14 days | The one mechanism this organisation invented first and the vendored tree does not have — zero hits for it in `src/`. A new file rather than an edit, so the merge burden is a directory listing, not a hunk. Experiment and falsification condition in [05](../doc/05-ai-storage.md#experiment-1--distil-at-rest-memory_strategydream)                                                                                                                                                              | **Yes** — a strategy beside the other three, no core edits     | not sent |
| 2026-08-05 | `src/memory/strategy.ts`                                      | `dream` added to `MemoryStrategyKind`, to `parseMemoryStrategyKind`, and to the factory ahead of the consolidator branch                                                                                                                                                                                                                                                                                                           | The smallest widening that makes the new file selectable, and it reuses the existing `consolidateAfter` dep so no config plumbing is added. `MEMORY_STRATEGY=dream` is the whole interface. Anticipated by the Planned table below, which still stands for `ai-storage`'s own promotion strategy                                                                                                                                                                                                    | **Yes**                                                        | not sent |
| 2026-08-05 | `scripts/memory-bench.ts`                                     | Credential guard accepts any of `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` / `OPENAI_API_KEY`; `KNOWN_KINDS` gains `scratch-promote` and `dream`                                                                                                                                                                                                                                                                                   | The guard hard-exited on `ANTHROPIC_API_KEY` alone, so the only benchmark in the tree **could not run on the configuration M1 actually verified** (`HARNESS=pi`, `MODEL_PROVIDER=openrouter`, `PI_MODEL=deepseek/deepseek-v4-flash`). The harness itself is provider-agnostic; only the guard was not. `scratch-promote` is the control arm: it shares `PROMOTION_PROMPT` with `dream`, so including it is what reduces the comparison to one variable                                              | **Yes** — the guard is a live defect for any non-Anthropic run | not sent |
| 2026-08-05 | `test/memory-strategy-dream.test.ts`                          | New test: 12 cases over the episodic log, both distillation phases, `NONE` handling, phase independence under model failure, two-tier recall, self-triggering, retention pruning, and kind selection                                                                                                                                                                                                                               | Every other strategy has a test file of its own; this one asserts the properties the experiment depends on, in particular that a turn costs no model call and that the judge-visible notebook is written only by the pass                                                                                                                                                                                                                                                                           | **Yes**                                                        | not sent |
| 2026-08-15 | `src/agents/agent-definition.ts`                              | `CHILD_TOOL_NAMES` exported (one keyword; the set is unchanged)                                                                                                                                                                                                                                                                                                                                                             | `ai-flows/src/agent-file.ts` validates agent drafts a **model** writes, and its first version restated the allowed tools as a hand-written list — which included `search`, a tool that does not exist. It was never checked. A roster an agent wrote declared `search`, the validator accepted it, and upstream then rejected the whole `tools:` list, installing two agents that loaded fine and had **no tools at all**. A second copy of a list whose only purpose is to match another list is not a check; the export removes the copy                                                                                                                                                                                                                                                                                                                                                                     | **Yes** — the parser is already ours (row above) and anything validating a draft before parsing needs the set | not sent |
| 2026-08-02 | `package-lock.json`                                           | **Reverted to the vendored file.** No divergence remains                                                                                                                                                                                                                                                                                                                                                                           | It had drifted 1,783 lines in PR #1 — `cli` `0.1.0` → `0.1.4` plus re-resolved nested dependencies — from a local `npm install` during the M1 pass, committed unnoticed, which is why the line that used to open this ledger ("byte-identical to upstream") was false when it was written. Restored and re-verified from a clean `node_modules`: `npm ci` succeeds, typecheck clean, root suite 3,735 tests / 3,603 pass / 0 fail — identical to the drifted lock, so nothing depended on the drift | n/a — no longer a divergence                                   | —        |

## Planned, not yet made

| File                     | Change                                         | ADR                                           |
| ------------------------ | ---------------------------------------------- | --------------------------------------------- |
| `src/types.ts`           | Add `flow` and `system` to `SCOPE_KINDS`       | [0003](../doc/adr/0003-storage-scope-axis.md) |
| `src/memory/strategy.ts` | Add promotion strategy to `MemoryStrategyKind` | [0003](../doc/adr/0003-storage-scope-axis.md) |
| `src/wiring.ts`          | Register `ai-storage` as the `MemoryService`   | [01](../doc/01-architecture.md)               |

## Additions that are not modifications

Two files were **added** under `ai-base/`, and nothing upstream was changed. They
are recorded here anyway because the ledger check is keyed to the directory rather
than to the kind of change, and because an addition upstream did not make is still
something a subtree pull has to reconcile.

| File                                                         | Why it is here rather than in `ai-flows/`                                                                                                                                                                                                                                                  | ADR / doc                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `test/memory-bench/conversations/supersession-storm.json`    | The bench discovers fixtures from `readdirSync` over its own directory (`scripts/memory-bench.ts`), so a fixture outside it is invisible to the harness. Written for the first half of M4's gate — one fact revised six times, short horizon. Baseline scored **10.0**, the ceiling intact | [08 § M4](../doc/08-roadmap.md) |
| `test/memory-bench/conversations/long-horizon-eviction.json` | Same reason. The second half of the gate — one policy revised once, far later, buried under volume. Baseline scored **3.0**, which is what opened M4                                                                                                                                       | [08 § M4](../doc/08-roadmap.md) |

**These should go upstream rather than stay ours.** They are fixtures for
upstream's own benchmark, they exercise a property that benchmark did not cover,
and they are useful to qm whether or not `ai-storage` is ever built. Added to the
send list below.

## Sending things upstream — two channels, and picking the wrong one is the mistake

**Vulnerabilities go privately.** `SECURITY.md` is explicit: report through the
repository's **Security → Report a vulnerability** flow, and _"do not open a
public issue, discussion, or pull request with exploit details."_ A public
`adrs/` PR describing an authorization bypass is a disclosure, not a
contribution.

**Everything else goes as informal human text.** `CONTRIBUTING.md` asks for a
`.txt` or `.md` file in `adrs/`, _"quite informal — just run your idea by us in
the same way you would a coworker"_, and adds: **"Please do not have AI
artificially expand what you'd like to do into a formal proposal."** A polished
generated document is the wrong artifact here even when the idea is right.

| To send                                                                                     | Channel                                         | Status   | Notes                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `actorMayReadScope` fail-open on an unrecognised scope kind (`src/triggers/run-trigger.ts`) | **Private — Security → Report a vulnerability** | not sent | A trigger whose `ownerScopeId` does not parse runs for an actor with no membership evidence. **Send first.** Include affected revision, config, impact, smallest reproduction. The fix is in the ledger above; offer it, do not publish it |
| Record `forkedFrom { sessionId, upToSeq }` on session fork (`src/api/app-sessions.ts:392`)  | Public — `adrs/`                                | not sent | Small, self-contained, useful to them without ai-os. Send second, and keep it short                                                                                                                                                        |
| Add `flow` to `SCOPE_KINDS`                                                                 | Public — `adrs/`                                | not sent | Only after `ai-flows` exists to justify it                                                                                                                                                                                                 |
| Two memory-bench fixtures covering a long horizon (`test/memory-bench/conversations/`)      | Public — `adrs/`                                | not sent | Their bench had no conversation long enough to move `staleness` off 10.0/10; one of ours scores it 3.0. Useful to them independently of ai-storage. Send with the numbers, not with the pillar                                             |
