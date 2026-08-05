import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalWorkspaceStore } from "../src/workspace/workspace-store.ts";
import { createMemoryService, MEMORY_FILE } from "../src/memory/memory-service.ts";
import { createMemoryStrategy, parseMemoryStrategyKind } from "../src/memory/strategy.ts";
import {
  capStrategies,
  createDreamStrategy,
  DREAM_ABSTRACTION_PROMPT,
  DREAM_EPISODE_ADDENDUM,
  episodePath,
  formatEpisode,
  STRATEGIES_FILE,
} from "../src/memory/strategies/dream.ts";
import { PROMOTION_PROMPT } from "../src/memory/strategies/scratch-promote.ts";
import type { HarnessModelUtilities } from "../src/harness/harness.ts";

const SCOPE = "user:U1";
const DAY = 86_400_000;
const TODAY = Date.UTC(2026, 7, 5, 9, 30, 15);

interface Call {
  system: string;
  prompt: string;
}

function isAbstraction(system: string): boolean {
  return system.startsWith(DREAM_ABSTRACTION_PROMPT.slice(0, 40));
}

function scriptedHarness(replies: { facts?: string; strategies?: string; factsThrows?: boolean }): {
  harness: HarnessModelUtilities;
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    harness: {
      async oneShot(system, prompt) {
        calls.push({ system, prompt });
        if (isAbstraction(system)) return replies.strategies;
        if (replies.factsThrows) throw new Error("model unavailable");
        return replies.facts;
      },
    },
  };
}

function fresh(opts: { harness?: HarnessModelUtilities; dreamAfter?: number } = {}) {
  const workspace = createLocalWorkspaceStore(mkdtempSync(join(tmpdir(), "dream-")));
  const base = createMemoryService(workspace);
  const { strategy, memory } = createDreamStrategy({
    harness: opts.harness ?? {},
    memory: base,
    workspace,
    dreamAfter: opts.dreamAfter ?? 0,
  });
  return { workspace, base, strategy, memory };
}

async function withNow<T>(at: number, fn: () => Promise<T>): Promise<T> {
  const real = Date.now;
  Date.now = () => at;
  try {
    return await fn();
  } finally {
    Date.now = real;
  }
}

test("a turn is logged as a raw episode and costs no model call", async () => {
  const { harness, calls } = scriptedHarness({});
  const { workspace, strategy } = fresh({ harness });
  await withNow(TODAY, () =>
    strategy.onTurnEnd!({ scopeId: SCOPE, input: "deploy failed again", reply: "checking the queue depth" }),
  );

  const log = await workspace.read(SCOPE, episodePath(TODAY));
  assert.match(log ?? "", /USER: deploy failed again/);
  assert.match(log ?? "", /ASSISTANT: checking the queue depth/);
  assert.equal(await workspace.read(SCOPE, MEMORY_FILE), null);
  assert.equal(calls.length, 0);
});

test("autonomous turns are marked in the episode log", async () => {
  const { workspace, strategy } = fresh();
  await withNow(TODAY, () =>
    strategy.onTurnEnd!({ scopeId: SCOPE, input: "cron fired", reply: "queue drained", actorId: "system:cron" }),
  );
  assert.match((await workspace.read(SCOPE, episodePath(TODAY))) ?? "", /\(autonomous\)/);
});

test("the dream pass distils the notebook from raw episodes, with the episodic addendum", async () => {
  const { harness, calls } = scriptedHarness({
    facts: "# Memory\n\n- (2026-08-05) Owns the search indexer\n",
    strategies: "NONE",
  });
  const { workspace, strategy } = fresh({ harness });
  await withNow(TODAY, async () => {
    await strategy.onTurnEnd!({ scopeId: SCOPE, input: "I own the search indexer", reply: "noted" });
    await strategy.maintain!(SCOPE);
  });

  assert.match((await workspace.read(SCOPE, MEMORY_FILE)) ?? "", /Owns the search indexer/);
  const factsCall = calls.find((c) => !isAbstraction(c.system))!;
  assert.ok(factsCall.system.startsWith(PROMOTION_PROMPT));
  assert.ok(factsCall.system.includes(DREAM_EPISODE_ADDENDUM));
  assert.match(factsCall.prompt, /Episodic log:/);
  assert.match(factsCall.prompt, /USER: I own the search indexer/);
});

test("the dream pass writes procedural strategies to a separate file", async () => {
  const { harness } = scriptedHarness({
    facts: "NONE",
    strategies: "# Strategies\n\n- (2026-08-05) [seen: 2] when a deploy fails -> read the queue depth first\n",
  });
  const { workspace, strategy } = fresh({ harness });
  await withNow(TODAY, async () => {
    await strategy.onTurnEnd!({ scopeId: SCOPE, input: "deploy failed", reply: "queue was full" });
    await strategy.maintain!(SCOPE);
  });

  assert.match((await workspace.read(SCOPE, STRATEGIES_FILE)) ?? "", /when a deploy fails -> read the queue depth/);
  assert.equal(await workspace.read(SCOPE, MEMORY_FILE), null);
});

