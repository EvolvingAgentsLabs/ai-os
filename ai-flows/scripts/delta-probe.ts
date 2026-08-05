/**
 * Phase 0 — measure δ, the rate at which identical work yields a different fingerprint.
 *
 * doc/10-observability.md § How this gets falsified, measurement 1. Every claim of
 * the form "the flow stopped moving" is a claim that two states are the same, and
 * that claim is only as good as the instrument making it. This script measures the
 * instrument.
 *
 * Repeats identical work from an identical starting state, and fingerprints each
 * result at three granularities so the open question — what the fingerprint should
 * be taken over — is answered by the same runs rather than by a second experiment.
 *
 * Writes raw results as JSON. It computes no δ itself: that is done by
 * ai-flows/src/observability.ts, so the number comes from the shipped code.
 *
 * Lives here rather than in ai-base/scripts: everything under ai-base/ is vendored
 * upstream, where org-specific files do not belong and the house style is zero
 * comments. It reaches into the base by relative path, which is a measurement
 * reading the machine — not ai-flows depending on core (ADR-0006).
 *
 *   cd ai-flows && node --env-file-if-exists=../ai-base/.env scripts/delta-probe.ts 8 > /tmp/delta.json
 */
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../ai-base/src/config.ts";
import { buildApp } from "../../ai-base/src/wiring.ts";
import type { TurnRequest } from "../../ai-base/src/types.ts";

const REPEATS = Number(process.argv[2] ?? 8);
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** G2: strip the surface the model is free to vary — casing, spacing, punctuation. */
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

interface Task {
  id: string;
  kind: "text" | "tool";
  text: string;
  /** G3 — the payload a flow step would actually carry forward. */
  extract: (reply: string) => string;
}

const sortedTokens = (re: RegExp) => (reply: string) =>
  [...new Set(reply.match(re) ?? [])]
    .map((s) => s.toLowerCase())
    .sort()
    .join(",");

const TASKS: Task[] = [
  {
    // A planning step: which files would change. The classic "files touched" fingerprint.
    id: "plan",
    kind: "text",
    text:
      "A TypeScript project has these files: src/flow-store.ts, src/types.ts, " +
      "src/memory-flow-store.ts, src/postgres-flow-store.ts, test/flow-store.test.ts. " +
      "To add an optional numeric field to the Attempt interface, which of those files " +
      "must change? Answer with the file paths only, one per line, nothing else.",
    extract: sortedTokens(/(?:src|test)\/[a-z-]+\.ts/g),
  },
  {
    // An eval step: the closest thing to a score a flow can carry today.
    id: "verdict",
    kind: "text",
    text:
      "Here is a function:\n\n" +
      "function pairsDiffering(xs) {\n" +
      "  let d = 0;\n" +
      "  for (let i = 0; i < xs.length; i++)\n" +
      "    for (let j = i; j < xs.length; j++)\n" +
      "      if (xs[i] !== xs[j]) d++;\n" +
      "  return d;\n" +
      "}\n\n" +
      "Does it correctly count unordered pairs of differing elements? " +
      "Reply with exactly one word: YES or NO.",
    extract: (r) => (/\byes\b/i.test(r) ? "YES" : /\bno\b/i.test(r) ? "NO" : "OTHER"),
  },
  {
    // A tool step: state produced through the sandbox rather than asserted in prose.
    id: "tool",
    kind: "tool",
    text:
      "Use your execute tool to run exactly: printf 'b\\na\\nc\\n' | sort | tr '\\n' '-' " +
      "Then reply with only the command's output and nothing else.",
    extract: (r) => (r.match(/a-b-c-?/)?.[0] ?? "NO-MATCH").replace(/-$/, ""),
  },
];

const { app } = buildApp({
  ...loadConfig(),
  port: 0,
  dataDir: mkdtempSync(join(tmpdir(), "delta-probe-")),
  sessionStore: "memory",
  runStore: "memory",
  harness: "pi",
});

const dm = (text: string, thread: string): TurnRequest => ({
  surface: "delta-probe",
  actor: { externalId: "U1" },
  conversation: { kind: "dm", threadRef: thread },
  text,
});

const out: Record<string, unknown> = {
  model: process.env.PI_MODEL ?? null,
  provider: process.env.MODEL_PROVIDER ?? null,
  harness: "pi",
  repeats: REPEATS,
  startedAt: new Date().toISOString(),
  runs: [],
};
const runs = out.runs as unknown[];

for (const task of TASKS) {
  const n = task.kind === "tool" ? Math.min(REPEATS, 6) : REPEATS;
  for (let i = 0; i < n; i++) {
    // A fresh thread per repeat: identical work from an identical starting state,
    // with no conversation history carried between repeats.
    const started = Date.now();
    let reply = "";
    let status = "error";
    try {
      const r = await app.turn(dm(task.text, `${task.id}-${i}-${started}`));
      status = String(r.status);
      reply = r.reply ?? r.reason ?? "";
    } catch (e) {
      reply = `THREW: ${(e as Error).message}`;
    }
    runs.push({
      task: task.id,
      kind: task.kind,
      i,
      status,
      ms: Date.now() - started,
      raw: sha(reply),
      normalized: sha(normalize(reply)),
      extracted: sha(task.extract(reply)),
      extractedValue: task.extract(reply),
      replyLength: reply.length,
      reply: reply.slice(0, 400),
    });
    process.stderr.write(`${task.id} ${i + 1}/${n} ${status} ${Date.now() - started}ms\n`);
  }
}

out.finishedAt = new Date().toISOString();
console.log(JSON.stringify(out, null, 2));
process.exit(0);
