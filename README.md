<img src="doc/assets/icon.png" alt="" width="76" align="left" hspace="14">

# ai-os

**An agent-based operating system**, built on [QM](https://github.com/yc-software/qm).

Work outlives the conversation. Agents and their sub-agents are markdown files in
a project's own folder. The interface is a desk you arrange, not a chat log. And
every claim about whether that helps has a measurement attached — including the
ones that came back saying it did not.

### → **[evolvingagentslabs.github.io](https://evolvingagentslabs.github.io/)** — what it is, and a desk you can use in the browser

<a href="https://evolvingagentslabs.github.io/demo/"><img src="doc/assets/manual/09-desk.jpg" alt="The desk: flows as documents, agents as cubes stacked on them" width="100%"></a>

<sub><b><a href="https://evolvingagentslabs.github.io/demo/">Try the desk →</a></b> The real interface with a simulated backend. Nothing installed, nothing spent.</sub>

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

`ai-base`, `ai-flows` and `ai-ui` run — **532 tests of our own**, on top of the
3,768 `ai-base` carries from upstream. `ai-storage` is specified and not built,
though the first piece of its argument now runs inside `ai-flows`: a project
knowledge base an eight-thousand-token window can navigate — a flat file of the
same material stops fitting at 16 units, the index is still at 4,523 of 8,000
tokens at 2,000 ([05](doc/05-ai-storage.md)).

Nothing in this repository describes software that exists unless it says so, and
every screenshot is from a live instance.

## Layout

| | | |
|---|---|---|
| [`ai-base/`](ai-base/) | QM, vendored as a subtree and pulled weekly | MIT, upstream's |
| [`ai-flows/`](ai-flows/) | Flows, composition, the measurement harness, the knowledge base and the [system agents](ai-flows/agents/system/memory/) | Apache 2.0 |
| [`ai-memory/`](ai-memory/) | The memory agents, as a tree that runs as a tree | Apache 2.0 |
| [`ai-ui/`](ai-ui/) | The desk | Apache 2.0 |
| `ai-storage/` | Not built | — |

`ai-base/` stays byte-identical to upstream. Anything we change there needs a
line in [`ai-base/AI-OS-PATCHES.md`](ai-base/AI-OS-PATCHES.md), and CI enforces
it. Full terms: [licensing](doc/06-licensing.md).

## Languages

English is canonical. Every document has a Spanish mirror in
[`doc/es/`](doc/es/); when they disagree, the English one is right.

---

The primary project of [Evolving Agents Lab](https://github.com/EvolvingAgentsLabs).
Everything else in the organisation is frozen — [why](doc/07-freeze-policy.md).
