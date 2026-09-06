> **MOVED — 2026-09-06.** `ai-os` now lives inside
> **[evolving-agents](https://github.com/EvolvingAgentsLabs/evolving-agents)**,
> at [`ai-os/`](https://github.com/EvolvingAgentsLabs/evolving-agents/tree/main/ai-os),
> with this repository's full history carried across as a subtree.
>
> That repository was frozen in August pointing here; the pointer and the
> destination are one repository again. `agentvcs` and the memory package were
> already there, so this finishes a consolidation rather than starting one.
>
> **This repository is read-only from now on.** It is kept because its commit
> history is referenced from the documents, not because anything will land here.
> Open issues and pull requests against `evolving-agents`.

<img src="doc/assets/icon.png" alt="" width="76" align="left" hspace="14">

# ai-os

**Why another agent framework?** It isn't one.

> Everyone can generate. Almost nobody can tell you, six months later, whether the
> number in their README is still the number their code produces — **and prove it
> to a stranger.**

ai-os is the layer that makes agent work checkable by something that is not
another model, and keeps it checked. It is
**an agent-based operating system**, built on [QM](https://github.com/yc-software/qm),
and the operating-system part is *how*; the sentence above is *why*.

| | |
|---|---|
| **Truth from outside the code** | `truth/` must not import `src/`. The value a gate checks **cannot be produced by the code under test** |
| **A kernel that ignores the language of the work** | Python writes a JSON gate report; a TypeScript kernel parses, summarises and decides, and runs nothing |
| **"Did not run" is not "passed"** | the freeze verdict returns `blockers` and `unknown` separately and refuses on either |
| **Attestation, not assertion** | content-addressed runs, a hash-chained ledger, `make reproduce`, and the environment recorded in the artifact |
| **Every published number tied to its producer** | five of the nine numbers on this page and in `doc/` are checked against the artifact that produced them, nightly |

**And the honest limit of "prove it to a stranger", since this page makes the
claim.** A hash chain inside our own repository demonstrates **integrity** —
nobody changed the number after the fact. It does not demonstrate **truth**: a
92% computed by buggy code has perfect cryptographic integrity. What narrows the
gap here is not the hash. It is that the checker cannot import the thing it
checks, the threshold was written down before the run, and `make reproduce`
re-derives the artifact somewhere that has never seen it — which is how
`hemo-verified` found a per-oracle number that was a property of its machine
rather than of the physics. What would *close* it is signing the gate reports as
in-toto attestations through Sigstore into a transparency log, so a third party
need not trust the author of this README either. That is not built. See
[the evidence layer](https://evolvingagentslabs.github.io/#evidence).

**The strong version of that argument is false and we are the ones who measured
it.** `physics-verifiers` gave a frontier model twelve fabricated physics results
and nine subtly defective ones. It caught **all of them, twice**
([results](https://github.com/EvolvingAgentsLabs/physics-verifiers/blob/main/experiments/judge_vs_physics/RESULTS.md)).
So the claim is narrower, and it is the part that survives: **a model can judge a
task but cannot generate one with a known answer** — you do not create truth by
asserting it — and **a judge that is right every time still hands you no ledger,
no freeze and no reproduction command.**

**What it is worth, measured rather than argued.** The checkers were finished on
2026-08-23 and run by somebody who had never run this system. In one day they
found a published count wrong in thirteen places for six days; an **attested
report that could not have been produced by the code committed beside it**; a
statistic that moves with a library version rather than with the data; a
transposed table nobody had compared to its own artifact; and a defect in the new
instrument itself. Neither project could be started from its own documentation.
None of it was reachable by reading — [19 §7](doc/19-what-would-make-this-matter.md#7--what-running-p0-found-on-the-same-day).

**And the workload that makes it real.** `projects/coclea-sr` took a 1995
biophysics hypothesis from mathematics, through a **falsification of its own
model**, to a gated set of falsifiable statements about ear disease and its
treatment — **28 gates / 135 checks, all green [ran]**. The whole arc, and what it
does **not** show, is [doc 18](doc/18-from-a-hypothesis-to-a-therapeutic-surface.md).

Work also outlives the conversation: agents and their sub-agents are markdown
files in a project's own folder, and the interface is a desk you arrange rather
than a chat log. Every claim about whether *that* helps has a measurement
attached too — including the ones that came back saying it did not.

### → **[evolvingagentslabs.github.io](https://evolvingagentslabs.github.io/)** — what it is, and a desk you can use in the browser

<a href="https://evolvingagentslabs.github.io/demo/"><img src="doc/assets/manual/09-desk.jpg" alt="A grid of coloured squares: one row per flow, left to right is time, and each square is one flow in one bucket of time held by one agent or person" width="100%"></a>

<sub><b><a href="https://evolvingagentslabs.github.io/demo/">Open the demo →</a></b> <b>One row is one flow, left to right is time, and now is the right edge.</b> Every square is one flow in one bucket of time held by somebody, so reading across a row is the sequence of hands a thought passed through and reading down a column is who was busy at that moment. <b>Colour is who held it</b> — identity, never how it went. <b>Texture is what happened</b>: solid carried, faint carried nothing forward, hollow held with no verdict, dashed not begun, barred ran and did not pass.<br><br><b>An empty slot is not a zero.</b> A bucket with nothing written down in it draws no square, because ‘nothing was recorded’ and ‘nothing happened’ are different claims and only one of them is ours to make — a contribution grid can use its palest shade for a quiet day because a repository knows what it does not contain, and this does not. A row whose work continues past the edge says so with a chevron.<br><br><b>Click any square</b> and the panel reads it, or asks an agent to: every finding carries the address it read, and one with no address is not renderable. <code>INSPECTOR</code>, a system agent with one tool (read), attaches to any flow. <b>Two motions, two meanings.</b> The canvas drifts left always, because the clock is running — unconditionally true. A square breathes <i>only</i> where a step is open right now.<br><br>Zooming out merges squares rather than shrinking them: below about nine pixels a square stops being something you can point at, so the bucket widens instead and the header says how long a square now covers. Four scopes, all real — <b>coclea-sr</b> (a gate that measured 2.592e-4 against a tolerance of 1.0e-4), <b>hemo-verified</b> (no closed form, so the judge itself is measured at 0.9056), and two that each carry a flow which is green and wrong. <b>The orchestration is simulated</b>; the numbers come from the projects’ own artifacts, and <a href="scripts/check-demo-provenance.py"><code>check-demo-provenance.py</code></a> fails the build if any stops matching. To re-derive them yourself: <b><a href="https://evolvingagentslabs.github.io/verify/">the verification page</a></b>.</sub>

## Run it

Three processes. The [**manual**](doc/manual.md) has the whole sequence with
screenshots; the short version:

```bash
cd ai-base  && npm ci && node --env-file=.env src/index.ts   # core        :8080
cd ai-flows && node --env-file=../ai-base/.env scripts/serve.ts  # flows   :8097
cd ai-ui    && node scripts/serve.ts                         # the desk    :8098
```

Español: [Correr ai-os](doc/es/manual.md).

## Documentation

| | |
|---|---|
| [**Manual**](doc/manual.md) | Running it, gesture by gesture, with screenshots from a live instance · [es](doc/es/manual.md) |
| [**Specifications**](doc/) | One document per pillar and per problem. These are the specs the code follows |
| [**Decisions**](doc/adr/) | One file per architectural decision, superseded rather than edited |
| [**Next**](NEXT.md) | What to pick up next, and how to get the stack back up |

## State

All four pillars now run — **851 tests of our own**, on top of the 3,768
`ai-base` carries from upstream. `ai-storage` is built around a **local** model
held to 8,192 tokens on purpose: notes with verified provenance, a navigable
index that refuses to render a node over budget, five specialists, scopes,
promotion and history ([22](doc/22-ai-storage-qwen.md)).

**Its first benchmark came back against the design, and it is published because
that was the rule.** At the ceiling — a perfect navigator, no weights — a flat
memory file does not fit at any size (two hundred notes is already 12,566 tokens
against a lane of 2,300), and **exact lexical search beats the hierarchy the
component was built for**: 3/3 against 1–2/3, reading less to do it. `doc/05`
said the burden of proof was on the axis; this is the second flat result in that
direction. See [22 §59](doc/22-ai-storage-qwen.md#59) for the confounds, stated
rather than tuned away.

The model it is built around has **not been verified to exist** from the machine
that wrote this: every field in [`MODEL.json`](MODEL.json) says
`verified: false`, a test asserts they still do, and
`ai-storage/scripts/verify-model.ts` is the only thing that may say otherwise.

Both projects' evidence now runs **nightly** in
[`projects.yml`](.github/workflows/projects.yml) — the gates, the ledger, the
report hygiene, H0's reproduction, and every published number checked against the
artifact it came from. Until 2026-08-23 there was no Python in CI at all.

Nothing in this repository describes software that exists unless it says so, and
every screenshot is from a live instance.

## Layout

| | | |
|---|---|---|
| [`ai-base/`](ai-base/) | QM, vendored as a subtree and pulled weekly | MIT, upstream's |
| [`ai-flows/`](ai-flows/) | Flows, composition, the measurement harness, the knowledge base and the [system agents](ai-flows/agents/system/memory/) | Apache 2.0 |
| [`ai-memory/`](ai-memory/) | The memory agents, as a tree that runs as a tree | Apache 2.0 |
| [`ai-ui/`](ai-ui/) | The desk | Apache 2.0 |
| [`projects/`](projects/) | Work running **on** the OS. Two: [`coclea-sr/`](projects/coclea-sr/), Python, **28 gates / 135 checks**, and [`hemo-verified/`](projects/hemo-verified/), whose kill gate survived at AUC 0.906 | Apache 2.0 |
| [`ai-storage/`](ai-storage/) | The local model's memory: notes with verified provenance, a token-bounded index, five specialists, and the benchmark whose first result went **against** the design | Apache 2.0 |

`ai-base/` stays byte-identical to upstream. Anything we change there needs a
line in [`ai-base/AI-OS-PATCHES.md`](ai-base/AI-OS-PATCHES.md), and CI enforces
it. Full terms: [licensing](doc/06-licensing.md).

## Languages

English is canonical. Every document has a Spanish mirror in
[`doc/es/`](doc/es/); when they disagree, the English one is right. That sentence
was false for two documents until 2026-08-24, so
[`check-doc-mirrors.py`](scripts/check-doc-mirrors.py) now checks it, and a
document that is deliberately English-only has to say why.

---

The primary project of [Evolving Agents Lab](https://github.com/EvolvingAgentsLabs).
Everything else in the organisation is frozen — [why](doc/07-freeze-policy.md).
