/**
 * Reads delta-probe output and reports δ, capacity and detection probability.
 *
 * Every number here comes from src/observability.ts — the same functions the tests
 * cover and the same ones a flow engine would call. Nothing is recomputed locally,
 * so the report cannot drift from the implementation it is reporting on.
 *
 *   node scripts/delta-report.ts ../ai-base/out.json
 */
import { readFileSync } from "node:fs";
import { channelCapacity, detectionProbability, divergenceRate } from "../src/observability.ts";

interface Run {
  task: string;
  kind: string;
  status: string;
  ms: number;
  raw: string;
  normalized: string;
  extracted: string;
  extractedValue: string;
}

const GRAINS = ["raw", "normalized", "extracted"] as const;
const WINDOW = 3;

const doc = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as {
  model: string;
  provider: string;
  harness: string;
  runs: Run[];
};

const ok = doc.runs.filter((r) => r.status === "ok");
const tasks = [...new Set(ok.map((r) => r.task))];

const pct = (x: number) => (Number.isNaN(x) ? "  n/a" : `${(x * 100).toFixed(1)}%`.padStart(6));
const num = (x: number) => (Number.isNaN(x) ? " n/a" : x.toFixed(3));

/**
 * A measured δ of zero is not a δ of zero — it is a δ small enough to have hidden
 * in the sample. Each group of n identical-work samples offers n-1 chances to
 * differ after the first fixes the mode, so if none of them did, the 95% upper
 * bound on the per-draw divergence rate q solves (1-q)^Σ(n-1) = 0.05.
 *
 * Reported next to every zero, because "we saw none" and "there are none" are
 * different claims and only one of them is true here.
 */
function upperBound95(groupSizes: number[]): number {
  const trials = groupSizes.reduce((s, n) => s + Math.max(0, n - 1), 0);
  if (trials === 0) return Number.NaN;
  return 1 - Math.pow(0.05, 1 / trials);
}

console.log(`\nmodel     ${doc.model}   via ${doc.provider}, harness ${doc.harness}`);
console.log(`turns     ${ok.length} of ${doc.runs.length} ok`);
console.log(`window    w = ${WINDOW}\n`);

console.log("fingerprint    task        δ        C(δ) bits   (1-δ)^3   verdict");
console.log("─".repeat(74));

const pooled: Record<string, number> = {};
for (const grain of GRAINS) {
  // Each task is one group: identical work repeated, so every difference is noise.
  const groups = tasks.map((t) => ok.filter((r) => r.task === t).map((r) => r[grain]));
  for (const [i, t] of tasks.entries()) {
    const d = divergenceRate([groups[i]!]);
    const det = detectionProbability(d, WINDOW);
    const verdict = Number.isNaN(d) ? "" : det >= 0.05 ? "usable" : "cannot see a stuck flow";
    console.log(
      `${(i === 0 ? grain : "").padEnd(14)} ${t.padEnd(10)} ${pct(d)}   ${num(channelCapacity(d)).padStart(9)}   ${pct(det)}   ${verdict}`,
    );
  }
  const d = divergenceRate(groups);
  pooled[grain] = d;
  console.log(
    `${"".padEnd(14)} ${"POOLED".padEnd(10)} ${pct(d)}   ${num(channelCapacity(d)).padStart(9)}   ${pct(detectionProbability(d, WINDOW))}`,
  );
  console.log("─".repeat(74));
}

console.log("\ndistinct values observed, by fingerprint");
for (const t of tasks) {
  const rs = ok.filter((r) => r.task === t);
  const line = GRAINS.map((g) => `${g} ${new Set(rs.map((r) => r[g])).size}/${rs.length}`).join("   ");
  console.log(`  ${t.padEnd(10)} ${line}`);
}

console.log("\nextracted values, verbatim");
for (const t of tasks) {
  const vals = ok.filter((r) => r.task === t).map((r) => r.extractedValue);
  const counts = new Map<string, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  console.log(`  ${t}`);
  for (const [v, n] of [...counts].sort((a, b) => b[1] - a[1]))
    console.log(`    ${String(n).padStart(2)}x  ${v || "(empty)"}`);
}

const best = GRAINS.reduce((a, b) => (pooled[a]! <= pooled[b]! ? a : b));
console.log(`\nlowest pooled δ: ${best} (${pct(pooled[best]!)})`);

const sizes = tasks.map((t) => ok.filter((r) => r.task === t).length);
const bound = upperBound95(sizes);
if (pooled[best] === 0) {
  console.log(
    `\nzero observed is not zero. With ${sizes.join("+")} samples the 95% upper bound on δ is ` +
      `${pct(bound)}, so detection at w=${WINDOW} is at worst ${pct(detectionProbability(bound, WINDOW))} ` +
      `— still above the ${pct(0.05)} floor at which the instrument stops seeing stuck flows.`,
  );
}
