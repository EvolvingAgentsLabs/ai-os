# ai-storage

Memory at four levels: system, user, project, flow — for a **local model with
8K of working context** operating on a project orders of magnitude larger.

> **Status: phases 1–8 built, 2026-08-24.** The model boundary, the local-only
> guarantee, the context invariant, the note schema, the provenance pipeline,
> derived progress, the token-bounded index, the store on disk, lexical search,
> all five specialists, scopes and ACLs, promotion and history, the
> navigation benchmark, and the end-to-end reconciliation fixture — 123 tests in this package. The benchmark has been run **at the ceiling
> only**: no weights, no server, no model result.
> Design: [`../doc/22-ai-storage-qwen.md`](../doc/22-ai-storage-qwen.md).
> Earlier design: [`../doc/05-ai-storage.md`](../doc/05-ai-storage.md);
> scope-kind decision: [ADR-0003](../doc/adr/0003-storage-scope-axis.md).

## Read this first

**The model this component is built around has not been verified to exist.**
`qwen3.8-27b`, its sizes, its licence and its capabilities were transcribed from
a specification onto a machine that cannot reach `huggingface.co`. Every field
in [`../MODEL.json`](../MODEL.json) says `verified: false`, a test asserts they
all still do, and `npm run verify-model` is the only thing that may say
otherwise — by asking a running server what it is serving.

The predecessor project measured a closely related idea — indexing memory on a
second axis — and it came back **flat: 80% acc@1 either way**. The second axis
was real information (`cosine = 0.753`); it just did not change the answer. So
**the burden of proof is on the hierarchy**, the benchmark ships whichever way
it comes out, and there are no embeddings in v1.

## The question

> How much capability can a good operating system recover by giving a
> relatively small local model better memory, navigation and tools?

That is [doc/11](../doc/11-choosing-a-model.md)'s interaction term, one layer
down. The number to beat is not *tokens the model supports*; it is

```text
Navigation Efficiency Ratio = corpus tokens / tokens the model actually loaded
```

at unchanged accuracy, against a flat `MEMORY.md` and against grep.

## The two rules everything else follows from

**The model decides meaning; code decides mechanics.** And the enforcement is
structural: `KnowledgeProposal` has no field for an id, a hash, a scope or a
timestamp, so a model cannot supply one. A prompt saying *do not invent ids* is
a request; a type with no id field is a wall.

**A read that does not fit is refused, never truncated.** Every number this
component produces is a ratio whose denominator is *tokens the model actually
had to see*. One silent trim anywhere and that denominator is fiction.

## The first result, and it is not the one the design wanted

**The hierarchy loses to grep at the ceiling.** A perfect navigator against
three arms, 8K of context, one unguessable fact planted per question:

```text
arm      notes  correct  ratio     endings
flat     50000  0/3      —         context_limit:3
search   50000  3/3      13158x    done:3
storage  50000  1/3      2391x     done:1 step_cap:2
```

The flat file does not fit at any size — not "answers worse", *refuses*, at two
hundred notes. Exact lexical search finds the answer every time and reads less
doing it. Hierarchical navigation runs out of steps.

`doc/05` said the burden of proof is on the axis; this is the second flat result
in that direction. It is a ceiling measurement with no model in it, and the
confounds are stated in [doc/22 §59](../doc/22-ai-storage-qwen.md#59) rather than
tuned away. `bench/results/oracle-ceiling.json` has every row.

## What is here

```text
src/model/       the boundary to llama.cpp and Ollama, and the local-only guard
src/context/     the 8K budget, in lanes, and the refusal that protects it
src/knowledge/   what a note is, what a model may propose, and the wall between
src/provenance/  evidence, slice hashes, and progress derived from what was stored
src/index/       the navigable tree, and the split that keeps every node in budget
src/backend/     the store on disk: atomic writes, a journal, paths as capabilities
src/search/      exact lexical search — no vector database in v1, on purpose
src/agents/      Librarian, Archivist, Indexer, Reconciler, MemoryKeeper
src/promotion/   flow → project → user/system, justified, recorded, reversible
src/security/    who reads what: outward only, and a note is not its source
src/bench/       the synthetic corpus, the three arms, and the metric
bench/           the runner, and results as they are produced
```

`bench/results/` holds what has actually been run. Nothing in it came from
weights.

## Running it

```bash
npm install
npm test          # 123 tests in this package, no server needed
node bench/navigation.ts --oracle   # the ceiling, no weights required
npm run typecheck
npm run verify-model            # asks a local server what it is serving
npm run verify-model -- --profile constrained --engine ollama \
  --base-url http://127.0.0.1:11434/v1
```

The reference server:

```bash
llama serve -hf <the GGUF repository>:Q4_K_M \
  --host 127.0.0.1 --port 8080 -c 8192
```

## Rules

- Implements QM's `MemoryService` (`ai-base/src/memory/memory-service.ts:28`) —
  all five required methods plus the revision family, because history is what
  makes promotion reversible.
- Promotion between levels is a `MemoryStrategy`, not a new subsystem.
- **No promotion without a record** (source, actor, timestamp, reason).
- **No durable note without evidence**, and the hash is of the cited slice, not
  of the file.
- Retrieval is level-ordered recall in v1. Machinery only after a written-down,
  measured insufficiency.
- The benchmark is published **whichever way it comes out.**
- Licensed Apache 2.0 (`SPDX-License-Identifier: Apache-2.0`).
