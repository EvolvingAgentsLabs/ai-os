# ai-os — documentation

Two kinds of document live here, and the difference is the most useful thing on
this page.

**Reference** describes software that runs. Every claim in it is either citable
to a file and line or marked as observed.

**Specification** describes software that does not exist yet. It is written to be
built from — and to be argued with before anything is built, which is cheaper.

Each document says which it is, in a banner under its title. A document that
changes kind gets its banner rewritten the same day.

## Manuals

| | |
|---|---|
| [**Running ai-os**](manual.md) | The whole system, process by process and gesture by gesture, with screenshots from a live instance and an explicit list of what does not exist · [es](es/manual.md) |

## Reference — the OS as it runs

| | |
|---|---|
| [01 · Architecture](01-architecture.md) | The four pillars, how they fit, and where each attaches to the base |
| [02 · ai-base](02-ai-base.md) | What QM actually provides — verified against the source, not its README — and the seams built on |
| [03 · ai-flows](03-ai-flows.md) | The flow model: goal, steps, attempts, observations. `Open` and `Gated` run; the other four shapes are specification |
| [04 · ai-ui](04-ai-ui.md) | The desk: documents, agent cubes, the trace face. Built; its own falsification has not been run |
| [15 · Generated interaction](15-generated-interaction.md) | Semantic zoom, the self-revealing menu, deixis and fork — what a model can do that a GUI could not. Phases 1–4 built, phase 5 specified |
| [09 · Scales](09-scales.md) | Individual, collective, project, system — one axis for flows and memory, and it is `scopeId` |
| [10 · Observability](10-observability.md) | Whether a flow's progress can be read at all. Drift versus unreadable, and the measured noise floor between them |
| [12 · Conformation](12-conformation.md) | Projects, agents and folders: what the layered workspace is, and why membership never lives in it |
| [16 · A workload with an oracle](16-a-workload-with-an-oracle.md) | The first workload with a declared metric, the seam that reads it across languages, and the three ways its instruments lied. The `Gated` shape it argues for is now built — see 17 |
| [17 · A project is born](17-a-project-is-born.md) | Starting, staffing and furnishing a project from the desk; the project that writes its own roster; lazy skills at a measured 95.8%; memory that survives the session. **Includes the route that confirmed its own write with its own reader** |
| [18 · From a hypothesis to a therapeutic surface](18-from-a-hypothesis-to-a-therapeutic-surface.md) | The whole arc on one workload: a 1995 biophysics hypothesis posed as mathematics, simulated, **found to rest on a wrong model**, repaired against a pre-registered condition, bounded — and then turned into gated, falsifiable statements about pathology and its treatment. **§8 is what it does not show, including a companion experiment that came back against the usual argument for gates** |

## Specification — not built

| | |
|---|---|
| [05 · ai-storage](05-ai-storage.md) | Memory at four levels — system, user, project, flow — with explicit, reversible promotion. **Drawn on the desk before being built**, and the drawing is part of the spec |
| [03 § Flow shapes](03-ai-flows.md#flow-shapes) | `Sequence`, `Loop`, `Fan-out`, `Deliberation`, `Watch`, and merge |

## Findings — what the measurements said

These exist because a design that claims an advantage has to name what would
falsify it. Two of the four came back against us, and are kept in full.

| | |
|---|---|
| [11 · Choosing a model](11-choosing-a-model.md) | Small model plus harness against frontier plus harness — the interaction term, and where its sign flips |
| [13 · Degradation](13-degradation.md) | How anyone would find out a well-configured system had stopped being good. A documented case where oversight *subtracted*, and one of our own |
| [14 · Review study](14-review-study.md) | **Does adding a reviewer help?** The study ran and found nothing — and the finding its first draft reported was an artefact of one full stop, which voided four other numbers with it |

## Decisions

One file per architectural decision, written when it is made and **superseded
rather than edited**. A decision that turned out to rest on a false premise is
the most useful record this organisation can keep.

| ADR | Decision | Status |
|---|---|---|
| [0001](adr/0001-fork-vs-dependency.md) | Vendor QM as a subtree rather than depend on `@yc-software/qm` | Accepted |
| [0002](adr/0002-flow-as-first-class-object.md) | The flow is a first-class persisted object, not a prompt pattern | **Superseded by 0004** |
| [0003](adr/0003-storage-scope-axis.md) | Add `flow` and `system` as scope kinds, extending QM's closed union | Accepted |
| [0004](adr/0004-flows-and-the-subagent-record.md) | A flow reads the subagent record (`tasks`) but does not own it | Accepted |
| [0005](adr/0005-scale-is-scope.md) | The scale of work is its scope; a project is upstream's group, not `team` | Accepted |
| [0006](adr/0006-ai-flows-lives-outside-core.md) | `ai-flows` is built against the signed HTTP seam, not inside core | Accepted |
| [0007](adr/0007-observation-captured-not-derived.md) | An attempt's observation is captured when it closes, never derived later | Accepted |
| [0008](adr/0008-conformation-is-projected.md) | The system's conformation is projected from existing stores; folders never hold membership | Accepted |
| [0009](adr/0009-a-flow-records-who-it-acts-for.md) | A flow records the principal it acts for; no new `PrincipalType` | Accepted |
| [0010](adr/0010-oracle-routed-model-selection.md) | Oracle-routed model selection is a non-stationary bandit; phase 0 is a control arm allowed to kill it | **Proposed** |

## Project

Documents about the work rather than the system.

| | |
|---|---|
| [00 · Vision](00-vision.md) | What an agent operating system is, and what makes this one different from a chat app with plugins |
| [06 · Licensing](06-licensing.md) | Apache 2.0 over MIT: what is permitted, required, forbidden |
| [07 · Freeze policy](07-freeze-policy.md) | What "frozen" means for the organisation's other repositories, operationally |
| [08 · Roadmap](08-roadmap.md) | Milestones in dependency order, with the honest blockers |
| [**The plan**](PLAN.md) | What is in flight today, what it costs to pick up, and the four rules this week re-earned |
| [`upstream/`](upstream/) | Proposals aimed at `yc-software/qm`, kept here until sent. Their `CONTRIBUTING.md` asks for **human-written, informal** text and says *"do not have AI artificially expand what you'd like to do into a formal proposal"* — so these are checklists of evidence to be rewritten in the sender's own voice, never pasted |

## House rules

1. **Every claim about QM cites a file and line.** Upstream moves daily; a claim
   without a citation has already rotted. Line numbers here were read at
   `ai-base` commit `7f2c916`.
2. **Reading is not running — say which.** Claims are marked **[read]** (from
   source) or **[ran]** (observed executing). Added 2026-08-01, after the first
   pass of these documents was written from reading alone and turned out to hold
   seven material errors, two already hardened into an ADR. The correction is in
   [02 § What running it changed](02-ai-base.md#what-running-it-changed).
3. **A gap is stated as a gap**, in the present tense. No aspirational voice.
4. **Measured beats argued.** A design that claims an advantage names the
   measurement that would falsify it, and prefers an *existing* instrument to a
   new one — a fresh scale is how a benchmark ends up flattering its author.
5. **A sketch is marked as a sketch.** Where a specification is drawn rather than
   described — `ai-storage` on the desk — the drawing says so on its own face,
   not in a caption. A surface that renders a sketch like measured state teaches
   its reader to trust both equally.