test("NONE from either phase leaves that file untouched", async () => {
  const { harness } = scriptedHarness({ facts: "NONE", strategies: "NONE" });
  const { workspace, base, strategy } = fresh({ harness });
  await base.replace(SCOPE, "# Memory\n\n- (2026-08-01) Prefers terse replies\n");
  await workspace.write(SCOPE, STRATEGIES_FILE, "# Strategies\n\n- (2026-08-01) [seen: 1] when x -> y\n");
  await withNow(TODAY, async () => {
    await strategy.onTurnEnd!({ scopeId: SCOPE, input: "hi", reply: "hello" });
    await strategy.maintain!(SCOPE);
  });

  assert.match((await workspace.read(SCOPE, MEMORY_FILE)) ?? "", /Prefers terse replies/);
  assert.match((await workspace.read(SCOPE, STRATEGIES_FILE)) ?? "", /when x -> y/);
});

test("a failure distilling facts does not stop the strategies phase", async () => {
  const { harness } = scriptedHarness({
    factsThrows: true,
    strategies: "# Strategies\n\n- (2026-08-05) [seen: 2] when the sandbox is cold -> warm it first\n",
  });
  const { workspace, strategy } = fresh({ harness });
  await withNow(TODAY, async () => {
    await strategy.onTurnEnd!({ scopeId: SCOPE, input: "cold sandbox", reply: "warmed it" });
    await strategy.maintain!(SCOPE);
  });

  assert.equal(await workspace.read(SCOPE, MEMORY_FILE), null);
  assert.match((await workspace.read(SCOPE, STRATEGIES_FILE)) ?? "", /warm it first/);
});

test("recall carries both tiers", async () => {
  const { workspace, base, memory } = fresh();
  await base.replace(SCOPE, "# Memory\n\n- (2026-08-01) Owns the indexer\n");
  await workspace.write(SCOPE, STRATEGIES_FILE, "# Strategies\n\n- (2026-08-01) [seen: 3] when A -> B\n");
  const recalled = await memory.recall(SCOPE);
  assert.match(recalled, /Owns the indexer/);
  assert.match(recalled, /when A -> B/);
});

test("the pass fires on its own once enough turns have accumulated", async () => {
  const { harness, calls } = scriptedHarness({ facts: "NONE", strategies: "NONE" });
  const { strategy } = fresh({ harness, dreamAfter: 3 });
  await withNow(TODAY, async () => {
    for (let i = 0; i < 2; i++) {
      await strategy.onTurnEnd!({ scopeId: SCOPE, input: `turn ${i}`, reply: "ok" });
    }
    assert.equal(calls.length, 0);
    await strategy.onTurnEnd!({ scopeId: SCOPE, input: "turn 2", reply: "ok" });
  });
  assert.equal(calls.length, 2);
});

test("episodes past the retention window are pruned by the pass", async () => {
  const { workspace, strategy } = fresh();
  const old = TODAY - 20 * DAY;
  await workspace.write(SCOPE, episodePath(old), "# Episodes\n\nUSER: ancient\nASSISTANT: ancient\n");
  await withNow(TODAY, async () => {
    await strategy.onTurnEnd!({ scopeId: SCOPE, input: "recent", reply: "ok" });
    await strategy.maintain!(SCOPE);
  });

  assert.equal(await workspace.read(SCOPE, episodePath(old)), null);
  assert.notEqual(await workspace.read(SCOPE, episodePath(TODAY)), null);
});

test("capStrategies keeps the newest strategies and supplies the header", () => {
  const many = Array.from({ length: 45 }, (_, i) => `- (2026-08-05) [seen: 1] when s${i} -> a${i}`).join("\n");
  const capped = capStrategies(many);
  assert.ok(capped.startsWith("# Strategies"));
  const kept = capped.split("\n").filter((l) => l.startsWith("- "));
  assert.equal(kept.length, 40);
  assert.match(kept[kept.length - 1]!, /when s44/);
  assert.ok(!capped.includes("when s0 "));
  assert.equal(capStrategies("   "), "");
});

test("formatEpisode clips a very long turn instead of logging it whole", () => {
  const entry = formatEpisode([{ input: "x".repeat(5_000), reply: "ok" }], TODAY);
  assert.ok(entry.length < 3_000);
  assert.match(entry, /…/);
  assert.match(entry, /^### 09:30:15/);
});

test("dream is selectable as a strategy kind", () => {
  assert.equal(parseMemoryStrategyKind("dream"), "dream");
  const workspace = createLocalWorkspaceStore(mkdtempSync(join(tmpdir(), "dream-kind-")));
  const { strategy } = createMemoryStrategy("dream", {
    harness: {},
    memory: createMemoryService(workspace),
    workspace,
  });
  assert.ok(strategy.onTurnEnd);
  assert.ok(strategy.maintain);
  assert.ok((strategy.promptLines?.() ?? []).length > 0);
});
