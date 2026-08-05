/**
 * Step 0 — the headroom pre-check, and the only arm that can kill the evolution
 * experiment cheaply.
 *
 * doc/05-ai-storage.md § Experiment 1 came back on a saturated instrument: the
 * memory benchmark scored the baseline 10/10/10 on five of six conversations, so it
 * could not separate "the treatment does nothing" from "the instrument cannot see
 * it". The lesson is that headroom must be measured BEFORE the treatment is built,
 * not inferred after.
 *
 * This runs the control arm alone: the physics suite with no strategies, no memory,
 * no accumulation. It answers one question — how often does this model state a
 * confidently wrong number? If `undetected` is near zero there is nothing for a
 * learned strategy to fix, and every downstream arm is cancelled for the price of
 * this one.
 *
 * The grader is arithmetic (`grade()` against an exact oracle), so no judge model is
 * involved and none of its bias is either. That is the property the memory benchmark
 * lacked: there, deepseek judged deepseek's own summariser.
 *
 * Lives here rather than in ai-base/scripts for the same reason as delta-probe.ts:
 * everything under ai-base/ is vendored upstream. Reaching into the base by relative
 * path is a measurement reading the machine, not ai-flows depending on core
 * (ADR-0006).
 *
 *   cd ai-flows && node --env-file-if-exists=../ai-base/.env scripts/physics-probe.ts --levels L2 --count 24
 */
import { writeFileSync } from "node:fs";
import { configuredModelForHarness, loadConfig } from "../../ai-base/src/config.ts";
import { createPiHarness, piHarnessConfigOptions } from "../../ai-base/src/harness/pi-harness.ts";
import {
  grade,
  errorReduction,
  physicsSuite,
  type Level,
  type Outcome,
  type PhysicsTask,
} from "../src/tasks/physics.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const LEVELS: Level[] = (arg("levels") ?? "L2")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter((s): s is Level => s === "L1" || s === "L2" || s === "L3");
if (!LEVELS.length) {
  console.error("--levels must name at least one of L1,L2,L3");
  process.exit(1);
}
const COUNT = Number(arg("count") ?? 24);
const SEED = Number(arg("seed") ?? 1);
const OUT = arg("out");

const config = loadConfig();
const modelId = configuredModelForHarness(config, config.harness) ?? "(harness default)";

/**
 * L2 is the scarcest level at the default `perSystem` (65/21/42 at 128 tasks), and
 * it is the level the hypothesis is about — the linear model misses tolerance, but
 * only just, so knowing the rule is what decides the answer. Oversample the
 * generator and take the requested count rather than raising `perSystem` blindly.
 */
function select(levels: readonly Level[], count: number, seed: number): PhysicsTask[] {
  const picked: PhysicsTask[] = [];
  for (let perSystem = 8; perSystem <= 256 && picked.length < count; perSystem *= 2) {
    const all = physicsSuite({ seed, perSystem }).filter((t) => levels.includes(t.level));
    picked.length = 0;
    picked.push(...all);
  }
  const bySystem = new Map<string, PhysicsTask[]>();
  for (const t of picked) {
    const list = bySystem.get(t.system) ?? [];
    list.push(t);
    bySystem.set(t.system, list);
  }
  const out: PhysicsTask[] = [];
  let exhausted = false;
  while (out.length < count && !exhausted) {
    exhausted = true;
    for (const list of bySystem.values()) {
      const next = list.shift();
      if (!next) continue;
      exhausted = false;
      out.push(next);
      if (out.length >= count) break;
    }
  }
  return out;
}

const tasks = select(LEVELS, COUNT, SEED);
if (!tasks.length) {
  console.error(`no tasks at ${LEVELS.join(",")} for seed ${SEED}`);
  process.exit(1);
}

const harness = createPiHarness({ ...piHarnessConfigOptions(config), tempDirPrefix: "physprobe" });
if (!harness.models.oneShot) {
  console.error("harness has no oneShot — cannot probe");
  process.exit(1);
}
const oneShot = harness.models.oneShot.bind(harness.models);

/**
 * Deliberately bare. This is the control arm: no strategies, no memory, no hints
 * about which model to use. Whatever the treatment arm later adds to this prompt is
 * the one variable under test.
 */
const SYSTEM = "You are answering a quantitative physics question. Be exact.";

console.log(`${tasks.length} tasks at ${LEVELS.join(",")} · seed ${SEED} · model ${modelId}`);
console.log("control arm: no strategies, no memory, no accumulation\n");

