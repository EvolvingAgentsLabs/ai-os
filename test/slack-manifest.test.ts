import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("membership events invalidate the pushed authorization roster", async () => {
  const manifest = JSON.parse(await readFile(new URL("../src/slack/manifest.json", import.meta.url), "utf8")) as {
    settings?: { event_subscriptions?: { bot_events?: string[] } };
  };
  const events = manifest.settings?.event_subscriptions?.bot_events ?? [];
  assert.ok(events.includes("member_joined_channel"));
  assert.ok(events.includes("member_left_channel"));
});
