# ai-memory

The memory agents, as a tree that actually runs as a tree.

## Why this package exists

The memory agents are a **tree**: a keeper that routes, and five specialists that
each need a different prompt and a different tool surface. The harness the rest
of ai-os runs on cannot execute that shape, and the reason is structural rather
than a missing feature — a delegated child is built without `runChild`, so an
agent cannot delegate to its own subagent. `ai-flows/src/compose.ts` therefore
flattens a declared tree into a flat sequence, and a system agent reached from a
project scope is marked `inline`: its instructions are pasted into the parent's
context, with no isolated window and no tool narrowing
([doc/12](../doc/12-conformation.md)). `ai-base` is a subtree that stays
byte-identical to upstream, so none of that is ours to fix.

[eve](https://github.com/vercel/eve) runs exactly this shape: declared subagents
nest to whatever depth the directory tree has, each is discovered as its own
agent root inheriting nothing, and each starts with fresh history and fresh
state. **Verified rather than assumed** — one delegation produced a child session
id distinct from its parent's, and the child returned the decision its own
instructions describe.

This is not a migration of ai-os onto eve. It is one package, for the one tree
that needs real delegation.

## What did not change, which is the point

- **The instructions are still markdown.** All six `instructions.md` files were
  ported from `ai-flows/agents/system/memory/` without a word changed; only the
  frontmatter became `agent.ts`, which is where eve expresses the same thing.
- **The mechanics are still ours.** Every tool imports
  [`ai-flows/src/wiki.ts`](../ai-flows/src/wiki.ts) — the module where the
  capacity claim is measured and the tests live. A second `addNote` here would be
  a second answer to the question those tests exist to settle.

So eve supplies exactly one thing: delegation. Everything else stayed where it
was already tested.

## Layout

```
agent/
  agent.ts                 MemoryKeeper: the model, and nothing else
  instructions.md          what it routes, and in what order
  lib/model.ts             which provider — google | openrouter | compatible
  lib/store.ts             the wiki on disk, over ai-flows' module
  tools/wiki_lint.ts       what code can decide about the wiki, decided by code
  subagents/
    archivist/             what is this material, what is one unit of it
    indexer/               root + shard + window -> one note   (+ its own tools)
    reconciler/            same idea? which is canonical? what does each add?
    coverage-auditor/      what is in the index with no realisation in the work
    librarian/             given a task, which notes to open   (+ its own tools)
```

Tools live beside the subagent that may call them. That is the narrowing the
other harness could not express: the librarian can filter the index and cannot
write to it, and this is enforced by where the file is rather than by asking.

## Running it

```bash
npm install && npm run build

OPENROUTER_API_KEY=... AI_OS_PROVIDER=openrouter \
AI_OS_MODEL=google/gemini-3.5-flash-lite \
EVE_DEV=1 PORT=2000 node .output/server/index.mjs

curl -X POST http://127.0.0.1:2000/eve/v1/session \
  -H 'content-type: application/json' -d '{"message":"..."}'
```

`AI_OS_PROVIDER` is `google` (direct AI SDK provider), `openrouter`, or
`compatible` (any OpenAI-compatible `AI_OS_BASE_URL`). The model is a variable
because the tree's argument is about shape, not about any particular model —
[doc/11](../doc/11-choosing-a-model.md) is where a model choice gets argued.

## What is not settled

The capacity benchmark in [doc/05](../doc/05-ai-storage.md) was measured against
an 8,000-token window. Against a model with a million-token context the material
fits, and that benchmark stops binding — the index has to be re-argued on cost
per query and on grounding each idea, which is a different measurement and one
that has not been run. Stated here rather than left for a reader to notice.
