import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

interface SlackManifest {
  oauth_config: { scopes: { bot: string[] } };
  settings: { event_subscriptions: { bot_events: string[] } };
}

const manifest = (url: URL): SlackManifest => JSON.parse(readFileSync(url, "utf8")) as SlackManifest;

test("the CLI Slack manifest template matches the plugin's scopes and events", () => {
  const template = manifest(new URL("../templates/slack-manifest.json", import.meta.url));
  const plugin = manifest(new URL("../../src/slack/manifest.json", import.meta.url));
  assert.deepEqual([...template.oauth_config.scopes.bot].sort(), [...plugin.oauth_config.scopes.bot].sort());
  assert.deepEqual(
    [...template.settings.event_subscriptions.bot_events].sort(),
    [...plugin.settings.event_subscriptions.bot_events].sort(),
  );
});
