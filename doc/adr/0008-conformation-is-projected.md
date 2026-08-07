# ADR-0008 · The conformation of the system is projected, never stored

- **Date:** 2026-08-06
- **Status:** Accepted

## Context

An agent OS is asked to organise the work of teams and individuals into
projects, and a project is expected to carry system directories the way Windows
carries a system folder or a repository carries `.git`: a place for the project's
users, for its principal agents, and under each orchestrator a place for its
subagents. The OS in turn is expected to carry its own — system users, system
agents, a repository of orchestrator agents. And the communication between all of
these actors is expected to be visible and analysable.

Checking this against the base returned a result that reframes the request. Six
of the seven structures are already built, and the seventh is the only one
missing **[read]**:

- The layered workspace *is* the folder structure —
  `resolution/resolution-service.ts:37-45` mounts `global/` (the org scope,
  read-only, into every scope) and the conversation's own scope read-write, with
  reserved `agents/`, `skills/`, `memory/` inside it. `WorkspaceLayer` is
  `{ scopeId, mountPath, mode }` (`types.ts:108`).
- A project is `group:web-project-<id>` with a rostered `ProjectStore`
  (`projects/project-store.ts:47`), per [ADR-0005](0005-scale-is-scope.md).
- An agent is `agents/<name>.md` — frontmatter and instructions, parsed by
  `parseAgentDefinition` and delegated to by `pi-tools.ts:2444`.
- Delegation exists on the default harness and bounds itself at one level, in one
  line, `pi-harness.ts:1313-1318`.
- The communication substrate is durable: session tape records carry `kind`,
  `author`, `scopeLabel`, `overheard`.
- **Nothing projects any of it.** There is no way to see which scopes exist,
  which agents a project defines, who is on its roster, or who has spoken to
  whom.

Three further facts bear on the decision, all **[read]**:

- `global/agents/*.md` is mounted into every scope and is **unreachable**:
  `agentDefinitionPath` yields `agents/<name>.md` and `isSafeSkillName` forbids
  `/`, so no name resolves into the `global` mount.
- `parseAgentDefinition` has exactly one caller, `pi-tools.ts`. Workspace-defined
  agents are a `pi` capability; `claude` hardcodes three (`claude-harness.ts:341`)
  and `codex` / `opencode` delegate inside their CLI.
- `PrincipalType = "internal" | "guest"` (`types.ts:3`). There is no agent
  principal.

## Decision

**The conformation of the system — its scopes, projects, rosters, agents and the
communication between actors — is a read-only projection over stores that already
exist. ai-os adds no directory, no membership file and no message bus.**

Concretely:

1. **A scope's folders hold agents, skills, artefacts and memory. They never hold
   membership.** Rosters are read from `ProjectStore` and the directory at
   projection time.
2. **The projector is `ai-flows/src/conformation.ts`** — no new tables, no new
   scope kinds, no new route, no writes. It reports holes where data does not
   exist rather than omitting them.
3. **The communication graph is reconstructed from the session tape**, and from
   nothing else. `AuditLog` (in-memory, capped 50,000, `audit/audit-log.ts`) and
   `run_activity` (TTL-swept, `postgres-run-activity-store.ts:30`) are excluded by
   name, because both would yield a graph that loses records silently.
4. **Analysis of the graph reuses `observability.ts`** — the δ instrument and its
   measured noise floor — rather than introducing a second analyser.
5. **Reaching `global/agents/` is proposed upstream, not patched here.** It is a
   coherent upstream feature, and the widening is a name-resolution fallback, not
   an ai-os concern.
6. **Depth-2 delegation and an agent principal type are deferred**, each with the
   condition below that would reopen it.

## Alternatives rejected

**A `users/` folder inside each project.** This is the literal form of the
request and it is the same object [ADR-0005](0005-scale-is-scope.md) rejected as
`participants[]`, one layer down: an ACL that no ACL function reads. It diverges
from the roster the moment someone is removed, and upstream already refuses
in-flight work when a roster version moves (`app-turn.ts:102-106,337`) — so the
folder would be a membership answer that is not merely stale but contradicted by
a check that is actively running. The precedent is not hypothetical: the one
fail-open this organisation has found sat in a fall-through, not in a permission
function.

**A new folder hierarchy designed up front, then populated.** Rejected on
sequencing rather than on merit. Six of seven structures already exist; a
hierarchy designed before anyone has seen the six would be specified from analogy
to Windows and `.git` instead of from evidence. The projector costs an afternoon
and returns the specification as its holes. If it comes back complete, the
hierarchy was never needed — which is a result no amount of designing produces.

**A messaging subsystem for actor-to-actor communication.** Rejected: the tape is
already durable, already scoped the way permissions are, and already written on
every turn. A bus would be a second copy of a record that exists, with its own
retention policy to get wrong.

**Lifting the delegation cap now.** Rejected as premature, not as wrong. The
child already shares the parent's workspace, so it already sees the same
`agents/` directory — the folder of subagents exists; only the recursion is
denied. Lifting it is one argument (`runChild` into the child's tool set) with an
unbounded consequence, and doing it inside a fork of a weekly-pulled dependency
is how a fork stops being mergeable.

**An agent principal by impersonation.** Rejected outright, and separately from
the deferral below. An agent acting as a human principal makes *who did this*
permanently unanswerable, retroactively, across every audit record. If an agent
is to hold privileges it holds them as itself.

## Consequences

- **Gain: zero new permission surface, again.** Every question the projector
  answers is answered by a store that already enforces its own access, and the
  projector adds no path by which a fact reaches a reader who could not already
  reach it.
- **Cost: the projector is only as complete as the base is legible.** Two known
  losses it must report rather than paper over: `pi` writes no `tasks` rows, so
  delegation on the default harness leaves no durable trace beyond the child's
  report; and workspace-defined agents are inert on three of five harnesses, so a
  project's `agents/` folder does nothing under `claude` / `codex` / `opencode`.
- **Risk: a projection can mislead exactly where it is silent.** Hence the
  requirement that holes are output, not omitted. A conformation view that
  renders cleanly because it did not ask is worse than no view.
- **Falsification, fixed before running:** if the projector's output suffices for
  a person to understand and steer the system, **no new folder ships** and
  [12-conformation](../12-conformation.md) collapses into a section of
  [09-scales](../09-scales.md). If it does not suffice, each new folder arrives
  named for the hole it fills.
- **Condition that reopens depth-2:** a real piece of work in which an
  orchestrator's child must itself delegate, and which cannot be served by the
  parent delegating twice. Until one exists, the flat tree is not a limitation
  anybody has hit.
- **Condition that reopens the agent principal:** an agent that must appear in a
  roster, hold memory no human owns, or be denied something by ACL. All three are
  projector output, so the projector decides this rather than an argument.
- **Test that enforces it:** the projector performs no writes and declares no
  scope kind. If it ever needs to persist a fact to answer a question about
  conformation, that fact belongs to a store that already exists, and this ADR
  needs revisiting rather than quiet bending.
