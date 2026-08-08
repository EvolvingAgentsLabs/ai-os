/**
 * Put this repository's own source where an agent can read it.
 *
 * The domain for a scenario set has to be one where the *first* answer is
 * contestable. Twelve arithmetic questions were not: the producer answered all
 * twelve in one step and the suite sat at the ceiling. Questions about a codebase
 * are contestable — they require reading the right file carefully, and a model
 * answering from plausibility gets them wrong in a way that is checkable.
 *
 * ## Why the org scope, and why `workspace.write`
 *
 * `ro-layers.ts` materialises **read-only layers only**, from the WorkspaceStore,
 * on every turn (`if (layer.mode === "rw") continue;`). So writing to the org
 * scope puts these files at `global/…` inside every scope's sandbox, reliably and
 * without a model touching them.
 *
 * The read-write path would need each file written *through a turn*, which means
 * a model reproducing four hundred lines exactly. That is expensive and it is a
 * transcription test, not a reading test.
 *
 *   cd ai-flows && node --env-file=/path/to/core.env scripts/seed-source.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";

const config = loadConfig();
const { workspace } = buildApp({ ...config, port: 0 });
const org = `org:${config.orgId}`;
const here = new URL("../src/", import.meta.url).pathname;

/** Small enough to read in one pass, and each carries a checkable fact. */
export const SEEDED = [
  "contribution.ts",
  "scenarios.ts",
  "evaluation.ts",
  "compose.ts",
  "core-client.ts",
  "types.ts",
];

await workspace.ensureScope(org);
for (const name of SEEDED) {
  const body = readFileSync(join(here, name), "utf8");
  await workspace.write(org, `source/${name}`, body);
  console.log(`  ok   source/${name}  (${body.split("\n").length} lines)`);
}
console.log(`\nreadable at global/source/ in every scope under ${org}`);
process.exit(0);
