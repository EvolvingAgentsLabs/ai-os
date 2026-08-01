import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest, createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/api/app.ts";
import { createInsecureTestServer } from "../src/api/server.ts";
import { createDeployStore } from "../src/deploy/deploy-store.ts";
import { createDeployService } from "../src/deploy/deploy-service.ts";
import { createAclStore } from "../src/acl/acl-store.ts";
import { createDirectoryStore } from "../src/directory/directory-store.ts";
import { createIdentityService } from "../src/identity/identity-service.ts";
import { createMemorySessionStore } from "../src/sessions/memory-session-store.ts";
import { mintDeployOwnerToken } from "../src/deploy/access-token.ts";
import { createHmac } from "node:crypto";
import { scopeId } from "../src/types.ts";

const auditLog = { record() {}, events: async () => [], tail: async () => [] };
const GATE_SECRET = "gate-secret";
const PORTAL = "https://portal.example.com";

function appServingUpstream(upstreamPort: number) {
  const deployStore = createDeployStore();
  const acl = createAclStore();
  const deploy = createDeployService({
    deployStore,
    provider: {
      profile: { managedScaleToZero: false },
      apply: async () => ({ host: "127.0.0.1", port: upstreamPort }),
      destroy: async () => {},
    },
    auditLog,
    acl,
    deployDir: mkdtempSync(join(tmpdir(), "edit-widget-")),
  });
  return createApp({
    deploy,
    acl,
    directory: createDirectoryStore(),
    sessions: createMemorySessionStore(),
    identity: createIdentityService(),
    orgId: "acme",
  } as unknown as Parameters<typeof createApp>[0]);
}

function httpGet(
  port: number,
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "localhost", port, path, method: "GET", headers }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function widgetFixture(upstreamHandler?: Parameters<typeof createHttpServer>[1]) {
  const upstream = createHttpServer(
    upstreamHandler ??
      ((_req, res) => {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<html><body>APP</body></html>");
      }),
  );
  upstream.listen(0);
  await new Promise((r) => upstream.once("listening", r));
  const upstreamPort = (upstream.address() as AddressInfo).port;
  const app = appServingUpstream(upstreamPort);
  const d = await app.deploy({
    ownerScopeId: scopeId("personal", "U1"),
    createdBy: "U1",
    entrypoint: "x",
    files: [],
    name: "mysite",
  });
  await app.shareDeployment(d.id, scopeId("personal", "U-viewer"), "read", { createdBy: "U1" });
  const server = createInsecureTestServer(app, {
    deployAppsDomain: "apps.example.com",
    deployGateSecret: GATE_SECRET,
    deployAppsLoginUrl: PORTAL,
    deployAppsSessionSecret: "portal-session-secret",
  });
  server.listen(0);
  const port = (server.address() as AddressInfo).port;
  const close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  };
  return { app, port, close };
}

const HOST = "mysite.apps.example.com";
function mintPortalSession(sub: string): string {
  const key = createHmac("sha256", "portal-session-secret").update("portal.session.v1").digest();
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ k: "session", sub, org: "acme", iat: now, exp: now + 3600 })).toString(
    "base64url",
  );
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}
const viewerCookie = () => `portal_session=${mintPortalSession("U-viewer")}`;
const ownerToken = (sub: string, expInMs = 60_000) =>
  mintDeployOwnerToken(GATE_SECRET, { slug: "mysite", sub, exp: Date.now() + expInMs });

