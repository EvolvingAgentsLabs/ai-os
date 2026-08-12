/**
 * The one place the wiki lives, and the one place it is loaded from.
 *
 * The mechanics are `ai-flows/src/wiki.ts` — imported, never reimplemented. That
 * module is where the capacity claim is measured and where the tests live, and a
 * second copy of `addNote` here would be a second answer to the question those
 * tests exist to settle.
 *
 * What this file adds is the only thing the tools need and the module does not
 * have: somewhere to put it. A wiki on disk, as the markdown a person reads plus
 * the JSON mirror a tool reads, under the project's own knowledge folder.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type Note,
  type Wiki,
  addNote,
  emptyWiki,
  mirror,
  noteMarkdown,
  rootMarkdown,
  shardMarkdown,
} from "../../../ai-flows/src/wiki.ts";

/** Where a project's knowledge base lives. One folder, per project, on disk. */
export const wikiRoot = (project: string): string =>
  join(process.env.AI_OS_PROJECTS ?? "projects", project, "knowledge", "wiki");

const mirrorPath = (project: string) => join(wikiRoot(project), "wiki_index.json");

const write = (path: string, body: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
};

/**
 * Load from the mirror rather than by parsing the markdown.
 *
 * The mirror exists precisely so that no tool has to parse markdown, and a
 * loader that parsed it anyway would make the mirror decorative — and then let
 * the two drift, with the markdown right and the tools wrong.
 */
export function load(project: string): Wiki {
  try {
    const raw = JSON.parse(readFileSync(mirrorPath(project), "utf8"));
    return { shards: raw.shards ?? [], notes: raw.full ?? {} };
  } catch {
    return emptyWiki();
  }
}

/**
 * Write everything the change touched, and nothing it did not.
 *
 * The markdown is what a person and a model read; `wiki_index.json` is what a
 * filter reads. Both are regenerated from the same in-memory wiki in the same
 * call, because the failure this avoids is the pair disagreeing — which is
 * invisible until somebody trusts the wrong half.
 */
export function save(project: string, wiki: Wiki, note: Note): void {
  const root = wikiRoot(project);
  write(join(root, "INDEX.md"), rootMarkdown(wiki));
  for (const shard of wiki.shards)
    write(join(root, "indices", `${shard.id}.md`), shardMarkdown(wiki, shard.id));
  write(join(root, "notes", `${note.id}.md`), noteMarkdown(note));
  // `full` carries the notes the loader needs; the rest is the machine mirror
  // the module defines, kept in the same file so a reader has one thing to open.
  write(
    mirrorPath(project),
    JSON.stringify({ ...mirror(wiki), full: wiki.notes }, null, 2),
  );
}

export { addNote };
