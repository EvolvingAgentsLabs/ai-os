/**
 * Who may write where.
 *
 * The whole point of [channels.ts](../src/channels.ts) is that read-only is a
 * property of the document rather than of the renderer. A test suite that only
 * checked the happy path would leave that claim resting on the UI not having
 * drawn an input box yet.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Channel,
  CHANNEL_KINDS,
  ReadOnlyChannel,
  append,
  channel,
  channelsFor,

  workChannel,
} from "../src/channels.ts";

const msg = (author: string | null, body = "…") => ({ at: 1, author, body });

describe("who may write", () => {
  it("lets a person write only into the chat", () => {
    for (const kind of CHANNEL_KINDS) {
      const ch = channel({ id: `c-${kind}`, kind, title: "t", scopeId: "p:1" });
      assert.equal(ch.writable, kind === "chat", kind);
    }
  });

  it("refuses a person writing into a log, by kind and not by convention", () => {
    const log = channel({
      id: "p:1/log",
      kind: "project-log",
      title: "t",
      scopeId: "p:1",
    });
    assert.throws(() => append(log, msg(null)), ReadOnlyChannel);
    // And the error says why, because "read-only" alone sends the reader to the
    // renderer to find out which rule they hit.
    try {
      append(log, msg(null));
    } catch (e) {
      assert.match((e as Error).message, /records what agents did/);
    }
  });

  it("lets agents write into a log, which is what a log is", () => {
    const log = channel({
      id: "p:1/log",
      kind: "project-log",
      title: "t",
      scopeId: "p:1",
    });
    assert.equal(append(log, msg("SchemaAgent")).messages.length, 1);
  });

  it("stops an agent from writing as the person", () => {
    // The failure worth having a guard for: `author: null` means "the human said
    // this", in a record the human cannot edit.
    const chat = channel({ id: "p:1/chat", kind: "chat", title: "t", scopeId: "p:1" });
    assert.equal(append(chat, msg(null, "I approve")).messages.length, 1);
    const log = channel({ id: "p:1/log", kind: "project-log", title: "t", scopeId: "p:1" });
    assert.throws(() => append(log, msg(null, "I approve")), ReadOnlyChannel);
  });

  it("keeps a system log in the system scope", () => {
    const bad = channel({
      id: "x",
      kind: "system-log",
      title: "t",
      scopeId: "p:1",
    });
    assert.throws(() => append(bad, msg("SystemAgent")), /but is scoped to p:1/);
  });
});

describe("what a scope has before anything happens", () => {
  it("gives every project a chat and a log, empty", () => {
    const chs = channelsFor("p:1", "Ledger");
    assert.deepEqual(chs.map((c) => c.kind), ["chat", "project-log"]);
    // Empty, not absent: a log that appears once there is something in it cannot
    // be checked for silence, and "nothing has been said for an hour" is a thing
    // somebody needs to see.
    for (const c of chs) assert.deepEqual(c.messages, []);
  });

  it("gives the system scope a system log and no chat", () => {
    const chs = channelsFor("org:", "System");
    assert.deepEqual(chs.map((c) => c.kind), ["system-log"]);
    assert.equal(chs[0]!.writable, false);
  });
});

describe("a running flow is already a living document", () => {
  const flow = {
    id: "f1",
    title: "ledger rewrite",
    scopeId: "p:1",
    steps: [
      { index: 0, agent: "SchemaAgent", state: "done", result: "a currency column" },
      { index: 1, agent: "MigrationAgent", state: "running", result: null },
      { index: 2, agent: "ReviewAgent", state: "pending" },
    ],
  };

  it("is live while a step is running, and not writable ever", () => {
    const ch = workChannel(flow);
    assert.equal(ch.kind, "work");
    assert.equal(ch.live, true);
    assert.equal(ch.writable, false);
  });

  it("carries results and nothing it does not have", () => {
    const ch = workChannel(flow);
    assert.equal(ch.messages.length, 1);
    assert.equal(ch.messages[0]!.author, "SchemaAgent");
  });

  it("stops being live when nothing is running", () => {
    const done: typeof flow = {
      ...flow,
      steps: flow.steps.map((s) => ({ ...s, state: "done", result: s.result ?? "x" })),
    };
    assert.equal(workChannel(done).live, false);
  });

  it("is a projection, so it invents no store of its own", () => {
    // If this ever needs its own persistence, the flow stopped being the source
    // of truth and there are two answers to "what did that step produce".
    const a = workChannel(flow);
    const b = workChannel(flow);
    assert.deepEqual(a, b);
  });
});

describe("the shape the desk can rely on", () => {
  it("marks exactly the surfaces something is expected to write to", () => {
    const live: Channel[] = [
      workChannel({ id: "f", title: "t", steps: [{ index: 0, agent: "A", state: "running" }] }),
    ];
    assert.deepEqual(live.map((c) => c.live), [true]);
    // A chat nobody is running is writable and not live: the distinction the desk
    // needs in order to decide what to poll.
    const chat = channel({ id: "c", kind: "chat", title: "t", scopeId: "p:1" });
    assert.equal(chat.writable, true);
    assert.equal(chat.live, false);
  });

  it("keeps the derived flag underivable by the caller", () => {
    // Cast rather than a type error, because the guard has to hold against the
    // caller who is not type-checked -- JSON off the wire, or a test.
    const sneaky = channel({
      id: "c",
      kind: "project-log",
      title: "t",
      scopeId: "p:1",
      writable: true,
    } as unknown as Parameters<typeof channel>[0]);
    assert.equal(sneaky.writable, false);
  });
});