test("edit widget: a valid owner link becomes a host-only cookie and turns on HTML injection", async () => {
  const f = await widgetFixture();
  try {
    const token = await ownerToken("U1");
    const swallow = await httpGet(f.port, `/?owner=${encodeURIComponent(token)}`, { Host: HOST });
    assert.equal(swallow.status, 302, "the owner token is swallowed into a redirect");
    const setCookie = ([] as string[]).concat(swallow.headers["set-cookie"] as string[] | string).join("\n");
    assert.match(setCookie, /dpl_owner=/, "the owner session lands in a cookie");
    assert.match(setCookie, /HttpOnly/, "the owner cookie is HttpOnly");
    assert.equal(swallow.headers.location, "/", "the redirect drops the token from the URL");

    const page = await httpGet(f.port, "/", { Host: HOST, Cookie: `dpl_owner=${token}` });
    assert.equal(page.status, 200);
    assert.match(page.body, /<html><body>APP<\/body><\/html>/, "the app's own HTML is intact");
    assert.match(page.body, /<script src="\/__claw__\/widget\.js" defer/, "the widget tag is appended");
    assert.match(page.body, new RegExp(`data-portal="${PORTAL}"`), "the widget knows the portal origin");
    assert.match(page.body, /data-slug="mysite"/, "the widget knows the app");
  } finally {
    await f.close();
  }
});

test("edit widget: a plain visitor (granted, signed in) gets untouched HTML and no widget endpoints", async () => {
  const f = await widgetFixture();
  try {
    const page = await httpGet(f.port, "/", { Host: HOST, Cookie: viewerCookie() });
    assert.equal(page.status, 200);
    assert.equal(page.body, "<html><body>APP</body></html>", "no injection for a non-owner");

    const js = await httpGet(f.port, "/__claw__/widget.js", { Host: HOST, Cookie: viewerCookie() });
    assert.doesNotMatch(js.body, /__clawEditWidget/, "the gateway serves no widget to non-owners");
  } finally {
    await f.close();
  }
});

test("edit widget: owner endpoints serve the script and the applied version", async () => {
  const f = await widgetFixture();
  try {
    const token = await ownerToken("U1");
    const js = await httpGet(f.port, "/__claw__/widget.js", { Host: HOST, Cookie: `dpl_owner=${token}` });
    assert.equal(js.status, 200);
    assert.match(String(js.headers["content-type"]), /text\/javascript/);
    assert.match(js.body, /__clawEditWidget/, "the widget script is served");

    const version = await httpGet(f.port, "/__claw__/version", { Host: HOST, Cookie: `dpl_owner=${token}` });
    assert.equal(version.status, 200);
    assert.equal(JSON.parse(version.body).version, 1, "the applied version is reported");
  } finally {
    await f.close();
  }
});

test("edit widget: an owner's XHR/fetch HTML fragment is not injected (sec-fetch-dest gate)", async () => {
  const f = await widgetFixture();
  try {
    const token = await ownerToken("U1");
    const frag = await httpGet(f.port, "/fragment", {
      Host: HOST,
      Cookie: `dpl_owner=${token}`,
      "Sec-Fetch-Dest": "empty",
    });
    assert.equal(frag.status, 200);
    assert.doesNotMatch(frag.body, /__claw__\/widget\.js/, "a non-document HTML load is left untouched");
  } finally {
    await f.close();
  }
});

test("edit widget: a 206 partial HTML response is not injected", async () => {
  const f = await widgetFixture((_req, res) => {
    res.writeHead(206, { "content-type": "text/html", "content-range": "bytes 0-9/32" });
    res.end("<html></h");
  });
  try {
    const token = await ownerToken("U1");
    const r = await httpGet(f.port, "/", { Host: HOST, Cookie: `dpl_owner=${token}` });
    assert.equal(r.status, 206);
    assert.equal(r.body, "<html></h", "a range slice stays byte-exact");
  } finally {
    await f.close();
  }
});

test("edit widget: a non-owner request to /__claw__/ falls through to the app, not a gateway 404", async () => {
  const f = await widgetFixture((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`APP SAW ${req.url}`);
  });
  try {
    const r = await httpGet(f.port, "/__claw__/version", { Host: HOST, Cookie: viewerCookie() });
    assert.equal(r.status, 200, "the app's own path space is not shadowed for non-owners");
    assert.match(r.body, /APP SAW \/__claw__\/version/);
  } finally {
    await f.close();
  }
});

