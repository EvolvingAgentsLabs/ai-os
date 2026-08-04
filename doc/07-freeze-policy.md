# 07 · Freeze policy

<img src="assets/07-freeze-policy.jpg" alt="" width="100%">

<sub>Twenty-one archived. One still warm.</sub>


ai-os is the organisation's primary project. Everything else is frozen. This
document defines what "frozen" means operationally, because an undefined freeze
is indistinguishable from abandonment six months later — and this organisation
has a documented habit of leaving repositories describing software that stopped
being true.

## Actual state — `EvolvingAgentsLabs`, 2026-08-01

**28 repositories. 21 are already archived.** The freeze is much smaller than it
sounds; most of it happened in the July portfolio audit.

Live today:

| Repo | ★ | What to do |
|---|---:|---|
| `evolving-agents` | 452 | **Freeze** — the outgoing flagship, and the only one with real reach |
| `skillos` | 54 | **Freeze** |
| `gemma4nanoloop` | 0 | **Freeze** |
| `evolvingagentslabs.github.io` | 0 | **Keep live** — org site, must point at ai-os |
| `.github` | 0 | **Keep live** — org profile, must point at ai-os |

The remaining 21 are archived already and need only the header from step 1 if
they do not have it.

## The three states

Every repository is in exactly one, and it is visible from the front page.

### `ACTIVE`
Developed. Today: `ai-os` only, plus the two org-presence repositories.

### `FROZEN`
Not developed; **still true**. It runs, its README describes what it actually is,
and it is kept because someone might read it or lift from it. Archived on GitHub
(read-only), with a header at the top of the README.

### `SUPERSEDED`
Frozen, and its idea now lives in ai-os. Same as frozen, plus the README says
where the idea went and why.

There is no fourth state for "we might come back to it". That state is
`FROZEN`, and returning means an explicit decision, not a lapsed intention.

## Freezing, step by step

**1. Header at the very top of the README** — above the title, first thing anyone
sees:

```markdown
> **FROZEN — 2026-08-01.** Not under development. This repository is kept
> because it is still true, not because it is maintained.
> The organisation's active work is [ai-os](https://github.com/EvolvingAgentsLabs/ai-os).
> Last verified: 2026-08-01.
```

For `SUPERSEDED`, add one line: *"The idea behind X now lives in ai-os as
`ai-flows` — see `doc/03-ai-flows.md`."*

**2. Make the README true before freezing it.** A repository is frozen in the
state it is read in, forever. If the README promises something that was deleted,
fix it *now* — after archiving, nobody will.

This is the step that actually matters and the one that gets skipped. It is
non-negotiable for `evolving-agents`, which has 452 stars and an unfinished
milestone advertised in its `PLAN.md`.

**3. Close or convert open issues and PRs.** An open PR against an archived repo
is a promise nobody can keep.

**4. Archive on GitHub.**

```bash
gh repo archive EvolvingAgentsLabs/<name> --yes
```

**5. Record it** in the table below, in this file, in the same commit.

## Repository-specific notes

### `evolving-agents` (452★) — `SUPERSEDED`, and the one to be careful with

The organisation's only repository with real reach. Three things must be true
before it is archived:

1. **`PLAN.md` currently advertises M1 (merge across sessions) as "not started,
   and the reason this repo exists".** Freezing with that sentence live leaves a
   repository whose own plan says its purpose is unfulfilled. Rewrite it to say
   the work moved to ai-os as flow lineage ([03-ai-flows](03-ai-flows.md)).
2. **`agentvcs` is published on PyPI, or the README stops implying it.** A frozen
   repository must not point at an install that 404s.
3. **The header links to ai-os.** 452 stars is the audience for the new project;
   this is the only real distribution channel the organisation has.

### `skillos` (54★) — `FROZEN`
Two open PRs (#15 HWM planning, #16 auto-improve) to close before archiving.

### `gemma4nanoloop` — `FROZEN`
Small, no dependents. Header and archive.

### `evolvingagentslabs.github.io` and `.github` — stay `ACTIVE`
Not frozen: they are how the organisation is read. Both must lead with ai-os.
Leaving the site pointing at a frozen flagship is worse than having no site.

### The 21 already archived
Header only, and only where it is missing. Do not un-archive to add a header —
the header can wait for a batch pass, or be skipped for the 0★ ones.

## Unfreezing

Requires an ADR in `ai-os/doc/adr/` stating what changed. Not a mood.

## Ledger

Updated in the same commit as each freeze.

| Repo | State | Frozen on | Idea moved to | Done by |
|---|---|---|---|---|
| `evolving-agents` | SUPERSEDED | 2026-08-01 | ai-os · `ai-flows` (lineage) | matiasmolinas |
| `skillos` | FROZEN | 2026-08-01 | ai-os · `ai-flows` | matiasmolinas |
| `gemma4nanoloop` | FROZEN | 2026-08-01 | — | matiasmolinas |

26 of 29 org repositories are archived. Live: `ai-os`, the site, `.github`.
