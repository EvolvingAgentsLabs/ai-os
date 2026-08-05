/**
 * Step 0b — the headroom pre-check through the AGENT path, with tools.
 *
 * `physics-probe.ts` runs the same tasks through `oneShot`, which has no tools, and
 * came back 100% `detected` at L2: the model declined every task. That is not a
 * procedure gap a strategy could ever repair — `ANSWER_PROTOCOL` demands six
 * significant figures and the model was being asked to evaluate elliptic integrals
 * mentally. It measured arithmetic precision, not method selection.
 *
 * This runs the real turn path (`app.turn`), so `execute` and its Python sandbox are
 * available. Now the learnable procedure is a real one — "compute it, and use the
 * exact model rather than the first-order one" — and a wrong answer means a wrong
 * METHOD rather than a wrong long-division. That is what a distilled strategy can fix,
 * so this is the arm whose non-pass rate is the honest headroom number.
 *
 * A fresh thread per task: this is the control arm, so nothing accumulates between
 * tasks. The treatment arm is the same loop on ONE thread, which is the whole
 * difference and the reason this script keeps the thread id in the report.
 *
 *   cd ai-flows && node --env-file-if-exists=../ai-base/.env scripts/physics-agent-probe.ts --count 12
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configuredModelForHarness, loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";
import type { TurnRequest } from "../../ai-base/src/types.ts";
import {
  errorReduction,
  grade,
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
const COUNT = Number(arg("count") ?? 12);
const SEED = Number(arg("seed") ?? 1);
const OUT = arg("out");

function select(levels: readonly Level[], count: number, seed: number): PhysicsTask[] {
  let pool: PhysicsTask[] = [];
  for (let perSystem = 8; perSystem <= 256 && pool.length < count; perSystem *= 2) {
    pool = physicsSuite({ seed, perSystem }).filter((t) => levels.includes(t.level));
  }
  const bySystem = new Map<string, PhysicsTask[]>();
  for (const t of pool) {
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

const config = loadConfig();
const modelId = configuredModelForHarness(config, config.harness) ?? "(harness default)";
const tasks = select(LEVELS, COUNT, SEED);
if (!tasks.length) {
  console.error(`no tasks at ${LEVELS.join(",")} for seed ${SEED}`);
  process.exit(1);
}

const { app } = buildApp({
  ...config,
  port: 0,
  dataDir: mkdtempSync(join(tmpdir(), "physics-agent-probe-")),
  sessionStore: "memory",
  runStore: "memory",
  harness: "pi",
});

const dm = (text: string, thread: string): TurnRequest => ({
  surface: "physics-agent-probe",
  actor: { externalId: "U1" },
  conversation: { kind: "dm", threadRef: thread },
  text,
});

const NUMBER_RE = /-?\d[\d,]*\.?\d*(?:[eE][-+]?\d+)?/g;

/**
 * `grade()` takes the FIRST number in the reply, which is correct under
 * `ANSWER_PROTOCOL` ("the numeric value only") and wrong the moment an agent prefixes
 * its answer with prose — "using L = 1 m ..." grades the 1.
 *
 * The grader is not changed to accommodate that: editing the instrument to flatter the
 * arm is the exact failure this suite exists to avoid. Instead every reply is audited.
 * `protocolViolation` says the reply was not bare, and `lastNumber` says whether
 * reading from the other end would have changed the verdict. If violations are common
 * the graded rate is unreliable and must be reported as such rather than quoted.
 */
function audit(reply: string): { protocolViolation: boolean; numbers: number; lastNumber: number | null } {
  const trimmed = reply.trim();
  if (/^unsure$/i.test(trimmed)) return { protocolViolation: false, numbers: 0, lastNumber: null };
  const matches = trimmed.match(NUMBER_RE) ?? [];
  const bare = /^-?\d[\d,]*\.?\d*(?:[eE][-+]?\d+)?$/.test(trimmed);
  const last = matches.length ? Number(matches[matches.length - 1]!.replace(/,/g, "")) : null;
  return {
    protocolViolation: !bare,
    numbers: matches.length,
    lastNumber: last !== null && Number.isFinite(last) ? last : null,
  };
}

