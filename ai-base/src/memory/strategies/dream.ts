import { relative } from "node:path";
import type { ScopeId } from "../../types.ts";
import type { HarnessModelUtilities } from "../../harness/harness.ts";
import type { WorkspaceStore } from "../../workspace/workspace-store.ts";
import type { MemoryService } from "../memory-service.ts";
import type { MemoryStrategy } from "../strategy.ts";
import { capTail, dateStr, isBullet } from "../notebook.ts";
import { PROMOTION_PROMPT } from "./scratch-promote.ts";
import { type Burst, createBurstBuffer, DEFAULT_CAPTURE_MAX_TURNS, isAutonomousBurst } from "./per-turn.ts";
import { createKeyedQueue } from "../../util/async.ts";

const EPISODE_DIR = "memory/episodes";
const EPISODE_RETENTION_DAYS = 14;
const STATE_FILE = "memory/dream-state.md";
const TURN_MAX_CHARS = 2_000;
const STRATEGIES_RECALL_MAX_CHARS = 2_000;
const MAX_STRATEGIES = 40;
const STATE_RE = /^<!-- turns-since-dream: (\d+) -->$/m;

export const STRATEGIES_FILE = "memory/STRATEGIES.md";
const STRATEGIES_HEADER = "# Strategies";
export const DEFAULT_DREAM_AFTER = 10;

export const DREAM_EPISODE_ADDENDUM = [
  "The second input is not a scratch log of pre-extracted captures: it is the raw episodic log of",
  "the exchanges themselves. Read the whole arc before writing anything. A fact stated early and",
  "revised later appears only in its final form, and the provenance rule still holds — a",
  "preference, intent, or instruction is durable only where the user's own message states it.",
  "Exchanges marked (autonomous) had no human speaker: take only operational facts from those.",
].join("\n");

export const DREAM_ABSTRACTION_PROMPT = [
  "You distil an agent's episodic log into reusable procedural knowledge: what to DO next time,",
  "not what is true about the person. You are given the current strategies file and a log of",
  "recent episodes.",
  "Output the COMPLETE new strategies file as markdown, keeping the `# Strategies` header and one",
  "strategy per bullet in exactly this grammar:",
  "- (YYYY-MM-DD) [seen: N] when <situation> -> <what to do>",
  "Rules:",
  "- A strategy generalises across at least two episodes, or one episode whose outcome is stated.",
  "  When a new episode repeats a strategy already listed, raise its `seen` count rather than",
  "  restating it, and keep its original date.",
  "- The situation must be recognisable BEFORE acting. `when a deploy fails on the first attempt`",
  "  is usable; `when the user is frustrated about deploys` is not.",
  "- Record only what changed an outcome: a step that avoided a failure, an order of operations",
  "  that worked, a tool that answered where another did not.",
  "- DROP a strategy a later episode contradicts, and DROP anything that is a fact about the",
  "  person rather than a procedure — facts belong in the notebook, never here.",
  "- Never include secrets, credentials, or one-off identifiers.",
  "- Output ONLY the file content. If nothing should change, output exactly: NONE",
].join("\n");

const DREAM_PROMPT_LINES = [
  "Your memory has two tiers, both recalled for you: a notebook of durable facts, and a strategies",
  "file of procedures learned from earlier episodes (`when <situation> -> <what to do>`).",
  "Raw exchanges are logged as episodes and distilled while you are at rest, so you do not need to",
  'save them yourself. To pin a fact immediately use the `memory` action "remember"; to correct one,',
  '"read" then "rewrite". Strategies are written only by the distillation pass.',
];

export function episodePath(at: number): string {
  return `${EPISODE_DIR}/${dateStr(at)}.md`;
}

function timeStr(at: number): string {
  return new Date(at).toISOString().slice(11, 19);
}

function clip(text: string): string {
  const flat = text.replace(/\r/g, "").trim();
  return flat.length > TURN_MAX_CHARS ? `${flat.slice(0, TURN_MAX_CHARS)}…` : flat;
}

export function formatEpisode(
  turns: Array<{ input: string; reply: string }>,
  at: number,
  opts: { autonomous?: boolean; label?: string } = {},
): string {
  const tags = [opts.label, opts.autonomous ? "autonomous" : undefined].filter(Boolean).join(", ");
  const head = `### ${timeStr(at)}${tags ? ` (${tags})` : ""}`;
  const body = turns.map((t) => `USER: ${clip(t.input)}\nASSISTANT: ${clip(t.reply)}`).join("\n\n");
  return `${head}\n${body}`;
}

export function capStrategies(content: string): string {
  const lines = content.replace(/\s+$/, "").split("\n");
  const idx = lines.flatMap((l, i) => (isBullet(l) ? [i] : []));
  const overflow = idx.length - MAX_STRATEGIES;
  const drop = new Set(overflow > 0 ? idx.slice(0, overflow) : []);
  const kept = lines
    .filter((_, i) => !drop.has(i))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!kept) return "";
  return `${kept.startsWith("#") ? kept : `${STRATEGIES_HEADER}\n\n${kept}`}\n`;
}

function recentDates(now: number, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(dateStr(now - i * 86_400_000));
  return out;
}

export interface DreamDeps {
  harness: HarnessModelUtilities;
  memory: MemoryService;
  workspace: WorkspaceStore;
  dreamAfter: number;
  captureQuietMs?: number;
  captureMaxTurns?: number;
  onCaptureError?: (e: unknown, scopeId: ScopeId) => void;
}

