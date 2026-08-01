# ADR-0001 · Vendor QM as a subtree rather than depend on `@yc-software/qm`

- **Date:** 2026-08-01
- **Status:** Accepted
- **Decided by:** Matias Molinas

## Context

ai-os builds on QM. QM offers two consumption models:

1. **The intended one.** A deployment repository that depends on the
   `@yc-software/qm` npm package and wires substrates in one file
   (`src/wiring.ts`, 1,427 lines). Company-specific code lives outside the core.
2. **A copy.** Vendor the source and evolve it.

Option 1 is genuinely well built. Verified seams: `MemoryService`
(`src/memory/memory-service.ts:28`), the plugin chassis (`plugins/chassis`,
plugins never import core), and `Harness` (`src/harness/harness.ts:167`). Two of
our four pillars — `ai-storage` and `ai-ui` — fit through those seams with **no
core modification at all**.

The third does not. `ai-flows` needs new tables, a new service inside core, and
new API routes; there is no workflow engine to extend (`src/processes/` is
sandbox process reaping, not workflow). `ai-storage` additionally needs two new
members in a closed union (`src/types.ts:12`).

QM is 3 days old, ~72,000 lines, pushed daily, 3,473 stars and rising.

### A third option, found after the fact

QM ships an **officially supported private-fork model** — discovered while
vendoring, not from the README. `ai-base/deploy/layers/README.md` and three
bundled Claude Code skills (`.claude/skills/update-qm`, `upstream-pr`,
`dev-instance`) define it:

> a standalone private repository whose history begins as a clone of qm, in which
> core stays identical to upstream and everything organization-specific is
> confined here, under `deploy/layers/<org>/`

with `update-qm` merging upstream in (**merge, never rebase** — `origin/main` is
published history) and `upstream-pr` scrubbing org context on the way out.

This is better than we assumed and it changes the honest framing of this ADR: we
are not choosing between "their way" and "a fork", we are choosing **which
fork**. But the layer boundary covers *deployment* material — config, sandbox
tools, org plugin images, infrastructure. It does not accommodate a new core
service. `ai-flows` lands in `src/`, which their model requires to stay identical
to upstream. So the divergence is real under either option.

Two consequences we adopt regardless:

- `ai-ui` is an **org plugin**, and `deploy/layers/evolvingagents/plugins/` is
  its sanctioned home.
- ai-os deployment material goes in `deploy/layers/evolvingagents/`, generated
  with `qm init`, not hand-built.

## Decision

**Vendor QM into `ai-base/` via `git subtree`**, tracking
`yc-software/qm@main`, pulled weekly with `--squash`.

## Consequences

**We accept:**

- **Merge burden forever.** A daily-moving upstream and a divergent core means
  regular conflict resolution. This is the real price and it is not small.
- **We are not a QM deployment.** We do not get their deployment tooling path for
  free, and `qm init` is not our install story.
- **Their fork tooling does not work as shipped.** `update-qm` and `upstream-pr`
  assume the repository *root* is qm and dispatch on `git remote -v`. Under a
  subtree, qm's root is `ai-base/` and our remote is not a qm fork, so both
  skills misread the situation. We use `git subtree pull` instead and follow
  `upstream-pr`'s **scrub discipline by hand** — its warning that an upstream
  push is permanent and reachable by SHA even after a force-push applies to us
  exactly as much.

**We gain:**

- Full control over the evolution, which was the explicit requirement.
- The ability to cut into core for `ai-flows` without negotiating a design with
  an upstream that takes contributions as hand-written prose and moves daily.
- A real upstream remote: `git subtree pull` is a genuine merge, not a
  re-download, so this is not a one-way snapshot.

**We mitigate:**

- **Minimal-diff rule.** Anything buildable against a seam is built against the
  seam, even when editing core is faster. Every line in `ai-base/src/` is merged
  by hand forever.
- **`ai-base/AI-OS-PATCHES.md`** records every modification: what, why,
  upstreamable or not. This is the conflict-resolution map at pull time.
- **New tables only, `flow_` prefixed.** Never alter an upstream table.
- **Upstream what belongs upstream**, as human-written text in their `adrs/`
  format. First candidate: session fork lineage.
- **Exit stays open.** If core modifications shrink toward zero, converting to a
  deployment repository (option 1) is a live option — recorded in
  [06-licensing](../06-licensing.md#if-we-ever-want-to-stop-being-a-fork).

## Alternatives rejected

**Deployment repository (option 1).** Rejected because `ai-flows` cannot be built
through the seams, and it is the pillar that justifies the project. Reconsider if
that stops being true.

**Hard fork, no upstream tracking.** Rejected: it turns a 3-day-old, fast-moving
base into a dead snapshot within weeks, and forfeits the upstream's work for no
gain over a subtree.

**QM's own private-fork model** (clone at the repository root, org material in
`deploy/layers/<org>/`, sync with `update-qm`). Genuinely attractive: it is
supported, tooled, and upstream keeps it working. Rejected for one reason — it
puts qm at the repository root, so `ai-flows`, `ai-ui`, `ai-storage` and `doc`
become subdirectories of QM rather than peers of it. That inverts what ai-os is:
the base would be the project and our four pillars its customization.

**This is the closest call in this ADR and the most likely to be revisited.** If
core divergence stays small, their model is better than ours and switching costs
one repository move. Re-evaluate at [M2](../08-roadmap.md) once the real size of
`ai-flows`' core footprint is known rather than estimated.

**Contributing `ai-flows` upstream instead.** Not rejected — deferred. It cannot
be proposed until it exists and is shown to work, and their contribution process
is prose-first for exactly that reason. If they want it later, that is a good
outcome.