interface Row {
  id: string;
  system: string;
  level: Level;
  tolerance: number;
  approximationError: number;
  outcome: Outcome;
  relativeError: number | null;
  errorReduction: number | null;
  reply: string;
  ms: number;
}

const rows: Row[] = [];
for (const task of tasks) {
  const started = Date.now();
  let reply = "";
  try {
    reply = (await oneShot(SYSTEM, task.prompt)) ?? "";
  } catch (e) {
    reply = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
  const ms = Date.now() - started;
  const { outcome, relativeError } = grade(task, reply);
  rows.push({
    id: task.id,
    system: task.system,
    level: task.level,
    tolerance: task.tolerance,
    approximationError: task.approximationError,
    outcome,
    relativeError,
    errorReduction: errorReduction(task, relativeError),
    reply: reply.trim().slice(0, 200),
    ms,
  });
  console.log(
    `[${task.level}] ${task.id.padEnd(28)} ${outcome.padEnd(11)} ` +
      `relErr=${relativeError === null ? "—" : relativeError.toExponential(2)} ` +
      `tol=${task.tolerance.toExponential(0)} ${ms}ms`,
  );
}

function tally(subset: readonly Row[]): Record<Outcome, number> {
  const counts: Record<Outcome, number> = { pass: 0, detected: 0, undetected: 0 };
  for (const r of subset) counts[r.outcome]++;
  return counts;
}

const levelsSeen = [...new Set(rows.map((r) => r.level))].sort();
console.log("\nlevel  n   pass  detected  undetected  undetected-rate");
console.log("-----  --  ----  --------  ----------  ---------------");
for (const level of levelsSeen) {
  const subset = rows.filter((r) => r.level === level);
  const c = tally(subset);
  const rate = c.undetected / subset.length;
  console.log(
    `${level}     ${String(subset.length).padStart(2)}  ${String(c.pass).padStart(4)}  ` +
      `${String(c.detected).padStart(8)}  ${String(c.undetected).padStart(10)}  ${(rate * 100).toFixed(1)}%`,
  );
}
const overall = tally(rows);
const undetectedRate = overall.undetected / rows.length;
console.log(
  `\nALL    ${String(rows.length).padStart(2)}  ${String(overall.pass).padStart(4)}  ` +
    `${String(overall.detected).padStart(8)}  ${String(overall.undetected).padStart(10)}  ` +
    `${(undetectedRate * 100).toFixed(1)}%`,
);

/**
 * The verdict this script exists to deliver.
 *
 * Headroom is the NON-PASS rate, not the undetected rate. The first data point
 * corrected this: a task graded `detected` is a task where the model declined to
 * answer, and a strategy that supplies the missing method ("above this amplitude the
 * small-angle formula misses tolerance — use K(m)") turns that into a `pass` exactly
 * as it turns an `undetected` into one. Both are failures a procedure can repair, so
 * both are room to improve, and gating on `undetected` alone would have cancelled the
 * experiment over a model that is merely cautious rather than merely wrong.
 *
 * `undetected` is still reported on its own, because it measures severity rather than
 * room: a confidently stated wrong number is a liability where `UNSURE` is a
 * nuisance, and a treatment that converts undetected→detected has bought something
 * real even at an unchanged pass rate.
 *
 * The floor is deliberately generous. Below 10% non-pass, the effect a strategy could
 * produce is smaller than a 24-task suite can resolve.
 */
const HEADROOM_FLOOR = 0.1;
const nonPassRate = (rows.length - overall.pass) / rows.length;
console.log(`\nnon-pass rate (headroom): ${(nonPassRate * 100).toFixed(1)}%`);
console.log(`undetected rate (severity): ${(undetectedRate * 100).toFixed(1)}%`);
console.log(
  nonPassRate >= HEADROOM_FLOOR
    ? `\nHEADROOM: yes — ${rows.length - overall.pass}/${rows.length} tasks are not passing ` +
        `(${overall.undetected} confidently wrong, ${overall.detected} declined). Proceed to the treatment arm.`
    : `\nHEADROOM: no — only ${rows.length - overall.pass}/${rows.length} tasks are not passing, below the ` +
        `${HEADROOM_FLOOR * 100}% floor. A strategy has almost nothing to fix here. Tighten tolerance, ` +
        "try another level, or pick a domain where this model actually fails — do NOT build the treatment arm.",
);

if (OUT) {
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: modelId,
        provider: config.modelProvider,
        harness: config.harness,
        seed: SEED,
        levels: LEVELS,
        headroomFloor: HEADROOM_FLOOR,
        nonPassRate,
        undetectedRate,
        overall,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`\nreport written to ${OUT}`);
}
