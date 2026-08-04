# ai-os — design documents

These documents are the project. Code follows them, not the other way round.

Read in order the first time:

| # | Document | Answers |
|---|---|---|
| 00 | [Vision](00-vision.md) | What is an agent operating system, and what makes this one different from a chat app with plugins |
| 01 | [Architecture](01-architecture.md) | How the four pillars fit together and where each one attaches to the base |
| 02 | [ai-base](02-ai-base.md) | What QM actually gives us — verified against the source, not the README — and the seams we build on |
| 03 | [ai-flows](03-ai-flows.md) | The flow model: declarative, resumable, inspectable units of work above the turn |
| 04 | [ai-ui](04-ai-ui.md) | The intelligent canvas: a spatial, live interface at OS level |
| 05 | [ai-storage](05-ai-storage.md) | Memory at four levels — system, user, project, flow |
| 06 | [Licensing](06-licensing.md) | Apache 2.0 over MIT: what is permitted, what is required, what is forbidden |
| 07 | [Freeze policy](07-freeze-policy.md) | What "frozen" means for the other repositories, operationally |
| 08 | [Roadmap](08-roadmap.md) | Milestones, in dependency order, with the honest blockers |
| 09 | [Scales](09-scales.md) | Individual, collective, project, system — one axis for flows and memory, and it is `scopeId` |
| 10 | [Observability](10-observability.md) | Can a flow's progress be read at all? Drift versus unreadable, and the noise floor that separates them |

## Decisions

Architecture decisions live in [`adr/`](adr/). One file per decision, written
when the decision is made, never edited afterwards — superseded instead.

| ADR | Decision | Status |
|---|---|---|
| [0001](adr/0001-fork-vs-dependency.md) | Vendor QM as a subtree rather than depend on `@yc-software/qm` | Accepted |
| [0002](adr/0002-flow-as-first-class-object.md) | The flow is a first-class persisted object, not a prompt pattern | **Superseded by 0004** |
| [0003](adr/0003-storage-scope-axis.md) | Add `flow` and `system` as scope kinds, extending QM's closed union | Accepted |
| [0004](adr/0004-flows-and-the-subagent-record.md) | A flow reads the subagent record (`tasks`) but does not own it | Accepted |
| [0005](adr/0005-scale-is-scope.md) | The scale of work is its scope; a project is upstream's group, not `team` | Accepted |
| [0006](adr/0006-ai-flows-lives-outside-core.md) | `ai-flows` is built against the signed HTTP seam, not inside core | Accepted |
| [0007](adr/0007-observation-captured-not-derived.md) | An attempt's observation is captured when it closes, never derived later | Accepted |

## House rules for these documents

1. **Every claim about QM cites a file and line.** The upstream moves daily; a
   claim without a citation is a claim that has already rotted. Line numbers here
   were read at `ai-base` commit `7f2c916`.
2. **Reading is not running — say which.** Claims are marked **[read]** (from the
   source) or **[ran]** (observed executing). Added 2026-08-01, after the first
   pass of these documents was written from reading alone and turned out to
   contain seven material errors, two of which had already hardened into an ADR.
   The full correction is in
   [02-ai-base § What running it changed](02-ai-base.md#what-running-it-changed).
3. **A gap is stated as a gap.** If something is not built, the document says so
   in the present tense. No aspirational voice.
4. **Measured beats argued.** Where a design claims an advantage, it names the
   measurement that would falsify it — and prefers an *existing* measurement to
   a new one, because a fresh scale is how a benchmark ends up flattering its
   author.
5. **Superseded, never quietly rewritten.** A decision that turned out to rest on
   a false premise is the most useful record this organisation can keep. See
   [ADR-0002](adr/0002-flow-as-first-class-object.md), left intact and marked.
