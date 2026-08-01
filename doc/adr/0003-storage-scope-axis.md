# ADR-0003 · Add `flow` and `system` to QM's scope kinds

- **Date:** 2026-08-01
- **Status:** Accepted

## Context

`ai-storage` addresses memory at four levels: system, user, project, flow
([05](../05-ai-storage.md)).

QM's scope kinds are a closed union — `ai-base/src/types.ts:12`:

```ts
const SCOPE_KINDS = ["personal", "channel", "team", "org", "group"] as const;
```

A `ScopeId` is `"<kind>:<ref>"`, and it is the key for memory, files, keychain
view, permissions, crons and sandbox. Our levels map as:

| ai-storage level | QM scope kind |
|---|---|
| User | `personal` ✓ |
| Project | `team` / `channel` ✓ |
| System | `org` — close, but org-level config, not "how this OS operates" |
| **Flow** | **nothing** |

## Decision

**Add `flow` and `system` to `SCOPE_KINDS` inside `ai-base`.**

A two-line widening of a `const` array. Recorded in `ai-base/AI-OS-PATCHES.md`
and offered upstream as a hand-written proposal.

## Alternatives rejected

**Encode the level in the `ref` string** — e.g. `team:project-42/flow-7`.

Rejected, and this is the load-bearing reason for the whole ADR: `parseScopeId`
splits on the first `:` and returns `{ kind, ref }`, and **every permission check
in QM parses a `ScopeId`**. A fake scope hidden inside `ref` would be read by
`isSharedScope` and `isManageableCreationScope` as the *outer* kind. Flow memory
would silently inherit the project's ACL, and there would be no visible bug —
just a quiet, permanent over-share.

Zero core modification is not worth a silent ACL bypass.

**A parallel scope system for ai-storage only.** Rejected: two scope systems in
one process is how you get two answers to "who can read this". The whole value of
QM's scope model is that it is the single key for everything.

**Reuse `org` for system-level.** Partially viable — `org` is close. Rejected for
clarity: org-level *configuration* and system-level *operational memory* are
different lifetimes and different audiences, and conflating them means system
facts inherit org config's write permissions.

## Consequences

- **Two lines of core divergence**, in the file most likely to be touched
  upstream. Accepted: the alternative is an ACL hole.
- **Every `switch` on `ScopeKind` upstream must be checked** for exhaustiveness
  after each subtree pull. TypeScript catches this where the switch is
  exhaustive; where it falls through to a default, it will not. Add to the
  pull checklist in `AI-OS-PATCHES.md`.
- **New kinds must be denied by default** in permission checks until explicitly
  handled. A new scope kind that is unknown to an ACL function must fail closed,
  never open. This is the first thing to test.
- **Upstreamable.** Small, generic, and `flow` is plausibly useful to QM
  independently of ai-os — but only after `ai-flows` exists to justify it.