console.log(`${tasks.length} tasks at ${LEVELS.join(",")} · seed ${SEED} · model ${modelId} · harness pi + tools`);
console.log("control arm: fresh thread per task, no strategies, nothing accumulates\n");

interface Row {
  id: string;
  system: string;
  level: Level;
  tolerance: number;
  outcome: Outcome;
  relativeError: number | null;
  errorReduction: number | null;
  status: string;
  protocolViolation: boolean;
  numbersInReply: number;
  lastNumberWouldPass: boolean | null;
  reply: string;
  ms: number;
}

const rows: Row[] = [];
for (const task of tasks) {
  const started = Date.now();
  let reply = "";
  let status = "error";
  try {
    const r = await app.turn(dm(task.prompt, `${task.id}-${started}`));
    status = String(r.status);
    reply = r.reply ?? r.reason ?? "";
  } catch (e) {
    reply = `THREW: ${e instanceof Error ? e.message : String(e)}`;
  }
  const ms = Date.now() - started;
  const { outcome, relativeError } = grade(task, reply);
  const a = audit(reply);
  const lastNumberWouldPass =
    a.lastNumber === null ? null : Math.abs(a.lastNumber - task.answer) / Math.abs(task.answer) <= task.tolerance;
  rows.push({
    id: task.id,
    system: task.system,
    level: task.level,
    tolerance: task.tolerance,
    outcome,
    relativeError,
    errorReduction: errorReduction(task, relativeError),
    status,
    protocolViolation: a.protocolViolation,
    numbersInReply: a.numbers,
    lastNumberWouldPass,
    reply: reply.trim().slice(0, 300),
    ms,
  });
  console.log(
    `[${task.level}] ${task.id.padEnd(28)} ${outcome.padEnd(11)} ${status.padEnd(8)} ` +
      `relErr=${relativeError === null ? "—" : relativeError.toExponential(2)} ` +
      `tol=${task.tolerance.toExponential(0)}${a.protocolViolation ? " PROSE" : ""} ${(ms / 1000).toFixed(1)}s`,
  );
}

const counts: Record<Outcome, number> = { pass: 0, detected: 0, undetected: 0 };
for (const r of rows) counts[r.outcome]++;
const nonPassRate = (rows.length - counts.pass) / rows.length;
const undetectedRate = counts.undetected / rows.length;
const violations = rows.filter((r) => r.protocolViolation).length;
const misgraded = rows.filter((r) => r.protocolViolation && r.lastNumberWouldPass === true && r.outcome !== "pass");

console.log(`\nn=${rows.length}  pass=${counts.pass}  detected=${counts.detected}  undetected=${counts.undetected}`);
console.log(`non-pass rate (headroom):   ${(nonPassRate * 100).toFixed(1)}%`);
console.log(`undetected rate (severity): ${(undetectedRate * 100).toFixed(1)}%`);
console.log(`protocol violations:        ${violations}/${rows.length} replies were not a bare number`);
if (misgraded.length) {
  console.log(
    `\nGRADING UNRELIABLE: ${misgraded.length} repl${misgraded.length === 1 ? "y" : "ies"} would have passed on the ` +
      "LAST number but were graded on the first. The headroom figure above is not trustworthy; fix the reply " +
      "discipline (or the grader, deliberately and in the open) before quoting it.",
  );
}

const HEADROOM_FLOOR = 0.1;
console.log(
  nonPassRate >= HEADROOM_FLOOR
    ? `\nHEADROOM: yes — ${rows.length - counts.pass}/${rows.length} not passing. Proceed to the treatment arm.`
    : `\nHEADROOM: no — only ${rows.length - counts.pass}/${rows.length} not passing, below the ${HEADROOM_FLOOR * 100}% ` +
        "floor. Do NOT build the treatment arm on this suite; tighten tolerance or change domain.",
);

if (OUT) {
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        arm: "agent-with-tools",
        model: modelId,
        provider: config.modelProvider,
        harness: "pi",
        seed: SEED,
        levels: LEVELS,
        headroomFloor: HEADROOM_FLOOR,
        nonPassRate,
        undetectedRate,
        protocolViolations: violations,
        misgradedCount: misgraded.length,
        counts,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`\nreport written to ${OUT}`);
}
process.exit(0);
