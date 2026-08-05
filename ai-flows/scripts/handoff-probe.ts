/**
 * Family B's headroom pre-check: does the handoff actually lose anything?
 *
 * The control arm only. Each task runs twice against the real model and sandbox: an
 * explorer computes an intermediate and writes a note, then a finisher — in a
 * DIFFERENT conversation, sharing the same workspace — must finish from that note
 * alone. Nothing accumulates, no strategy is supplied.
 *
 * If `handoffLoss` comes back near zero, the explorer is spontaneously recording
 * everything a successor needs, there is no trap to learn, and the treatment arm must
 * not be built until the split is redesigned. That is the same gate the atomic suite
 * just failed, applied before the money is spent rather than after.
 *
 * **Two conversations rather than two delegated children, deliberately.** Delegation
 * works now (`delegate-smoke.ts` is [ran]) and would be the more lifelike shape, but it
 * leaks: the parent composes the child's task string and could restate everything the
 * note omitted, so the note would stop being the only channel. Here the finisher's
 * prompt is fixed by this script, identical in both arms, and the note is the only
 * thing that varies. Measuring the mechanism beats dramatising it.
 *
 * The distinction that makes the number mean anything: a finisher that cannot find the
 * file at all is an infrastructure failure, not a lost handoff, and is counted
 * separately. Conflating them would let a scope bug masquerade as evidence.
 *
 *   cd ai-flows && node --env-file-if-exists=../ai-base/.env scripts/handoff-probe.ts --count 6
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configuredModelForHarness, loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";
import type { TurnRequest } from "../../ai-base/src/types.ts";
import {
  explorerInstruction,
  finisherInstruction,
  gradeHandoff,
  HANDOFF_FILE,
  handoffLossRate,
  handoffSuite,
  type HandoffGrade,
  type HandoffTask,
} from "../src/tasks/handoff.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const COUNT = Number(arg("count") ?? 6);
const SEED = Number(arg("seed") ?? 1);
const OUT = arg("out");

const config = loadConfig();
const modelId = configuredModelForHarness(config, config.harness) ?? "(harness default)";

function select(count: number, seed: number): HandoffTask[] {
  const pool = handoffSuite({ seed, perSystem: 4 }).filter((t) => t.tolerance === 1e-3);
  const bySystem = new Map<string, HandoffTask[]>();
  for (const t of pool) {
    const list = bySystem.get(t.system) ?? [];
    list.push(t);
    bySystem.set(t.system, list);
  }
  const out: HandoffTask[] = [];
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

const tasks = select(COUNT, SEED);
const { app } = buildApp({
  ...config,
  port: 0,
  dataDir: mkdtempSync(join(tmpdir(), "handoff-probe-")),
  sessionStore: "memory",
  runStore: "memory",
  harness: "pi",
});

const dm = (text: string, thread: string): TurnRequest => ({
  surface: "handoff-probe",
  actor: { externalId: "U1" },
  conversation: { kind: "dm", threadRef: thread },
  text,
});

async function turn(text: string, thread: string): Promise<{ reply: string; ms: number }> {
  const started = Date.now();
  try {
    const r = await app.turn(dm(text, thread));
    return { reply: r.reply ?? r.reason ?? "", ms: Date.now() - started };
  } catch (e) {
    return { reply: `THREW: ${e instanceof Error ? e.message : String(e)}`, ms: Date.now() - started };
  }
}

/**
 * A finisher saying the file is absent is not the same as one saying the note is
 * insufficient. The first means the two conversations did not share a workspace and
 * the whole run is void; the second is the measurement.
 */
function looksUnreadable(reply: string): boolean {
  return /no such file|does not exist|not found|could not (?:find|read|open)|empty file|file is empty/i.test(reply);
}

console.log(`${tasks.length} handoffs · seed ${SEED} · model ${modelId} · control arm, nothing accumulates\n`);

interface Row {
  id: string;
  system: string;
  level: string;
  tolerance: number;
  grade: HandoffGrade;
  note: string;
  explorerReply: string;
  finisherReply: string;
  unreadable: boolean;
  ms: number;
}

const rows: Row[] = [];
for (const task of tasks) {
  const started = Date.now();
  const explorer = await turn(explorerInstruction(task), `${task.id}-explorer-${started}`);
  const finisher = await turn(finisherInstruction(task), `${task.id}-finisher-${started}`);
  const note = await turn(
    `Print the exact contents of \`${HANDOFF_FILE}\`, verbatim and nothing else.`,
    `${task.id}-inspect-${started}`,
  );
  const grade = gradeHandoff(task, explorer.reply, finisher.reply);
  const unreadable = looksUnreadable(finisher.reply);
  rows.push({
    id: task.id,
    system: task.system,
    level: task.level,
    tolerance: task.tolerance,
    grade,
    note: note.reply.trim().slice(0, 600),
    explorerReply: explorer.reply.trim().slice(0, 300),
    finisherReply: finisher.reply.trim().slice(0, 300),
    unreadable,
    ms: Date.now() - started,
  });
  console.log(
    `${task.id.padEnd(26)} explorer=${grade.explorer.padEnd(11)} finisher=${grade.finisher.padEnd(11)} ` +
      `${grade.handoffLoss ? "LOSS" : "    "}${unreadable ? " UNREADABLE" : ""} ${((Date.now() - started) / 1000).toFixed(0)}s`,
  );
}

const grades = rows.map((r) => r.grade);
const reached = grades.filter((g) => g.explorer === "pass").length;
const lost = grades.filter((g) => g.handoffLoss).length;
const unreadable = rows.filter((r) => r.unreadable).length;
const rate = handoffLossRate(grades);

console.log(`\nn=${rows.length}  reached the handoff=${reached}  lost there=${lost}  unreadable=${unreadable}`);
console.log(`handoff loss rate: ${(rate * 100).toFixed(1)}% of the chains that arrived intact`);

const HEADROOM_FLOOR = 0.2;
if (unreadable > 0 && unreadable === rows.length) {
  console.log(
    "\nVOID — every finisher reported the file missing. The two conversations are not sharing a " +
      "workspace scope, so nothing here is a handoff measurement. Fix that before reading any rate above.",
  );
} else if (reached === 0) {
  console.log(
    "\nVOID — no explorer produced a usable intermediate, so no chain reached the handoff. " +
      "The explorer half is too hard; loosen it before measuring the handoff.",
  );
} else {
  console.log(
    rate >= HEADROOM_FLOOR
      ? `\nHEADROOM: yes — ${lost}/${reached} intact chains lost the handoff. There is a trap to learn. ` +
          "Build the treatment arm: same tasks, same order, one scope, strategies on."
      : `\nHEADROOM: no — only ${lost}/${reached} intact chains lost the handoff, below the ${HEADROOM_FLOOR * 100}% ` +
          "floor. The explorer is already recording what a successor needs, so there is nothing for a strategy " +
          "to supply. Redesign the split before building the treatment arm.",
  );
}

console.log("\n--- what the explorer actually left behind ---");
for (const r of rows.slice(0, 3)) console.log(`\n[${r.id}] ${r.grade.handoffLoss ? "LOST" : "ok"}\n${r.note}`);

if (OUT) {
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        arm: "control",
        model: modelId,
        provider: config.modelProvider,
        harness: "pi",
        seed: SEED,
        headroomFloor: HEADROOM_FLOOR,
        reached,
        lost,
        unreadable,
        handoffLossRate: rate,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`\nreport written to ${OUT}`);
}
process.exit(0);
