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

## Decisions

Architecture decisions live in [`adr/`](adr/). One file per decision, written
when the decision is made, never edited afterwards — superseded instead.

| ADR | Decision |
|---|---|
| [0001](adr/0001-fork-vs-dependency.md) | Vendor QM as a subtree rather than depend on `@yc-software/qm` |
| [0002](adr/0002-flow-as-first-class-object.md) | The flow is a first-class persisted object, not a prompt pattern |
| [0003](adr/0003-storage-scope-axis.md) | Add `flow` and `system` as scope kinds, extending QM's closed union |

## House rules for these documents

1. **Every claim about QM cites a file and line.** The upstream moves daily; a
   claim without a citation is a claim that has already rotted. Where a document
   says "verified", it was read at `ai-base` commit `7f2c916`.
2. **A gap is stated as a gap.** If something is not built, the document says so
   in the present tense. No aspirational voice.
3. **Measured beats argued.** Where a design claims an advantage, it names the
   measurement that would falsify it. This organisation has shipped architecture
   without evidence before; that is the specific habit these documents exist to
   break.
