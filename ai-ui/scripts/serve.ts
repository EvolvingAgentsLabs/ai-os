/**
 * Run the desk.
 *
 *   # 1. core (ai-base)          :8080
 *   # 2. the flow API (ai-flows) :8097   -- must be started with a conformation provider
 *   cd ai-ui && node --env-file=/path/to/core.env scripts/serve.ts
 *   # -> http://localhost:8098
 *
 * It talks to `ai-flows` over HTTP and owns nothing but the layout. If
 * `DATABASE_URL` is set the layout survives a restart; if it is not, the desk
 * still works and says so in the log rather than pretending — an arrangement
 * that silently evaporates is worse than one that was never promised.
 */
import { createFlowsHttpClient } from "../src/flows-http.ts";
import {
  createMemoryLayoutStore,
  createPostgresLayoutStore,
} from "../src/layout-store.ts";
import { createDeskServer } from "../src/server.ts";

const FLOWS = process.env.FLOWS_API_URL ?? "http://localhost:8097";
const PORT = Number(process.env.DESK_PORT ?? 8098);
const DB = process.env.DATABASE_URL;

const flows = createFlowsHttpClient({
  baseUrl: FLOWS,
  ...(process.env.FLOWS_SIGNING_SECRET
    ? { signingSecret: process.env.FLOWS_SIGNING_SECRET }
    : {}),
});

const layouts = DB ? createPostgresLayoutStore(DB) : createMemoryLayoutStore();

// Fail here rather than on the first drag: a desk that renders and then cannot
// read the system is the failure mode that looks like an empty project.
try {
  const c = await flows.conformation();
  console.log(
    `[desk] ai-flows at ${FLOWS} — harness ${c.harness}, ${c.scopes.length} scope(s)`,
  );
} catch (e) {
  console.error(
    `[desk] cannot reach ai-flows at ${FLOWS}: ${e instanceof Error ? e.message : String(e)}`,
  );
  console.error(
    `[desk] start it with a conformation provider wired in (ai-flows/scripts/serve.ts).`,
  );
  process.exit(1);
}

createDeskServer({ flows, layouts }).listen(PORT, () => {
  console.log(`[desk] http://localhost:${PORT}`);
  console.log(
    `[desk] layout ${DB ? "persisted in Postgres" : "IN MEMORY — arrangements are lost on restart"}`,
  );
});
