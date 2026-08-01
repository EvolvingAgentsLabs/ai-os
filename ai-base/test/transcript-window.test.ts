import "./support/auto-fake-sprites.ts";

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createInsecureTestServer } from "../src/api/server.ts";
import { buildApp, type BuiltApp } from "../src/wiring.ts";
import { windowedTranscript } from "../src/sessions/session-store.ts";
import type { SessionEntry } from "../src/types.ts";
import { scopeId } from "../src/types.ts";
import { testConfig } from "./support/test-config.ts";

function entry(seq: number, type: SessionEntry["type"]): SessionEntry {
  return {
    sessionId: "s1",
    seq,
    parentSeq: seq === 0 ? null : seq - 1,
    type,
    payload: { text: `e${seq}` },
    scopeLabel: scopeId("personal", "U1"),
    createdAt: seq,
  };
}

const LOG: SessionEntry[] = [
  entry(0, "user"),
  entry(1, "tool_call"),
  entry(2, "tool_result"),
  entry(3, "assistant"),
  entry(4, "user"),
  entry(5, "assistant"),
  entry(6, "user"),
  entry(7, "tool_call"),
  entry(8, "assistant"),
];

test("windowedTranscript: tailTurns cuts on a turn boundary (a user entry), never mid-turn", () => {
  const one = windowedTranscript(LOG, { tailTurns: 1 });
  assert.deepEqual(
    one.entries.map((e) => e.seq),
    [6, 7, 8],
    "the last turn starts at its user entry",
  );
  assert.equal(one.earlier, 6);

  const two = windowedTranscript(LOG, { tailTurns: 2 });
  assert.deepEqual(
    two.entries.map((e) => e.seq),
    [4, 5, 6, 7, 8],
  );
  assert.equal(two.earlier, 4);
});

test("windowedTranscript: asking for more turns than exist returns everything", () => {
  const all = windowedTranscript(LOG, { tailTurns: 99 });
  assert.equal(all.entries.length, LOG.length);
  assert.equal(all.earlier, 0);
});

test("windowedTranscript: no window returns everything", () => {
  const all = windowedTranscript(LOG);
  assert.equal(all.entries.length, LOG.length);
  assert.equal(all.earlier, 0);
});

test("windowedTranscript: sinceSeq re-reads from an anchor, counting what it skipped", () => {
  const w = windowedTranscript(LOG, { sinceSeq: 4 });
  assert.deepEqual(
    w.entries.map((e) => e.seq),
    [4, 5, 6, 7, 8],
  );
  assert.equal(w.earlier, 4);

  const none = windowedTranscript(LOG, { sinceSeq: 0 });
  assert.equal(none.entries.length, LOG.length);
  assert.equal(none.earlier, 0);

  const past = windowedTranscript(LOG, { sinceSeq: 999 });
  assert.equal(past.entries.length, 0, "an anchor past the end yields an empty window");
  assert.equal(past.earlier, LOG.length);
});

test("windowedTranscript: beforeSeq pages history backward on turn boundaries", () => {
  const page = windowedTranscript(LOG, { beforeSeq: 6, tailTurns: 1 });
  assert.deepEqual(
    page.entries.map((e) => e.seq),
    [4, 5],
    "the turn immediately before the anchor",
  );
  assert.equal(page.earlier, 4, "what remains before THIS page, not before the original tail");

  const next = windowedTranscript(LOG, { beforeSeq: 4, tailTurns: 1 });
  assert.deepEqual(
    next.entries.map((e) => e.seq),
    [0, 1, 2, 3],
  );
  assert.equal(next.earlier, 0, "the log is exhausted — the button disappears");
});

test("windowedTranscript: beforeSeq alone truncates; wider-than-history pages return everything left", () => {
  const prefix = windowedTranscript(LOG, { beforeSeq: 4 });
  assert.deepEqual(
    prefix.entries.map((e) => e.seq),
    [0, 1, 2, 3],
  );
  assert.equal(prefix.earlier, 0);

  const wide = windowedTranscript(LOG, { beforeSeq: 6, tailTurns: 99 });
  assert.deepEqual(
    wide.entries.map((e) => e.seq),
    [0, 1, 2, 3, 4, 5],
  );
  assert.equal(wide.earlier, 0);

  const past = windowedTranscript(LOG, { beforeSeq: 999, tailTurns: 1 });
  assert.deepEqual(
    past.entries.map((e) => e.seq),
    [6, 7, 8],
    "an anchor past the end behaves like a plain tail read",
  );
});

