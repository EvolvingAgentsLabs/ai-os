/**
 * Conformance gates for a model before it is allowed into an evaluation.
 *
 * The risk this exists for is specific and it is not "the model is bad". It is
 * that an adapter can fail **silently**: an endpoint that accepts a tool schema
 * and never emits a call, a response whose content lands in a field the caller
 * does not read, a model that degrades once history accumulates. Local
 * deployments have historically failed in all three of those ways without
 * raising anything.
 *
 * The consequence is worse than a crash. A runner that quietly drops tool calls
 * scores the harness conditions **as though the tools did not help**, which
 * produces a small, non-significant interaction term — indistinguishable from a
 * genuine finding that the harness does not lift this model. The decision rule
 * then rejects a small-model fleet on the strength of a broken adapter, and
 * nothing in the statistics can tell the difference.
 *
 * So conformance is a gate, not a diagnostic. Every check fails loudly, the
 * result is recorded next to the evaluation it authorises, and an evaluation
 * whose adapter was never verified is not evidence.
 */

export interface ConformanceCheck {
  id: string;
  /** What breaks downstream if this check is skipped. Not a description of the test. */
  matters: string;
  run: () => Promise<{ ok: boolean; detail: string }>;
}

export interface ConformanceResult {
  model: string;
  at: number;
  checks: { id: string; ok: boolean; detail: string; matters: string }[];
  passed: boolean;
}

/** What a runner must be able to do to be worth evaluating. */
export interface EvalRunner {
  name: string;
  /** Plain completion. */
  complete(prompt: string): Promise<string>;
  /** Completion with tools offered. Must report which tools were actually called. */
  completeWithTools(prompt: string, tools: ToolSpec[]): Promise<{ text: string; calls: ToolCall[] }>;
  /** Multi-turn, so history-related degradation is observable rather than assumed absent. */
  completeWithHistory(turns: string[]): Promise<string>;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, "string" | "number">;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

const ECHO: ToolSpec = {
  name: "echo_number",
  description: "Return the number you are given. Call this to answer any question about a number.",
  parameters: { value: "number" },
};

export function conformanceChecks(runner: EvalRunner): ConformanceCheck[] {
  return [
    {
      id: "answers-at-all",
      matters: "A model that returns empty text scores as a total failure and looks like low capability.",
      run: async () => {
        const text = await runner.complete("Reply with exactly the single word: PONG");
        const ok = text.trim().length > 0;
        return { ok, detail: ok ? `${text.trim().slice(0, 40)}` : "empty response" };
      },
    },
    {
      id: "content-not-displaced",
      matters:
        "Some endpoints put the answer in a reasoning field and leave content empty. The eval reads content, so the model scores zero while working correctly.",
      run: async () => {
        const text = await runner.complete("Reply with exactly the single word: PONG");
        const ok = /pong/i.test(text);
        return {
          ok,
          detail: ok
            ? "answer present in the field the eval reads"
            : `answer not in content: ${JSON.stringify(text.slice(0, 80))}`,
        };
      },
    },
    {
      id: "emits-tool-calls",
      matters:
        "THE critical one. Silently emitting no calls makes every harness condition score as bare, which fabricates a null interaction term that reads as a real negative result.",
      run: async () => {
        const { calls } = await runner.completeWithTools("What is the number 42? Use your tool.", [ECHO]);
        const ok = calls.some((c) => c.name === ECHO.name);
        return { ok, detail: ok ? `called ${calls.map((c) => c.name).join(", ")}` : "no tool call emitted" };
      },
    },
    {
      id: "tool-args-parse",
      matters:
        "A call whose arguments do not parse is a call that cannot be executed — the harness degrades to bare without saying so.",
      run: async () => {
        const { calls } = await runner.completeWithTools("What is the number 42? Use your tool.", [ECHO]);
        const call = calls.find((c) => c.name === ECHO.name);
        if (!call) return { ok: false, detail: "no call to inspect" };
        const value = Number(call.args.value);
        const ok = Number.isFinite(value);
        return { ok, detail: ok ? `value=${value}` : `unparseable args: ${JSON.stringify(call.args)}` };
      },
    },
    {
      id: "survives-history",
      matters:
        "Degradation with accumulated history is invisible in single-turn checks and biases every long-trajectory condition downward — exactly where the small-vs-frontier gap is being measured.",
      run: async () => {
        const filler = Array.from({ length: 8 }, (_, i) => `Note ${i}: the sky is blue.`);
        const text = await runner.completeWithHistory([...filler, "Reply with exactly the single word: PONG"]);
        const ok = /pong/i.test(text);
        return {
          ok,
          detail: ok ? "instruction still followed after 8 turns" : `degraded: ${JSON.stringify(text.slice(0, 80))}`,
        };
      },
    },
  ];
}

/**
 * Runs every check and reports all of them, rather than stopping at the first
 * failure — knowing a model fails three checks and which three is worth more
 * than knowing it failed one.
 */
export async function runConformance(runner: EvalRunner, now: () => number = Date.now): Promise<ConformanceResult> {
  const checks: ConformanceResult["checks"] = [];
  for (const check of conformanceChecks(runner)) {
    let ok = false;
    let detail = "";
    try {
      ({ ok, detail } = await check.run());
    } catch (e) {
      detail = `threw: ${(e as Error).message}`;
    }
    checks.push({ id: check.id, ok, detail, matters: check.matters });
  }
  return { model: runner.name, at: now(), checks, passed: checks.every((c) => c.ok) };
}

/**
 * Refuses to proceed unless conformance passed, and unless it passed recently
 * enough to still describe the endpoint in front of you. A local server can be
 * restarted with a different quantisation or template between one day and the
 * next, and the eval would never know.
 */
export function assertConformant(result: ConformanceResult, opts: { maxAgeMs?: number; now?: number } = {}): void {
  const { maxAgeMs = 24 * 60 * 60_000, now = Date.now() } = opts;
  if (!result.passed) {
    const failed = result.checks.filter((c) => !c.ok);
    throw new Error(
      `${result.model} failed conformance; an evaluation against it is not evidence:\n` +
        failed.map((c) => `  ${c.id}: ${c.detail}\n    why it matters: ${c.matters}`).join("\n"),
    );
  }
  const age = now - result.at;
  if (age > maxAgeMs) {
    throw new Error(
      `${result.model} last passed conformance ${Math.round(age / 3_600_000)}h ago; re-run it before trusting this evaluation`,
    );
  }
}

export function formatConformance(result: ConformanceResult): string {
  const lines = [`${result.model} — ${result.passed ? "PASS" : "FAIL"}`];
  for (const c of result.checks) lines.push(`  ${c.ok ? "ok  " : "FAIL"} ${c.id.padEnd(22)} ${c.detail}`);
  return lines.join("\n");
}
