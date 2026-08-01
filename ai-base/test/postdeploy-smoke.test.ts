import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkDeployedHealth,
  checkSlackCredentials,
  deployedHealthUrls,
  firstAdminPrincipal,
  INVALID_INDEX_QUERY,
  PARALLEL_EXCEPTION_QUERY,
  stagingApiHeaders,
} from "../src/deployment/postdeploy-smoke.ts";
import { PORTAL_IDENTITY_HEADER, verifyPortalIdentity } from "../src/auth/portal-identity.ts";

test("deployed database smoke rejects the parallel exception-handler failure class", () => {
  assert.match(PARALLEL_EXCEPTION_QUERY, /p\.proparallel = 's'/);
  assert.ok(PARALLEL_EXCEPTION_QUERY.includes("p.prosrc ~* '\\mEXCEPTION\\M'"));
  assert.match(PARALLEL_EXCEPTION_QUERY, /l\.lanname = 'plpgsql'/);
});

test("deployed database smoke rejects invalid or unready indexes", () => {
  assert.match(INVALID_INDEX_QUERY, /NOT i\.indisvalid OR NOT i\.indisready/);
});

test("deployed API smoke uses a configured real org admin", () => {
  assert.equal(firstAdminPrincipal("josh@example.com:org_admin,other@example.com:org_admin"), "josh@example.com");
  assert.throws(() => firstAdminPrincipal(undefined), /requires ADMIN_GRANTS/);
  assert.throws(() => firstAdminPrincipal("josh@example.com:viewer"), /requires ADMIN_GRANTS/);
});

test("deployed API smoke proves the production portal-identity boundary", async () => {
  const now = Date.now();
  const headers = await stagingApiHeaders(
    "acme",
    "josh@example.com",
    "source-secret",
    "portal-secret",
    "/v1/admin/sessions",
    now,
  );
  assert.equal(headers["x-admin-actor"], "josh@example.com@acme");
  const actor = await verifyPortalIdentity(headers[PORTAL_IDENTITY_HEADER]!, "portal-secret", now);
  assert.equal(actor?.p, "josh@example.com");
});

test("deployed staging smoke reaches every Fly service and the public portal", () => {
  assert.deepEqual(deployedHealthUrls("qm-core", "https://qm-portal.fly.dev"), [
    "http://127.0.0.1:8080/healthz",
    "http://qm-admin.internal:8080/healthz",
    "http://qm-web-ui.flycast/healthz",
    "http://qm-portal.internal:8080/healthz",
    "https://qm-portal.fly.dev/healthz",
  ]);
  assert.throws(() => deployedHealthUrls("wrong-app", "https://example.com"), /FLY_APP_NAME ending in -core/);
});

test("deployed staging health rejects an unhealthy service", async () => {
  await assert.rejects(
    checkDeployedHealth(["http://core/healthz", "http://portal/healthz"], async (input) => {
      return new Response(null, { status: String(input).includes("portal") ? 503 : 200 });
    }),
    /http:\/\/portal\/healthz returned 503/,
  );
});

test("deployed staging smoke verifies its own Slack bot and Socket Mode credentials", async () => {
  const calls: Array<{ url: string; authorization: string | null }> = [];
  await checkSlackCredentials("xoxb-secret", "xapp-secret", "https://slack.example/api", async (input, init) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return Response.json({ ok: true });
  });
  assert.deepEqual(calls, [
    { url: "https://slack.example/api/auth.test", authorization: "Bearer xoxb-secret" },
    { url: "https://slack.example/api/apps.connections.open", authorization: "Bearer xapp-secret" },
  ]);
  await assert.rejects(
    checkSlackCredentials("xoxb-secret", "xapp-secret", undefined, async () =>
      Response.json({ ok: false, error: "invalid_auth" }),
    ),
    /Slack auth\.test failed: invalid_auth/,
  );
});
