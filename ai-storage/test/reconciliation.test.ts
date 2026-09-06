/**
 * What the store looks like after a verdict — the fixture the component did not have.
 *
 * `test/agents.test.ts` asserts what `reconcile()` *returns*. Nothing asserted
 * what the store *becomes*, and those are different claims: the agent can answer
 * correctly while the write path files the result wrongly, and no test would
 * have failed. `NEXT.md` §7 named this gap and it is the cheapest unmet item in
 * the component.
 *
 * The branch that matters is `conflict`. `same` losing a note would be noticed;
 * a store that quietly resolves a contradiction would not, because the result
 * looks exactly like a store that never received one. So the assertion here is
 * not only that the conflict is recorded — it is that **neither note was
 * touched**: nothing superseded, nothing withdrawn, no winner picked.
 *
 * These run against a real filesystem for the same reason `store.test.ts` does.
 * The model is scripted, because what is under test is the code around it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { approxCounter } from "../src/context/budget.ts";
import { keepSource } from "../src/agents/memory-keeper.ts";
import { FileStore } from "../src/backend/filesystem.ts";
import { NoteRepository } from "../src/knowledge/repository.ts";
import type { LocalModel, StructuredResult } from "../src/model/local-model.ts";
import type { Scope } from "../src/knowledge/schema.ts";

const SCOPE: Scope = { type: "project", id: "demo" };
const AT = "2026-08-24T10:00:00.000Z";

const TEXT =
  "A".repeat(120) +
  " the build fails under Node 20 because package X requires Node 22. " +
  "B".repeat(200);

/** A model that returns the scripted values in order, repeating the last. */
function scripted(values: unknown[]): LocalModel {
  let i = 0;
  return {
    describe: { engine: "scripted", baseUrl: "none", model: "scripted" },
    async structured<T>(): Promise<StructuredResult<T>> {
      const v = values[i++] ?? values[values.length - 1];
      return {
        value: v as T,
        usage: {
          promptTokens: 1,
          reasoningTokens: 0,
          completionTokens: 1,
          latencyMs: 1,
          timeToFirstTokenMs: null,
        },
      };
    },
  } as unknown as LocalModel;
}

/** One proposal, citing bytes that really are in `TEXT`. */
const note = (title: string, claim: string, from: number, to: number) => ({
  notes: [{ title, type: "constraint", claim, keywords: ["node", "build"], source: { artifact: "a.md", from, to } }],
});

const FIRST = note("Node 22 is required", "The build fails under Node 20; package X requires Node 22.", 0, 120);
const SECOND = note("Node 20 is enough", "The build succeeds under Node 20 since package X was replaced.", 120, 240);

async function fresh() {
  const dir = await mkdtemp(join(tmpdir(), "ai-storage-reconcile-"));
  const store = new FileStore(dir);
  await store.init();
  const repo = new NoteRepository(store);
  await store.writeText("projects/demo/sources/a.md", TEXT);
  const run = (model: LocalModel) =>
    keepSource("a.md", TEXT, [], {
      repository: repo,
      reader: store.sourceReader("projects/demo"),
      scope: SCOPE,
      model,
      counter: approxCounter,
      now: () => AT,
      chunkBytes: 10_000,
    });
  return { dir, repo, run };
}

/** Seed the store with one note and hand back its id. */
async function seeded() {
  const f = await fresh();
  const report = await f.run(scripted([FIRST, { action: "new" }]));
  assert.equal(report.created, 1, "the seed must create exactly one note");
  const ids = await f.repo.ids(SCOPE);
  assert.equal(ids.length, 1);
  return { ...f, first: ids[0]! };
}

test("`same` keeps the older note and writes nothing new", async () => {
  const { dir, repo, run, first } = await seeded();

  const report = await run(scripted([SECOND, { action: "same", existing: first }]));

  assert.equal(report.duplicates, 1);
  assert.equal(report.created, 0, "a duplicate must not reach the store");
  assert.deepEqual(await repo.ids(SCOPE), [first], "the store still holds exactly the older note");
  assert.equal((await repo.get(SCOPE, first))!.state, "active");

  await rm(dir, { recursive: true, force: true });
});

test("`supersedes` keeps the old note readable, pointing forward", async () => {
  const { dir, repo, run, first } = await seeded();

  const report = await run(scripted([SECOND, { action: "supersedes", existing: first, reason: "package X was replaced" }]));

  assert.equal(report.superseded, 1);
  const ids = await repo.ids(SCOPE);
  assert.equal(ids.length, 2, "superseding adds a note, it does not replace one");
  const second = ids.find((id) => id !== first)!;

  const older = await repo.get(SCOPE, first);
  // Readable, not deleted: a superseded note that cannot be fetched is a
  // rewritten history, which is the one thing this store promises never to do.
  assert.ok(older, "the superseded note is still readable");
  assert.equal(older!.state, "superseded");
  assert.equal(older!.relations.supersededBy, second, "and it points forward to what replaced it");

  const newer = await repo.get(SCOPE, second);
  assert.equal(newer!.state, "active");
  assert.ok(newer!.relations.supersedes.includes(first), "the link is recorded from both ends");

  await rm(dir, { recursive: true, force: true });
});

test("`conflict` keeps both notes active and picks no winner", async () => {
  const { dir, repo, run, first } = await seeded();

  const report = await run(
    scripted([SECOND, { action: "conflict", existing: first, reason: "two runs, two versions of package X" }]),
  );

  assert.equal(report.conflicts, 1);
  const notes = await repo.all(SCOPE);
  assert.equal(notes.length, 2);

  // The assertion this whole file exists for. A store that resolves a
  // contradiction by demoting one side is indistinguishable, afterwards, from a
  // store that was never given one.
  for (const n of notes) {
    assert.equal(n.state, "active", `${n.id} must stay active`);
    assert.equal(n.relations.supersededBy, undefined, `${n.id} must not have been superseded`);
    assert.deepEqual(n.relations.supersedes, [], `${n.id} must not claim to supersede anything`);
  }

  const conflicts = await repo.conflicts(SCOPE);
  assert.equal(conflicts.length, 1);
  const second = notes.map((n) => n.id).find((id) => id !== first)!;
  assert.equal(conflicts[0]!.a, first);
  assert.equal(conflicts[0]!.b, second);
  assert.match(conflicts[0]!.why, /package X/, "the explanation is kept, not just the fact of disagreement");

  await rm(dir, { recursive: true, force: true });
});

test("a verdict naming a note that does not exist changes nothing", async () => {
  const { dir, repo, run, first } = await seeded();

  // `reconcile()` already downgrades an invented id to `new`; this asserts the
  // consequence at the store, which is where it would actually do damage.
  const report = await run(scripted([SECOND, { action: "supersedes", existing: "kn_invented_00000000" }]));

  assert.equal(report.superseded, 0);
  assert.equal((await repo.get(SCOPE, first))!.state, "active", "the real note was left alone");

  await rm(dir, { recursive: true, force: true });
});
