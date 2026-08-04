# Assets — and which of these carry a claim

Two kinds of file live here, and the difference matters more than it looks.

## Computed — these carry data

| File | Made by | Source of truth |
|---|---|---|
| `noise-floor.svg` | a script, from the real functions | `ai-flows/src/observability.ts` — `channelCapacity`, `detectionProbability` |
| `social-preview.svg` / `.png` | hand-authored vector | itself — 1280×640, GitHub's social-preview size |

**Every quantitative figure in this repository is generated from the code it
describes, and never drawn.** A plotted curve is an assertion; if it were drawn
by hand or by an image model it would be a plausible-looking assertion nobody
checked. `noise-floor.svg` is $C(\delta)$ and $(1-\delta)^w$ evaluated at 301
points by the same functions the tests cover.

If those functions change, this figure is stale and must be regenerated. It is
not decoration and it does not get to drift.

## Generated — these carry nothing

| Files | Made by |
|---|---|
| `icon.png`, `hero.jpg`, `00-…` through `10-…jpg` | Gemini `gemini-3-pro-image`, from prompts in a shared visual grammar |

Identity and atmosphere only. **No generated image in this repository states a
number, plots an axis, or labels a mechanism** — the prompts forbid text and
forbid anything resembling plotted data, for the same reason the section above
exists. An image model produces convincing curves that are wrong, and this
project's documents are not the place to find out.

Read them as covers, not as diagrams. Everything load-bearing is in the prose,
the tables, and the code.

## The visual grammar

Near-black `#0B0D0F`, warm off-white `#F2EFE9`, amber `#E8A33D`, muted teal
`#4A7C7E`. Flat geometry — threads, nodes, plates, grids — in the register of a
scientific instrument plate. Amber marks the one thing under discussion; teal
marks the base; off-white is everything else.

The icon is the whole project in one mark: **a thread crossing a seam without
breaking.** The seam is the interruption — a restart, a compaction, a week's
gap, a handoff to someone else. The thread is the flow, and it is still there on
the other side. That is the entire claim ai-os is making.

## Regenerating

Assets are shared between `doc/` and `doc/es/`; the Spanish documents reference
`../assets/`. There is no second copy to keep in sync, on purpose.
