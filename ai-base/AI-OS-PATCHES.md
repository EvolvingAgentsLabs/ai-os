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

| Date       | File                                  | Change                                                                                         | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Upstreamable?                                   | Offered  |
| ---------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------- |
| 2026-08-02 | `src/triggers/run-trigger.ts`         | `actorMayReadScope` enumerates the kinds it grants instead of falling through to `return true` | It granted read on **any** scope kind other than `channel`/`group`, including a malformed or unrecognised one, so a cron or monitor whose home scope did not parse ran the turn for an actor with no membership evidence. Identical behaviour for all five current kinds, with and without a directory                                                                                                                                                                                              | **Yes** — a live fail-open independent of ai-os | not sent |
| 2026-08-02 | `test/scope-kind-fail-closed.test.ts` | New test: every ACL decision denies a scope kind it does not explicitly handle                 | [ADR-0003](../doc/adr/0003-storage-scope-axis.md) requires new kinds to fail closed and calls this "the first thing to test". Includes a union census that **fails the day `SCOPE_KINDS` is widened**, forcing the author to give the new kind an explicit row rather than inheriting a default                                                                                                                                                                                                     | **Yes**                                         | not sent |
| 2026-08-02 | `package-lock.json`                   | **Reverted to the vendored file.** No divergence remains                                       | It had drifted 1,783 lines in PR #1 — `cli` `0.1.0` → `0.1.4` plus re-resolved nested dependencies — from a local `npm install` during the M1 pass, committed unnoticed, which is why the line that used to open this ledger ("byte-identical to upstream") was false when it was written. Restored and re-verified from a clean `node_modules`: `npm ci` succeeds, typecheck clean, root suite 3,735 tests / 3,603 pass / 0 fail — identical to the drifted lock, so nothing depended on the drift | n/a — no longer a divergence                    | —        |

## Planned, not yet made

| File                     | Change                                         | ADR                                                   |
| ------------------------ | ---------------------------------------------- | ----------------------------------------------------- |
| `src/types.ts`           | Add `flow` and `system` to `SCOPE_KINDS`       | [0003](../doc/adr/0003-storage-scope-axis.md)         |
| `src/memory/strategy.ts` | Add promotion strategy to `MemoryStrategyKind` | [0003](../doc/adr/0003-storage-scope-axis.md)         |
| `src/wiring.ts`          | Register `ai-storage` as the `MemoryService`   | [01](../doc/01-architecture.md)                       |
| _(new)_ `src/flows/`     | Flow service + store                           | [0002](../doc/adr/0002-flow-as-first-class-object.md) |

## Proposals to send upstream

Human-written text in their `adrs/` format, as `CONTRIBUTING.md` asks — not
generated pull requests.

| Proposal                                                                                    | Status   | Notes                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actorMayReadScope` fail-open on an unrecognised scope kind (`src/triggers/run-trigger.ts`) | not sent | A live bug in upstream, not an ai-os concern: a trigger with a malformed `ownerScopeId` runs for a non-member. Fix + test are in the ledger above. **Send first** — it is the only entry with a security consequence. |
| Record `forkedFrom { sessionId, upToSeq }` on session fork (`src/api/app-sessions.ts:392`)  | not sent | Small, self-contained, useful to them without ai-os. Send second.                                                                                                                                                     |
| Add `flow` to `SCOPE_KINDS`                                                                 | not sent | Only after `ai-flows` exists to justify it                                                                                                                                                                            |
