/**
 * Where the desk remembers what you moved.
 *
 * "Spatial" in [04-ai-ui](../../doc/04-ai-ui.md) is defined as *position is
 * meaningful and is saved* — so a canvas whose arrangement dies with the tab has
 * not implemented the property, it has drawn it. This is the smallest store that
 * makes the claim true.
 *
 * One row per scope, holding the whole layout as JSON. Not a row per object,
 * because nothing here queries inside a layout: it is read whole and written
 * whole, and a schema that models the parts would be paying migration cost for
 * a shape still being argued about.
 *
 * ## Keyed by scope, and that is a boundary rather than a convenience
 *
 * Scopes are how permission works everywhere else in this system. A layout
 * fetched by scope id cannot show one project's documents on another's desk, and
 * the projector already refuses to answer for a scope the caller cannot see. The
 * store inherits that rather than inventing a second rule.
 */
import type { DeskLayout } from "./layout.ts";

export interface LayoutStore {
  get(scopeId: string): Promise<DeskLayout | null>;
  put(layout: DeskLayout): Promise<void>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ui_desk_layout(
     scope_id   text PRIMARY KEY,
     layout     jsonb NOT NULL,
     updated_at bigint NOT NULL
   )`,
];

export function createMemoryLayoutStore(): LayoutStore {
  const rows = new Map<string, DeskLayout>();
  return {
    async get(scopeId) {
      const l = rows.get(scopeId);
      // A copy, so a caller mutating what it read cannot change what is stored
      // without saying so. The bug this prevents is a "saved" layout that was
      // never saved and vanishes on restart.
      return l ? (JSON.parse(JSON.stringify(l)) as DeskLayout) : null;
    },
    async put(layout) {
      rows.set(
        layout.scopeId,
        JSON.parse(JSON.stringify(layout)) as DeskLayout,
      );
    },
  };
}

export function createPostgresLayoutStore(
  connectionString: string,
  opts: { now?: () => number } = {},
): LayoutStore {
  const now = opts.now ?? Date.now;
  let poolPromise: Promise<import("pg").Pool> | null = null;

  async function pool() {
    poolPromise ??= (async () => {
      const pg = (await import("pg")).default;
      const p = new pg.Pool({ connectionString });
      for (const statement of SCHEMA) await p.query(statement);
      return p;
    })();
    return poolPromise;
  }

  return {
    async get(scopeId) {
      const p = await pool();
      const r = await p.query<{ layout: DeskLayout }>(
        `SELECT layout FROM ui_desk_layout WHERE scope_id = $1`,
        [scopeId],
      );
      return r.rows[0]?.layout ?? null;
    },
    async put(layout) {
      const p = await pool();
      await p.query(
        `INSERT INTO ui_desk_layout(scope_id, layout, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT (scope_id) DO UPDATE SET layout = EXCLUDED.layout, updated_at = EXCLUDED.updated_at`,
        [layout.scopeId, JSON.stringify(layout), now()],
      );
    },
  };
}
