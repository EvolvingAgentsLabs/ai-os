import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/shell.css", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/chat.ts", import.meta.url), "utf8");

test("approval panel caps to the pane viewport and scrolls instead of clipping", () => {
  const panel = css.match(/\.composer-approval-panel \{[^}]*\}/)?.[0] ?? "";
  assert.match(panel, /max-height: calc\(100dvh - \d+px\);/, "panel needs a viewport-relative height cap");
  assert.match(panel, /overflow-y: auto;/, "panel must scroll once the cap binds");
});

test("pane glance renders no placeholder text for an empty chat", () => {
  assert.ok(!chat.includes("No messages yet"), "the No-messages-yet placeholder is gone");
  const glance = chat.slice(chat.indexOf("function paneGlance"), chat.indexOf("function paneNowLine"));
  assert.match(glance, /\$\{now \?\? snippet\}/, "strip falls back to the snippet alone");
  assert.match(
    glance,
    /\$\{snippet \? html`<div class="pane-card-last">\$\{snippet\}<\/div>` : nothing\}/,
    "card omits the last-reply row when empty",
  );
});