export function createDreamStrategy(deps: DreamDeps): { strategy: MemoryStrategy; memory: MemoryService } {
  const base = deps.memory;
  const workspace = deps.workspace;
  const perScope = createKeyedQueue<ScopeId>();

  async function bumpState(scopeId: ScopeId, by: number): Promise<number> {
    const body = (await workspace.read(scopeId, STATE_FILE)) ?? "";
    const m = STATE_RE.exec(body);
    const count = (m ? Number(m[1]) : 0) + by;
    await workspace.write(scopeId, STATE_FILE, `<!-- turns-since-dream: ${count} -->\n`);
    return count;
  }

  async function readEpisodeWindow(
    scopeId: ScopeId,
    now: number,
    days: number,
  ): Promise<Array<{ date: string; body: string }>> {
    const out: Array<{ date: string; body: string }> = [];
    for (const date of recentDates(now, days)) {
      const body = ((await workspace.read(scopeId, `${EPISODE_DIR}/${date}.md`)) ?? "").trim();
      if (body) out.push({ date, body });
    }
    return out;
  }

  async function distilFacts(scopeId: ScopeId, transcript: string): Promise<void> {
    const notebook = (await base.read(scopeId)).trim();
    let out: string | undefined;
    try {
      out = await deps.harness.oneShot!(
        `${PROMOTION_PROMPT}\n\n${DREAM_EPISODE_ADDENDUM}`,
        `Current notebook:\n${notebook || "(empty)"}\n\nEpisodic log:\n${transcript}`,
      );
    } catch {
      return;
    }
    const next = (out ?? "").trim();
    if (next && !/^none$/i.test(next)) await base.replace(scopeId, next, "system");
  }

  async function distilStrategies(scopeId: ScopeId, transcript: string): Promise<void> {
    const current = ((await workspace.read(scopeId, STRATEGIES_FILE)) ?? "").trim();
    let out: string | undefined;
    try {
      out = await deps.harness.oneShot!(
        DREAM_ABSTRACTION_PROMPT,
        `Current strategies:\n${current || "(empty)"}\n\nEpisodic log:\n${transcript}`,
      );
    } catch {
      return;
    }
    const next = (out ?? "").trim();
    if (!next || /^none$/i.test(next)) return;
    const capped = capStrategies(next);
    if (capped) await workspace.write(scopeId, STRATEGIES_FILE, capped);
    else await workspace.remove(scopeId, STRATEGIES_FILE);
  }

  async function prune(scopeId: ScopeId, now: number): Promise<void> {
    const cutoff = dateStr(now - EPISODE_RETENTION_DAYS * 86_400_000);
    for (const abs of await workspace.list(scopeId)) {
      const rel = relative(workspace.scopeDir(scopeId), abs);
      const m = rel.match(/^memory\/episodes\/(\d{4}-\d\d-\d\d)\.md$/);
      if (m && m[1]! < cutoff) await workspace.remove(scopeId, rel);
    }
  }

  const memory: MemoryService = {
    ...base,
    async recall(scopeId) {
      const notebook = await base.recall(scopeId);
      const strategies = ((await workspace.read(scopeId, STRATEGIES_FILE)) ?? "").trim();
      if (!strategies) return notebook;
      const tail = capTail(strategies, STRATEGIES_RECALL_MAX_CHARS);
      return notebook ? `${notebook}\n\n${tail}` : tail;
    },
  };

  async function record(burst: Burst): Promise<void> {
    const at = Date.now();
    const autonomous = isAutonomousBurst(burst);
    const path = episodePath(at);
    const entry = formatEpisode(burst.turns, at, {
      autonomous,
      ...(burst.conversationLabel !== undefined ? { label: burst.conversationLabel } : {}),
    });
    const existing = (await workspace.read(burst.scopeId, path)) ?? "";
    const body = existing.trim()
      ? `${existing.replace(/\s+$/, "")}\n\n${entry}`
      : `# Episodes ${dateStr(at)}\n\n${entry}`;
    await workspace.write(burst.scopeId, path, `${body}\n`);

    if (deps.dreamAfter <= 0) return;
    const count = await bumpState(burst.scopeId, burst.turns.length);
    if (count < deps.dreamAfter) return;
    await workspace.write(burst.scopeId, STATE_FILE, "<!-- turns-since-dream: 0 -->\n");
    await strategy.maintain!(burst.scopeId).catch(() => {});
  }

  const strategy: MemoryStrategy = {
    onTurnEnd: createBurstBuffer(
      deps.captureQuietMs ?? 0,
      deps.captureMaxTurns ?? DEFAULT_CAPTURE_MAX_TURNS,
      (burst) => perScope(burst.scopeId, () => record(burst)),
      (e, burst) => deps.onCaptureError?.(e, burst.scopeId),
    ),

    async maintain(scopeId) {
      const now = Date.now();
      const window = await readEpisodeWindow(scopeId, now, EPISODE_RETENTION_DAYS);
      if (window.length && deps.harness.oneShot) {
        const transcript = window.map(({ date, body }) => `## ${date}\n${body}`).join("\n\n");
        await distilFacts(scopeId, transcript);
        await distilStrategies(scopeId, transcript);
      }
      await prune(scopeId, now);
    },

    promptLines() {
      return DREAM_PROMPT_LINES;
    },
  };

  return { strategy, memory };
}
