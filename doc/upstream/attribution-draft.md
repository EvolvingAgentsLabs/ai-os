# Draft for upstream — `yc-software/qm`, `adrs/`

Send as a PR adding this as a `.md` under their `adrs/`. Evidence and the full
measurement are in [12-conformation](../12-conformation.md); this is the note,
not the appendix. Read it once in your own voice before sending — their
`CONTRIBUTING.md` asks for human-written text and specifically not for a proposal
an AI expanded, and that request is worth honouring at the level of who actually
signs it.

---

## Turns don't record who took them

We were building a view of who has been talking to whom across scopes, read off
the session log. It came back with almost everything unattributed, and the reason
turned out to be one line rather than anything structural.

`core/orchestrator.ts:2170` — the tape callback sets `author` from
`actor.displayName`, and from nothing else:

```ts
...(actor.displayName?.trim() ? { author: actor.displayName.trim() } : {}),
```

Two turns on `pi`, differing in that one field:

| scope | actor | tape records | attributed |
|---|---|---|---|
| `personal:U1` | no `displayName` | 2 | 0 |
| `personal:U2` | `displayName: "Ada"` | 2 | 1 |

Three of four carry no author. The turn knows who the actor is in both cases —
it just doesn't write it down unless a display name happens to be there. And the
one record that is attributed says `"Ada"`, a mutable label, while `participants`
is keyed by principal id.

The part we'd flag hardest: **the assistant's own messages are never attributed
at all.** In an agent system the agent is the most active speaker, and it's
anonymous in its own log.

Two things we'd suggest, though it's your call which:

- Fall back to `actor.id` when `displayName` is empty. Ideally keep the display
  name as its own field rather than overloading `author`, so `author` means a
  principal consistently.
- Attribute assistant records. A constant is fine.

**Second, smaller.** `ParticipantWindow` (`sessions/session-store.ts:195`)
exposes `validFrom` / `validTo` as timestamps, but attribution internally filters
on `validFromSeq` / `validToSeq` (`memory-session-store.ts:494`,
`postgres-session-store.ts:839`) and those aren't exposed. So anything
reconstructing attribution from outside agrees with yours except at a window
boundary. Exposing the seq pair would close it, and it's additive.

**We don't need either to ship.** We rebuilt attribution against the public seam
— `listParticipants` plus the entry `type` — and it recovers 4 of 4 on the same
two turns, with the principal id rather than the display name. So this is an
offer, not a blocker. The one thing we can't reconstruct from outside is that
boundary residual in the second ask.

One note in case it's useful: `attributedTurns` already does this join correctly
against `participants` inside the membership window. It aggregates by day, so
anything wanting per-record attribution reimplements it. We did. Worth knowing
the answer already exists in there.