test("edit widget: an owner token for someone who cannot manage the app grants nothing", async () => {
  const f = await widgetFixture();
  try {
    const forged = await ownerToken("U-stranger");
    const swallow = await httpGet(f.port, `/?owner=${encodeURIComponent(forged)}`, { Host: HOST });
    assert.equal(swallow.status, 401, "a non-manager's owner token leaves them an anonymous visitor");
    assert.equal(swallow.headers["set-cookie"], undefined, "no owner cookie for a non-manager");

    const page = await httpGet(f.port, "/", { Host: HOST, Cookie: `dpl_owner=${forged}; ${viewerCookie()}` });
    assert.equal(page.status, 200, "the visitor's own grant still admits them");
    assert.doesNotMatch(page.body, /__claw__\/widget\.js/, "a forged owner cookie injects no widget");
  } finally {
    await f.close();
  }
});

test("edit widget: an expired owner token is rejected", async () => {
  const f = await widgetFixture();
  try {
    const expired = await ownerToken("U1", -1);
    const page = await httpGet(f.port, "/", { Host: HOST, Cookie: `dpl_owner=${expired}` });
    assert.equal(page.status, 401, "an expired owner session is just an anonymous visitor");
  } finally {
    await f.close();
  }
});

test("edit widget: non-HTML responses stream through untouched even for the owner", async () => {
  const f = await widgetFixture((_req, res) => {
    res.writeHead(200, { "content-type": "application/json", "content-length": "13" });
    res.end('{"data":true}');
  });
  try {
    const token = await ownerToken("U1");
    const r = await httpGet(f.port, "/api/data", { Host: HOST, Cookie: `dpl_owner=${token}` });
    assert.equal(r.status, 200);
    assert.equal(r.body, '{"data":true}', "JSON is byte-identical");
    assert.equal(r.headers["content-length"], "13", "content-length survives when nothing is injected");
  } finally {
    await f.close();
  }
});

test("edit widget: injection drops the stale content-length so the page still parses", async () => {
  const html = "<html><body>SIZED</body></html>";
  const f = await widgetFixture((_req, res) => {
    res.writeHead(200, { "content-type": "text/html", "content-length": String(html.length) });
    res.end(html);
  });
  try {
    const token = await ownerToken("U1");
    const r = await httpGet(f.port, "/", { Host: HOST, Cookie: `dpl_owner=${token}` });
    assert.equal(r.status, 200);
    assert.match(r.body, /SIZED/);
    assert.match(r.body, /__claw__\/widget\.js/);
    assert.equal(r.headers["content-length"], undefined, "the now-wrong content-length is dropped");
  } finally {
    await f.close();
  }
});

test("edit widget: an app cannot plant the owner cookie on its visitors", async () => {
  const f = await widgetFixture((_req, res) => {
    res.writeHead(200, {
      "content-type": "text/html",
      "set-cookie": ["dpl_owner=forged; Path=/", "app_pref=ok; Path=/"],
    });
    res.end("<html></html>");
  });
  try {
    const r = await httpGet(f.port, "/", { Host: HOST, Cookie: viewerCookie() });
    const cookies = ([] as string[]).concat((r.headers["set-cookie"] as string[] | string) ?? []).join("\n");
    assert.doesNotMatch(cookies, /dpl_owner/, "the gateway strips an app-minted dpl_owner");
    assert.match(cookies, /app_pref=ok/, "the app's own cookies still flow");
  } finally {
    await f.close();
  }
});

test("owner-url mint: a manager gets an owner-token link; others are refused", async () => {
  const f = await widgetFixture();
  try {
    const ok = await httpGet(f.port, "/v1/deployments/mysite/owner-url?principalId=U1", {});
    assert.equal(ok.status, 200);
    const { url } = JSON.parse(ok.body) as { url: string };
    assert.match(url, /^https:\/\/mysite\.apps\.example\.com\/\?owner=/, "the link targets the app's public origin");
    assert.doesNotMatch(url, /access=/, "the owner link carries no piggybacked capability token");

    const denied = await httpGet(f.port, "/v1/deployments/mysite/owner-url?principalId=U-stranger", {});
    assert.equal(denied.status, 403, "a non-manager cannot mint an owner link");
  } finally {
    await f.close();
  }
});
