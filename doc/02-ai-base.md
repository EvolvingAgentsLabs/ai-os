# 02 · ai-base — what QM gives us

<img src="assets/02-ai-base.jpg" alt="" width="100%">

<sub>One foundation, split by a seam that still holds.</sub>


> Everything here was read at `ai-base` commit `7f2c916`
> (upstream `yc-software/qm@main`, 2026-07-31). QM pushes daily. **Re-verify
> before relying on any line number in this document.**
>
> **Revised 2026-08-01 after actually running it.** The first version of this
> document was written from reading alone and contained seven material errors,
> two of which had already hardened into an ADR. Claims below are now marked
> **[read]** or **[ran]** so the difference is visible. That distinction is the
> single most useful thing in this file.

## What it is

| | |
|---|---|
| Upstream | https://github.com/yc-software/qm |
| License | MIT, `Copyright (c) 2026 QM contributors` |
| Created | 2026-07-29 |
| Language | TypeScript, run directly on Node ≥ 24.15 |
| HTTP | Fastify |
| Persistence | Postgres |
| Size | ~72,000 lines across 45 subsystems in `src/` |
| Vendored at | `7f2c916` — "Use @latest in the qm init bootstrap instead of a version placeholder (#41)" |

QM describes itself as "a multiplayer agent harness for work. In Slack and on the
web." The framing that matters for us: **the core is generic, and everything
company-specific lives in a separate deployment directory** that depends on
`@yc-software/qm` and wires substrates in one file.

## Subsystems, by size

The ten largest, which is a fair proxy for where the thinking went:

| Subsystem | Lines | What it holds |
|---|---:|---|
| `src/api/` | 16,214 | HTTP surface, routes, app services |
| `src/harness/` | 9,945 | Six model harnesses + routing + compaction + replay |
| `src/slack/` | 6,994 | Slack surface |
| `src/core/` | 5,855 | Turn orchestrator, turn options/outcome/resume |
| `src/sandbox/` | 3,226 | Per-scope durable sandbox |
| `src/deploy/` | 2,485 | Deployment machinery |
| `src/credentials/` | 2,410 | Keychain, per-scope credential views |
| `src/skills/` | 1,890 | Skill store, packs, materialization, sync |
| `src/sessions/` | 1,820 | Sessions, entries, leases |
| `src/runs/` | 1,762 | Run store, signals, activity, tool ledger |

## The parts ai-os builds on

### Scopes — the isolation model

`src/types.ts:12`

```ts
const SCOPE_KINDS = ["personal", "channel", "team", "org", "group"] as const;
```

A `ScopeId` is `"<kind>:<ref>"`. Memory, files, keychain view, permissions, crons,
web apps and the sandbox are all scope-keyed. This is the strongest thing QM has
and ai-os inherits it wholesale.

**The gap for us:** the union is closed, and it has no `flow` and no `system`.
Our four memory levels (system / user / project / flow) map to
`org` / `personal` / `team`|`channel` / **nothing**. Adding a kind means editing
this file — a real fork point, addressed in
[ADR-0003](adr/0003-storage-scope-axis.md).

### `MemoryService` — what memory is today

`src/memory/memory-service.ts`. The default implementation is a markdown file:

- `MEMORY_FILE = "memory/MEMORY.md"`, header `# Memory`
- `MAX_FACTS = 300`; on overflow the **oldest bullets are dropped**
- `capture()` folds facts in as `- (YYYY-MM-DD) fact`, deduplicated by normalized text
- untrusted provenance is defanged textually — `(said in X)` becomes `[claimed source: X]`
- revisions are sha256 of content, with optional `history` / `restore` /
  `replaceIfRevision` for optimistic concurrency

It is a good, small design. Its limits are exactly ai-os's opening: one flat
namespace per scope, FIFO eviction as the only forgetting policy, no notion of
which *work* a fact came from, and `query()` is the only retrieval affordance.

### Strategies — the consolidation seam

`src/memory/strategy.ts:14` — `MemoryStrategy { onTurnEnd?, maintain?, promptLines? }`,
selected by a closed union `"per-turn" | "scratch-promote" | "agent-only"` with a
consolidation wrapper (`DEFAULT_CONSOLIDATE_AFTER`). `ai-storage`'s promotion
between levels is a strategy, and adding one means widening that union — a
one-line fork point, or a clean upstream patch.

### Plugins — how a UI attaches

