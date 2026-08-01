# ai-ui

The OS-level interface: an intelligent canvas, not a chat log.

> **Status: specified, not implemented.** The design is
> [`../doc/04-ai-ui.md`](../doc/04-ai-ui.md).

## In one paragraph

A transcript is the right shape for a conversation and the wrong one for work
spanning weeks. The canvas is a **spatial, live projection of the state of a
flow** — composed by the system from that state, overridable by the user, and
the override wins from then on.

## What is here

Nothing yet. Blocked on [M2](../doc/08-roadmap.md) — there is nothing to project
until flows exist.

## Rules

- `ai-ui` is a **fifth plugin** on the existing chassis, beside `web-ui`,
  `admin`, `portal` and `auth`. It does not fork or replace `web-ui` — running
  both is what makes the comparison measurable instead of asserted.
- Signed HTTP to core only. **Never import core** (the chassis contract).
- Auth, identity and scope come from core; the canvas never widens what a scope
  may see.
- The system proposes an arrangement on state change and **never re-arranges
  what the user has touched.**
- Licensed Apache 2.0 (`SPDX-License-Identifier: Apache-2.0`).
