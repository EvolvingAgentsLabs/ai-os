import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { replaceChildrenPreservingFocus } from "../src/pane-focus.ts";

test("re-rendered pane inputs keep focus and caret across multi-character typing", () => {
  const dom = new JSDOM('<main><div><input data-focus-key="search" value="a"></div></main>');
  const main = dom.window.document.querySelector("main") as HTMLElement;
  const first = main.querySelector("input")!;
  first.focus();
  first.setSelectionRange(1, 1);

  for (const value of ["ab", "abc", "abcd"]) {
    const host = dom.window.document.createElement("div");
    host.innerHTML = `<input data-focus-key="search" value="${value}">`;
    replaceChildrenPreservingFocus(main, host);
    const next = main.querySelector("input")!;
    assert.equal(dom.window.document.activeElement, next);
    assert.equal(next.selectionStart, value.length - 1);
    next.setSelectionRange(value.length, value.length);
  }
});
