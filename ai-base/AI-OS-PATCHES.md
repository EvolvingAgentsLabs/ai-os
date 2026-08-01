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

| | |
|---|---|
| Upstream | `https://github.com/yc-software/qm` |
| Branch | `main` |
| Vendored at | `7f2c916360f1797a8ff2a77ce2ce40c5fabab087` (2026-07-31) |
| Method | `git subtree --squash` |
| Cadence | weekly |

```bash
# pull upstream
git subtree pull --prefix=ai-base https://github.com/yc-software/qm.git main --squash
```

### Do not use the bundled fork skills as-is

QM ships `.claude/skills/update-qm` and `.claude/skills/upstream-pr` for private
forks. **Both assume the repository root is qm** and dispatch on `git remote -v`.
Under our subtree, qm's root is `ai-base/` and `origin` is not a qm fork, so both
misread the situation. Use `git subtree pull` above instead.

Their *content* still applies and should be read before any upstream push:

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
      TypeScript will not catch that one.
- [ ] `MemoryService` (`src/memory/memory-service.ts`) interface unchanged, or
      `ai-storage` updated
- [ ] `Harness` (`src/harness/harness.ts`) interface unchanged, or `ai-flows`
      updated
- [ ] Plugin chassis contract unchanged, or `ai-ui` updated
- [ ] `ai-base/LICENSE` still present and byte-identical

## Ledger

No modifications yet. `ai-base` is byte-identical to upstream `7f2c916`.

| Date | File | Change | Why | Upstreamable? | Offered |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

## Planned, not yet made

| File | Change | ADR |
|---|---|---|
| `src/types.ts` | Add `flow` and `system` to `SCOPE_KINDS` | [0003](../doc/adr/0003-storage-scope-axis.md) |
| `src/memory/strategy.ts` | Add promotion strategy to `MemoryStrategyKind` | [0003](../doc/adr/0003-storage-scope-axis.md) |
| `src/wiring.ts` | Register `ai-storage` as the `MemoryService` | [01](../doc/01-architecture.md) |
| *(new)* `src/flows/` | Flow service + store | [0002](../doc/adr/0002-flow-as-first-class-object.md) |

## Proposals to send upstream

Human-written text in their `adrs/` format, as `CONTRIBUTING.md` asks — not
generated pull requests.

| Proposal | Status | Notes |
|---|---|---|
| Record `forkedFrom { sessionId, upToSeq }` on session fork (`src/api/app-sessions.ts:392`) | not sent | Small, self-contained, useful to them without ai-os. Send first. |
| Add `flow` to `SCOPE_KINDS` | not sent | Only after `ai-flows` exists to justify it |
