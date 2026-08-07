# ADR-0009 · A flow records the principal it acts for, and that is not an agent principal

- **Date:** 2026-08-07
- **Status:** Accepted

## Context

Running a composed flow in a project scope produced a refusal from the core
**[ran]**:

```
core 403 on /v1/turns?async=1: {"status":"refused","reason":"you're not a member of that context"}
```

That is upstream's roster guard working. The flow server advances a step by
posting a turn, the turn carried the service identity `flows`, and `flows` is on
no project roster. The stopgap was `FLOWS_ACTOR` — one configured principal, a
real person, who must be a member of every scope the server touches.

`FLOWS_ACTOR` is wrong in the way shared service accounts are always wrong:
**every flow in the audit log is attributed to the same person regardless of who
asked for it.** In a system whose whole argument is that work can be handed off
between people, that is not a cosmetic defect.

### The reading that was too fast

This was first recorded, in the commit that introduced the stopgap, as
[ADR-0008](0008-conformation-is-projected.md)'s condition for agent principals
firing — *"an agent that must appear in a roster"*. **That reading is wrong and
this ADR exists partly to correct it.**

What was refused was a **service account**, and the fix a service account
suggests — put it on the roster — is not the fix the situation calls for. A flow
is not autonomous work that appeared from nowhere. Somebody created it. That
person is already on the roster, already has the right to act in that scope, and
is already who the audit log should name. The system did not lack an agent
identity; **it lacked the provenance it already had and threw away.**

`Flow` carries `scopeId`, `title`, `goal`, `shape`, `state`, `forkedFrom` — and
nothing about who it is for. So when a step needed an actor there was genuinely
nobody to be, and a service account was the only answer available. That absence
is the defect, not the missing principal type.

## Decision

**A flow records the principal it acts for. A step runs as that principal. No new
`PrincipalType` is added.**

Concretely:

1. `Flow` gains `actorId` — the principal that created it, recorded at creation
   and never inferred afterwards.
2. `POST /flows` and `POST /flows/from-agent` require it. A flow with no actor is
   not created, rather than created and silently attributed to a service account.
3. A step's turn runs as `flow.actorId`. Upstream's roster guard then does exactly
   what it is for: if that person is removed from the project, their flows stop
   advancing, which is correct and is not a case ai-os should route around.
4. `FLOWS_ACTOR` is deleted once (1)–(3) land. Keeping it as a fallback would
   preserve the failure mode this ADR exists to remove.
5. **The agent-principal question stays deferred**, with a sharper condition —
   see Consequences.

Nothing here touches `ai-base`. `flow_flows` is our table; the actor is ours to
record; the turn already accepts any actor the caller names.

## Alternatives rejected

**Add `flows` to every project roster.** The literal reading of the error, and it
makes the audit trail permanently useless: every flow in every project attributed
to a service account, with the real requester recoverable from nothing. It also
grants a long-lived identity membership of every project, which is a standing
privilege nobody reviews.

**A third `PrincipalType`, now.** This is what ADR-0008 deferred and it is not
what the evidence asks for. The refusal was about provenance, not about an agent
needing rights of its own — and the cost is a change to `types.ts` at the centre
of a weekly-pulled dependency, which is the most expensive line available. Buying
it against a misread signal is worse than not buying it.

**Infer the actor from the flow's scope** — the project owner, say. Rejected: it
manufactures provenance rather than recording it. The owner did not ask for this
flow, and an audit trail that names a plausible person is worse than one that
says it does not know.

**Let the actor be optional, defaulting to `FLOWS_ACTOR`.** Rejected because a
default is how the current failure survives. An optional field with a service
account behind it is the same shared-account attribution with an extra step.

## Consequences

- **Gain: the audit trail becomes true.** Every turn a flow runs is attributed to
  the person who asked for the work, by the same mechanism a person's own turns
  are.
- **Gain: no new permission surface.** The roster guard already decides who may
  act in a scope. This stops routing around it.
- **Cost: a flow can now be blocked by a membership change.** If its actor leaves
  the project, the flow stops. That is correct — the alternative is work
  continuing in a scope on behalf of somebody who was removed from it — and it
  makes [09-scales](../09-scales.md)'s roster-version guard bite on flows too.
- **Cost: existing flows have no actor.** They were created before the field
  existed. They are left with `actorId: null` and cannot be advanced rather than
  backfilled with a guess, because a guessed actor is exactly the manufactured
  provenance rejected above.
- **Sharpened condition for the agent principal**, replacing ADR-0008's, which was
  loose enough to be misread once already:

  > An agent principal is reopened when an agent needs a right **no human
  > requester has** — membership of a scope no person in it asked for, memory no
  > person owns, or an ACL decision that differs from every human it could act
  > for. *A service account being refused is not this*, and neither is any case
  > that recording the requester would have solved.

- **Test that enforces it:** creating a flow without an actor fails. If a code
  path ever needs to create an actorless flow, this ADR needs revisiting rather
  than a default.

## Status of the work

**Decided, not yet built.** The schema change, the two routes and the deletion of
`FLOWS_ACTOR` are not implemented as of 2026-08-07 — recorded here so the decision
is not mistaken for the change ([08-roadmap § Phase 3](../08-roadmap.md)).
