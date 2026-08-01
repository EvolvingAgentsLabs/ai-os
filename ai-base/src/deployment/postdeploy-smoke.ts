import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PORTAL_IDENTITY_HEADER } from "../auth/portal-identity.ts";
import { mintSignedPayload } from "../auth/signed-token.ts";
import { signedRequestHeaders } from "../auth/source-auth-sign.ts";
import { loadConfig, type Config } from "../config.ts";

export const PARALLEL_EXCEPTION_QUERY = `
  SELECT n.nspname AS schema_name, p.proname AS function_name
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE l.lanname = 'plpgsql'
    AND p.proparallel = 's'
    AND p.prosrc ~* '\\mEXCEPTION\\M'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
`;

export const INVALID_INDEX_QUERY = `
  SELECT n.nspname AS schema_name, c.relname AS index_name
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE (NOT i.indisvalid OR NOT i.indisready)
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
`;

export function firstAdminPrincipal(raw: string | undefined): string {
  const principal = raw
    ?.split(",")
    .map((entry) => entry.trim())
    .find((entry) => entry.endsWith(":org_admin"))
    ?.slice(0, -":org_admin".length)
    .trim();
  if (!principal) throw new Error("postdeploy smoke requires ADMIN_GRANTS with an org_admin");
  return principal;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function deployedHealthUrls(flyAppName: string | undefined, publicWebUrl: string | undefined): string[] {
  if (!flyAppName?.endsWith("-core")) throw new Error("postdeploy smoke requires FLY_APP_NAME ending in -core");
  if (!publicWebUrl) throw new Error("postdeploy smoke requires PUBLIC_WEB_URL");
  const prefix = flyAppName.slice(0, -"-core".length);
  return [
    "http://127.0.0.1:8080/healthz",
    `http://${prefix}-admin.internal:8080/healthz`,
    `http://${prefix}-web-ui.flycast/healthz`,
    `http://${prefix}-portal.internal:8080/healthz`,
    new URL("/healthz", publicWebUrl).toString(),
  ];
}

export async function checkDeployedHealth(urls: string[], fetchImpl: FetchLike = fetch): Promise<void> {
  for (const url of urls) {
    const response = await fetchImpl(url, { redirect: "manual" });
    if (!response.ok) throw new Error(`deployed staging health ${url} returned ${response.status}`);
  }
}

export async function checkSlackCredentials(
  botToken: string | undefined,
  appToken: string | undefined,
  apiUrl: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  if (!botToken) throw new Error("postdeploy smoke requires SLACK_BOT_TOKEN");
  if (!appToken) throw new Error("postdeploy smoke requires SLACK_APP_TOKEN");
  const root = (apiUrl ?? "https://slack.com").replace(/\/+$/, "");
  const base = root.endsWith("/api") ? `${root}/` : `${root}/api/`;
  for (const [method, token] of [
    ["auth.test", botToken],
    ["apps.connections.open", appToken],
  ] as const) {
    const response = await fetchImpl(`${base}${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/x-www-form-urlencoded",
      },
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || result.ok !== true) {
      throw new Error(`staging Slack ${method} failed: ${result.error ?? `HTTP ${response.status}`}`);
    }
  }
}

export async function stagingApiHeaders(
  orgId: string,
  principalId: string,
  sourceSecret: string,
  portalIdentitySecret: string,
  path: string,
  nowMs = Date.now(),
): Promise<Record<string, string>> {
  const portalIdentity = await mintSignedPayload({ p: principalId, exp: nowMs + 60_000 }, portalIdentitySecret);
  return signedRequestHeaders(
    sourceSecret,
    "GET",
    path,
    "",
    {
      "x-admin-actor": `${principalId}@${orgId}`,
      [PORTAL_IDENTITY_HEADER]: portalIdentity,
    },
    Math.floor(nowMs / 1000),
  );
}

async function checkApi(
  orgId: string,
  principalId: string,
  sourceSecret: string,
  portalIdentitySecret: string,
  port: string,
): Promise<void> {
  const path = `/v1/admin/sessions?scope=${encodeURIComponent(`org:${orgId}`)}&limit=5&_smoke=${randomUUID()}`;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: await stagingApiHeaders(orgId, principalId, sourceSecret, portalIdentitySecret, path),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`staging session API returned ${response.status}: ${body.slice(0, 500)}`);
  const parsed = JSON.parse(body) as { sessions?: unknown[] };
  if (!Array.isArray(parsed.sessions)) throw new Error("staging session API response has no sessions array");
}

type PostdeployConfig = Pick<
  Config,
  | "adminGrants"
  | "databaseUrl"
  | "flyAppName"
  | "orgId"
  | "port"
  | "portalIdentitySecret"
  | "publicWebUrl"
  | "signingSecret"
  | "slack"
>;

async function runPostdeploySmoke(config: PostdeployConfig): Promise<void> {
  const { databaseUrl, orgId, portalIdentitySecret, signingSecret: sourceSecret } = config;
  if (!databaseUrl) throw new Error("postdeploy smoke requires DATABASE_URL");
  if (!orgId) throw new Error("postdeploy smoke requires ORG_ID");
  if (!sourceSecret) throw new Error("postdeploy smoke requires CORE_SIGNING_SECRET");
  if (!portalIdentitySecret) throw new Error("postdeploy smoke requires PORTAL_IDENTITY_SECRET");

  const pg = (await import("pg")).default;
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const unsafe = await client.query(PARALLEL_EXCEPTION_QUERY);
    if (unsafe.rows.length) {
      throw new Error(`parallel-safe PL/pgSQL exception handlers: ${JSON.stringify(unsafe.rows)}`);
    }
    const invalid = await client.query(INVALID_INDEX_QUERY);
    if (invalid.rows.length) throw new Error(`invalid PostgreSQL indexes: ${JSON.stringify(invalid.rows)}`);
  } finally {
    await client.end();
  }

  await checkApi(
    orgId,
    firstAdminPrincipal(config.adminGrants),
    sourceSecret,
    portalIdentitySecret,
    String(config.port),
  );
  await checkDeployedHealth(deployedHealthUrls(config.flyAppName, config.publicWebUrl));
  await checkSlackCredentials(config.slack?.botToken, config.slack?.appToken, config.slack?.apiUrl);
  console.log("deployed staging database, API, services, public route, and Slack smoke passed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runPostdeploySmoke(loadConfig());
}
