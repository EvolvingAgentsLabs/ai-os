/**
 * Which model this tree runs on, and why that is a variable.
 *
 * Two providers, one switch, because the tree's argument is about *shape* —
 * declared subagents, isolated context, narrowed tools — and none of that is an
 * argument for a particular model. Making the choice a constant would have
 * smuggled a model decision into a structural change, and doc/11 is where a
 * model choice has to be argued.
 *
 * - `AI_OS_PROVIDER=google` (default) — Gemini through the AI SDK provider
 *   directly. Needs `GOOGLE_GENERATIVE_AI_API_KEY`; no gateway, no account, no
 *   deploy.
 * - `AI_OS_PROVIDER=openrouter` — one key, every model worth comparing, which is
 *   what makes doc/11's question answerable at all: the same tree against
 *   several models is a comparison, and the same tree against the one model we
 *   happen to have credentials for is an anecdote.
 * - `AI_OS_PROVIDER=compatible` — any other OpenAI-compatible endpoint at
 *   `AI_OS_BASE_URL`.
 *
 * The provider is read at call time rather than at import, so a test can switch
 * it without rebuilding — and so the choice stays visible in the environment
 * instead of compiled into the artefact.
 */
import { google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export function model(): LanguageModel {
  const provider = process.env.AI_OS_PROVIDER ?? "google";
  const name = process.env.AI_OS_MODEL ?? "gemini-2.5-flash";

  if (provider === "openrouter") {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("AI_OS_PROVIDER=openrouter needs OPENROUTER_API_KEY");
    return createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      headers: { Authorization: `Bearer ${key}` },
    })(name);
  }

  if (provider === "compatible") {
    const base = process.env.AI_OS_BASE_URL;
    if (!base) throw new Error("AI_OS_PROVIDER=compatible needs AI_OS_BASE_URL");
    return createOpenAICompatible({ name: "compatible", baseURL: base })(name);
  }

  return google(name);
}

/**
 * Declared, because a model reached through an OpenAI-compatible endpoint is not
 * in the AI Gateway catalogue and eve refuses to compile compaction it cannot
 * budget for. Refusing is the right call — a compaction threshold computed from
 * a guessed window compacts at the wrong time and silently drops turns — so the
 * number is stated here rather than inferred.
 *
 * The floor of the models this tree is run against, not the ceiling: too small
 * only compacts sooner than necessary, too large overruns the window.
 */
export const CONTEXT_WINDOW_TOKENS = 128_000;