`plugins/` holds `web-ui`, `admin`, `portal`, `auth`, and `chassis` (shared,
private, never published). The chassis provides source-auth signing, signed
core-client helpers, and the `CORE_*` env block, and the rule is explicit:
plugins talk to core over signed HTTP and **never import core**.

`web-ui` is Vite + Lit, with `dockview-core` for panel layout and
`@earendil-works/pi-web-ui`. 128 TypeScript files.

### Harnesses — the model layer

`src/harness/harness.ts:167`, `defineHarness(profile, implementation, tools)`.
Implementations: `claude-harness`, `codex-harness`, `opencode-harness`,
`pi-harness`, plus `mock-harness` and `replay` for tests. Context compaction is
QM's own (`context-compaction.ts`), not the vendor's.

### Security

Three org-level postures, narrowable by scope: **strict** (every tool call pauses
for approval), **auto** (default — a classifier screens provenance-labelled
external data before it reaches the model), **dangerous** (no screening, no
pauses). A predeclared command policy — approval rules and hard denials for
recursive deletes, destructive SQL — applies in *every* posture including
dangerous.

ai-os inherits all of it and adds nothing. Flows execute through the same policy;
a flow is not an escape hatch from approval. This is stated because "the
automation runs unattended so it needs fewer checks" is the obvious wrong turn
here.

## Verified gaps — the reason ai-os exists

Each of these was checked against the source, not inferred from documentation.

**1. No workflow engine.** `src/processes/` is OS-process reaping in the sandbox
(`process-reaper.ts` sends TERM, waits, sends KILL). The nearest things are
`runs` (one turn), `tasks` (the subagent tracker — see below), `triggers`,
`monitors` and `cron` (ways to start a turn). **Nothing sequences work across
turns, and nothing carries a goal from one turn to the next.** → **`ai-flows`**

Stated carefully, because the first draft overreached: QM *does* resume
(`src/core/turn-resume.ts` — `findTrailingPartialTurn`, attempt counting, a
`turn.resume` audit action). It recovers an interrupted **turn**. What does not
exist is anything that survives *across* turns as a unit of work. **[read]**

**2. Fork without lineage.** `src/api/app-sessions.ts:392` `forkSession(sessionId,
principalId, { upToSeq })` copies visible entries into a fresh session and writes
an audit row `action: "session.fork"`. Grep for `forkedFrom` / `parentSessionId`
across the tree: no persisted parent pointer. You can branch; you can never
diff or merge. → **`ai-flows` lineage**, plus a small upstream proposal.

**3. Skills version without history.** `src/skills/skill-store.ts:142` — `s.version += 1`.
A counter, not a history: no prior content retained, so no diff and no rollback.
There is HMAC signing and admin-gated `promote()`, so the *trust* half exists and
the *history* half does not.

**4. Memory has one axis.** Covered above. → **`ai-storage`**

**5. The interface is a transcript.** Panels around a chat log. → **`ai-ui`**

## What running it changed

Everything in this section is **[ran]** — observed on 2026-08-01 against
`deepseek/deepseek-v4-flash` through OpenRouter, `HARNESS=pi`, in-memory stores.

**It runs, and the suite is green.** `npx tsc --noEmit` clean;
`npm test` → **3,712 tests, 3,580 pass, 0 fail, 132 skipped, 93s**. No build
step — Node executes the TypeScript directly.

**Postgres is optional.** `config.databaseUrl ? postgres : memory` throughout
`wiring.ts`. The server reports `store=memory, runStore=memory` and works. The
roadmap previously implied Postgres was a prerequisite; it is not.

**Memory is exactly what this document described** — verified by writing to it:

```
data/workspaces/personal__matias/memory/MEMORY.md

# Memory

- (2026-08-01) User is building ai-os, an agent operating system.
- (2026-08-01) Flagship repo is EvolvingAgentsLabs/ai-os.
```

**`execute` needs Docker — built, and it works.** The sandbox refuses without a
locally built image. After `npm run sandbox:local:build` (→ `qm-sandbox-local:latest`,
1.31 GB, `linux/amd64`), real commands run:

```
SANDBOX-OK
x86_64
Python 3.11.2
```

**The durable-computer claim holds.** A file written to `/workspace` in one
session is readable from a *different* session in the same scope — verified, not
assumed. The sandbox belongs to the scope, not the conversation.

**It is slow on Apple Silicon, and that is a planning fact.** The image is
`linux/amd64`, so it runs emulated: ~47 s for a cold container, ~25 s warm, against
~4 s for a turn with no tool call. Any flow step that shells out costs tens of
seconds locally. For M2 that means the iteration loop is minutes, not seconds —
budget for it, or build an arm64 image.

