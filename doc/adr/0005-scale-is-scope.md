# ADR-0005 · The scale of work is its scope, and a project is a group

- **Date:** 2026-08-02
- **Status:** Accepted

## Context

Work happens at four social scales — individual, collective, project, system —
and both `ai-flows` and `ai-storage` need an answer for each. The question was
about to be answered twice, in two vocabularies: flow shapes were acquiring a
notion of who participates, and memory levels already had one.

QM answers it once. `ScopeId` is `"<kind>:<ref>"` over a closed union
(`ai-base/src/types.ts:12`), and it is the single key for memory, files, keychain
view, permissions, crons and sandbox. The flow model already carries a `scopeId`.

Two facts found while checking this, both **[read]**:

- **A QM project is a `group` scope with a reserved ref prefix** —
  `projectScopeId(id) → group:web-project-<id>` (`projects/project-store.ts:47`),
  backed by a `ProjectStore` with a roster and a per-roster version
  (`project-store.ts:27-41`). It is not `team:`; `team:` comes from
  `Principal.teamIds` (`types.ts:8`), which is identity-provider teams.
- **`isManageableCreationScope` (`channel | team`) and `isSharedScope`
  (`channel | group`) disagree** about both `team` and `group`
  (`types.ts:36,42`), so the choice of kind for "project" changes the answer
  depending on which helper a call site consults.

## Decision

**The scale of a flow — and of a memory level — is its `scopeId`. ai-os defines
no parallel taxonomy of scales.**

Concretely:

- Individual is `personal:`, collective is `group:` / `channel:`, project is
  `group:web-project-<id>` via upstream's `ProjectStore`, system is `org:` until
  the `system` kind of [ADR-0003](0003-storage-scope-axis.md) exists.
- A scale is specified by four questions — who may advance, who may see, where
  its memory promotes, what happens on collision — and shapes inherit their
  scale's answers rather than restating them ([09](../09-scales.md)).
- **ai-os does not implement a project object.** Rosters, membership mutations
  and roster versioning are upstream's, read and reused.

## Alternatives rejected

**A scale taxonomy of our own, alongside scopes.** Rejected for the same reason
ADR-0003 rejected encoding a level inside `ref`: a classification the permission
checks do not consult produces a second answer to *"who can read this"*, and the
one that loses is the one nobody sees losing.

**`team:` for the project scale.** This is what [05](../05-ai-storage.md) said
before this ADR. Rejected on evidence: upstream's project object resolves to a
`group` scope, so `team:` would have meant a project scale that upstream's own
`ProjectStore` cannot see, plus the `isSharedScope` asymmetry above.

**A `participants[]` list on the flow, independent of scope.** Attractive because
it makes handoff explicit. Rejected: it is an ACL that no ACL function reads.
Membership belongs to the directory and the project store; a flow that keeps its
own copy has a stale copy the moment someone is removed — and upstream already
refuses in-flight work when a roster version moves (`app-turn.ts:102-106,337`).

## Consequences

- **Cost: ai-os inherits upstream's model of "project", including the part it
  does not want.** A project is exactly one group. "A project spanning one or
  more working groups" is not expressible today, and becomes its own ADR when a
  real project needs it — not an assumption smuggled into a design.
- **Gain: zero new permission surface.** Every scale question is answered by a
  check that already exists and is already tested upstream.
- **Risk: the flow scope does not exist yet.** Flow-level memory is the one level
  with no scope kind behind it, and ADR-0003's widening remains **untested** —
  specifically, whether ACL functions fail closed on an unknown kind. That test
  precedes any scale beyond individual.
- **Test that enforces it:** a flow at any scale resolves its participants
  through `ScopeId` alone. If a flow ever needs a membership list of its own to
  answer "who can advance this", this ADR needs revisiting rather than quiet
  bending.
