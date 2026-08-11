/**
 * Generated projections, without letting a render spend money.
 *
 * [04-ai-ui](../../doc/04-ai-ui.md) sets a rule that anything model-backed on
 * this surface has to survive:
 *
 * > **Reading the desk never spends a model call.** The desk polls itself, so a
 * > canvas where rendering could trigger work would spend money because somebody
 * > left a tab open.
 *
 * A projection written by a model — a summary, a set of proposed actions —
 * appears to break it. It does not, and the fix is one word: the trigger is
 * **state change**, not render. The desk already detects change (it re-reads
 * every five seconds and can compare); this module turns that into a cache whose
 * cost is `O(changes)` instead of `O(tabs left open)`.
 *
 * ## `get` cannot compute. That is the whole design.
 *
 * The tempting shape is a lazy cache: `get` computes on a miss. That reintroduces
 * exactly the bug — a fresh tab is a miss, so opening the page spends a call, and
 * ten people opening it spend ten. So:
 *
 *   - **`get()` is pure.** It returns what is there, or `null`. It never
 *     computes, never awaits, never spends.
 *   - **`refresh()` computes**, and only when the key it is handed differs from
 *     the key already stored.
 *
 * The consequence is deliberate and worth stating rather than hiding: **a
 * projection is one poll late.** The desk renders without it, and it appears on
 * the next cycle. Five seconds of a missing summary is a fair price for a canvas
 * that cannot bill you for being open.
 *
 * ## Keyed by the state it describes
 *
 * The key is a digest of the state the projection was computed from, so a
 * projection can never be shown against state it does not describe — it is either
 * current or absent. A timestamp would not give that: it would let a stale
 * summary sit next to changed state, which is the failure mode where the
 * interface is confidently wrong.
 *
 * ## What it does not do
 *
 * No retry policy, no backoff, no queue. A generator that throws leaves the
 * previous projection in place and logs nothing here — the caller decides. This
 * module is 100 lines because the interesting part is the trigger, and a cache
 * that grew a scheduler would be the first instalment of the infrastructure bill
 * this pillar is most at risk of paying early.
 */
import { createHash } from "node:crypto";

/**
 * A stable digest of whatever the projection was computed from.
 *
 * `JSON.stringify` is not canonical across key orders, so the input is walked
 * and its object keys sorted. Two states that differ only in property order are
 * the same state, and re-generating for them would spend a model call on nothing.
 */
export function stateKey(value: unknown): string {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, canon(x)]),
      );
    }
    return v;
  };
  return createHash("sha256")
    .update(JSON.stringify(canon(value)) ?? "null")
    .digest("hex")
    .slice(0, 16);
}

export interface Projected<T> {
  key: string;
  value: T;
  /** When it was generated, for the desk to say how fresh the enrichment is. */
  at: number;
}

export interface ProjectionCache<T> {
  /** Pure. Returns null rather than computing — see the docblock. */
  get(subject: string, key: string): Projected<T> | null;
  /**
   * Generate if `key` differs from what is stored. Returns whether it ran.
   *
   * Errors from `compute` propagate and leave the previous entry untouched: a
   * failed generation must not blank a projection that is still true of state
   * that has not changed.
   */
  refresh(
    subject: string,
    key: string,
    compute: () => Promise<T>,
  ): Promise<boolean>;
  /** How many subjects are held. Bounded — see `max`. */
  size(): number;
}

export interface ProjectionCacheOptions {
  /**
   * Most subjects held at once. Oldest-touched is evicted.
   *
   * Bounded because the desk's subject set grows with every flow a scope ever
   * had, and an unbounded map on a long-lived server is a leak that only shows
   * up in the one process nobody restarts.
   */
  max?: number;
  now?: () => number;
}

export function createProjectionCache<T>(
  opts: ProjectionCacheOptions = {},
): ProjectionCache<T> {
  const max = opts.max ?? 200;
  const now = opts.now ?? Date.now;
  // Insertion order is touch order: re-setting moves an entry to the end.
  const held = new Map<string, Projected<T>>();

  return {
    get(subject, key) {
      const hit = held.get(subject);
      // Key mismatch is a miss, not a stale hit. A projection is shown against
      // the state it describes or it is not shown.
      return hit && hit.key === key ? hit : null;
    },

    async refresh(subject, key, compute) {
      if (held.get(subject)?.key === key) return false;
      const value = await compute();
      held.delete(subject);
      held.set(subject, { key, value, at: now() });
      while (held.size > max) {
        const oldest = held.keys().next();
        if (oldest.done) break;
        held.delete(oldest.value);
      }
      return true;
    },

    size() {
      return held.size;
    },
  };
}