**The API requires signed requests.** HMAC-SHA256 over
`v0:{unix-seconds}:{METHOD}\n{path}\n{body}`, sent as `x-timestamp` and
`x-signature`, with a five-minute replay window
(`src/auth/source-auth-sign.ts`). `POST /v1/turns` takes
`{ surface, actor, conversation: { kind, threadRef }, text }`.

### The fixed tool surface

Child agents get exactly: `execute`, `read`, `write`, `publish`, `memory`,
`history`, `background`. A flow step must express itself through these or
through a new MCP tool — there is no general code-execution escape hatch beyond
`execute`. **[read]**

### Harness capabilities are not uniform

The constraint that matters most, and the one this document previously missed
entirely. See the matrix in
[01-architecture](01-architecture.md#the-harness-capability-matrix): subagent
*tracking* (`tasks` rows) exists only on `claude` / `codex` / `opencode`;
OpenRouter models work only on `pi` / `mock`. **[read]**

**Corrected 2026-08-06.** This paragraph used to end *"the sets are disjoint —
cheap-model and multi-agent are mutually exclusive today"*, marked **[ran]**.
Delegation and `tasks` are two capabilities, not one, and the sentence conflated
them. `pi` delegates today and keeps OpenRouter; what it does not do is record.
The **[ran]** mark was earned by an observation of `tasks` rows, then spent on a
claim about multi-agent — which is how a correctly-measured fact becomes a wrong
conclusion.

### A memory benchmark already exists

`src/memory/bench.ts` (151 lines) plus `scripts/memory-bench.ts`, run with
`npm run bench:memory`. It compares `MemoryStrategyKind` variants over scripted
conversations and judges each resulting notebook on **`signalToNoise`**,
**`staleness`** and **`inferenceVsObservation`**.

That is a working measurement of memory quality, upstream, today — and
`staleness` is one of the two metrics `ai-storage` proposed inventing. See
[05-ai-storage](05-ai-storage.md). **[read]**

### Org layers — the deployment seam

`deploy/layers/README.md`. QM's supported customization path for a private fork:
core stays identical to upstream, and everything organization-specific is
confined to `deploy/layers/<org>/` — deployment config, sandbox tools and skills,
org plugin images, infrastructure. Upstream keeps the directory empty except for
that README.

Generated, not hand-built (the scaffold includes the `.gitignore` that keeps
`.env` and Terraform state out of Git):

```bash
node cli/bin/qm.ts init deploy/layers/evolvingagents --org evolvingagents --target fly
```

**What this covers and does not.** It covers deployment and org plugins — so
`ai-ui` belongs here, under `plugins/`. It does not accommodate a new core
service, which is what `ai-flows` is. That asymmetry is the whole shape of our
divergence from upstream ([ADR-0001](adr/0001-fork-vs-dependency.md)).

QM also ships three Claude Code skills at `.claude/skills/` — `update-qm`
(merge upstream into a private fork), `upstream-pr` (send a change back with org
context scrubbed), `dev-instance` (run the tree locally). Read them; **do not run
the first two here**, since both assume the repository root is qm. See
`ai-base/AI-OS-PATCHES.md`.

## Working with the upstream

**Pull cadence.** Weekly, via `git subtree pull --prefix=ai-base https://github.com/yc-software/qm.git main --squash`.
Weekly rather than continuous: a daily-moving upstream and a squashed subtree
means conflicts are cheaper to resolve in one sitting than in six.

**Modification policy inside `ai-base/`.** In order of preference:

1. Don't. Build against the seam.
2. If unavoidable, make it the smallest possible widening (a union member, an
   interface method made optional) and record it in `doc/adr/`.
3. Every modification gets a line in `ai-base/AI-OS-PATCHES.md` — what, why,
   whether it is upstreamable, and the upstream issue if it was offered.

**Contributing back.** QM's `CONTRIBUTING.md` asks for **human-written text, not
code**, as an informal ADR in `adrs/` (currently empty except `.gitkeep`). So the
route upstream is a hand-written proposal, not a pull request generated here.
The first one to send, because it is small, self-contained and useful to them
independently of us: *record `forkedFrom: { sessionId, upToSeq }` on fork.*

## What we do not touch

Identity, ACL, credentials, sandbox, security posture, Slack, deploy. If one of
these looks like it needs changing, that is evidence the design above it is
wrong. Re-read this section before editing any of them.