function start(): { base: string; built: BuiltApp; close: () => Promise<void> } {
  const built = buildApp(testConfig({ dataDir: mkdtempSync(join(tmpdir(), "transcript-window-")) }));
  const server = createInsecureTestServer(built.app, {
    config: built.config,
    admin: built.admin,
    auditLog: built.auditLog,
  });
  server.listen(0);
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  return { base, built, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test("GET /v1/sessions/:id honors tailTurns/sinceSeq and reports earlierEntries", async () => {
  const srv = start();
  try {
    const actor = { externalId: "U1" };
    const threadRef = "web:U1:window-test";
    let sessionId = "";
    for (const text of ["first turn", "second turn", "third turn"]) {
      const r = await fetch(`${srv.base}/v1/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surface: "test", actor, conversation: { kind: "dm", threadRef }, text }),
      });
      const body = (await r.json()) as { status: string; sessionId?: string };
      assert.equal(body.status, "ok");
      sessionId = body.sessionId!;
    }

    const full = await fetch(`${srv.base}/v1/sessions/${encodeURIComponent(sessionId)}?viewer=U1`);
    assert.equal(full.status, 200);
    const fullBody = (await full.json()) as { entries: SessionEntry[]; earlierEntries?: number };
    assert.equal(fullBody.earlierEntries, undefined, "an unwindowed read never reports earlierEntries");
    const userSeqs = fullBody.entries.filter((e) => e.type === "user").map((e) => e.seq);
    assert.equal(userSeqs.length, 3);

    const tail = await fetch(`${srv.base}/v1/sessions/${encodeURIComponent(sessionId)}?viewer=U1&tailTurns=1`);
    assert.equal(tail.status, 200);
    const tailBody = (await tail.json()) as { entries: SessionEntry[]; earlierEntries?: number };
    assert.equal(tailBody.entries[0]!.seq, userSeqs[2], "the window opens on the last turn's user entry");
    assert.equal(tailBody.earlierEntries, userSeqs[2], "everything before the anchor is counted, not shipped");
    assert.equal(tailBody.entries.length + tailBody.earlierEntries!, fullBody.entries.length);

    const since = await fetch(
      `${srv.base}/v1/sessions/${encodeURIComponent(sessionId)}?viewer=U1&sinceSeq=${userSeqs[1]}`,
    );
    const sinceBody = (await since.json()) as { entries: SessionEntry[]; earlierEntries?: number };
    assert.equal(sinceBody.entries[0]!.seq, userSeqs[1], "sinceSeq re-reads from the same boundary");

    const wide = await fetch(`${srv.base}/v1/sessions/${encodeURIComponent(sessionId)}?viewer=U1&tailTurns=999`);
    const wideBody = (await wide.json()) as { entries: SessionEntry[]; earlierEntries?: number };
    assert.equal(wideBody.entries.length, fullBody.entries.length);
    assert.equal(wideBody.earlierEntries, undefined);

    const before = await fetch(
      `${srv.base}/v1/sessions/${encodeURIComponent(sessionId)}?viewer=U1&beforeSeq=${userSeqs[2]}&tailTurns=1`,
    );
    assert.equal(before.status, 200);
    const beforeBody = (await before.json()) as { entries: SessionEntry[]; earlierEntries?: number };
    assert.equal(beforeBody.entries[0]!.seq, userSeqs[1], "the page opens on the previous turn's user entry");
    assert.ok(
      beforeBody.entries.every((e) => e.seq < userSeqs[2]!),
      "nothing at or past the anchor is re-shipped",
    );
    assert.equal(beforeBody.earlierEntries, userSeqs[1], "what remains before this page");

    const bad = await fetch(`${srv.base}/v1/sessions/${encodeURIComponent(sessionId)}?viewer=U1&tailTurns=0`);
    assert.equal(bad.status, 400, "tailTurns must be a positive integer");
    const badSince = await fetch(`${srv.base}/v1/sessions/${encodeURIComponent(sessionId)}?viewer=U1&sinceSeq=-1`);
    assert.equal(badSince.status, 400, "sinceSeq must be non-negative");
    const badBefore = await fetch(`${srv.base}/v1/sessions/${encodeURIComponent(sessionId)}?viewer=U1&beforeSeq=0`);
    assert.equal(badBefore.status, 400, "beforeSeq must be a positive integer");
  } finally {
    await srv.close();
  }
});
