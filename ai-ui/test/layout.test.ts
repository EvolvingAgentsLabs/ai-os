/**
 * The canvas's one hard rule, tested as a property of a function.
 *
 * "The system proposes on state change; it never re-arranges what the user has
 * touched" is easy to write in a design document and easy to break in a render
 * loop, because breaking it looks like a layout that keeps tidying itself. These
 * assert the rule survives the events that would break it: a flow finishing, an
 * agent appearing, a flow being deleted.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type DeskState,
  emptyLayout,
  place,
  propose,
  stack,
  stackOf,
} from "../src/layout.ts";

const state = (over: Partial<DeskState> = {}): DeskState => ({
  scopeId: "group:web-project-1",
  flows: [
    {
      id: "f1",
      title: "ledger rewrite",
      state: "waiting",
      agents: ["SchemaAgent", "MigrationAgent"],
    },
    { id: "f2", title: "audit", state: "done", agents: ["ReviewAgent"] },
  ],
  agents: [
    "LedgerLead",
    "SchemaAgent",
    "MigrationAgent",
    "ReviewAgent",
    "DataQualityAgent",
  ],
  ...over,
});

describe("the system proposes", () => {
  it("gives every flow a document and every agent a cube", () => {
    const l = propose(state(), null);
    assert.deepEqual(Object.keys(l.docs).sort(), ["f1", "f2"]);
    assert.equal(Object.keys(l.cubes).length, 5);
  });

  it("stacks an agent on the flow that names it", () => {
    const l = propose(state(), null);
    assert.deepEqual(stackOf(l, "f1"), ["SchemaAgent", "MigrationAgent"]);
    assert.deepEqual(stackOf(l, "f2"), ["ReviewAgent"]);
  });

  it("parks an agent with no work on the shelf rather than hiding it", () => {
    // An agent that exists and has nothing to do is information. Dropping it
    // from the desk would make "this scope defines five agents" unreadable.
    const l = propose(state(), null);
    assert.equal(l.cubes["LedgerLead"]!.onDoc, null);
    assert.equal(l.cubes["DataQualityAgent"]!.onDoc, null);
    assert.notEqual(l.cubes["LedgerLead"]!.y, l.cubes["DataQualityAgent"]!.y);
  });

  it("does not overlap two documents", () => {
    const many = state({
      flows: Array.from({ length: 9 }, (_, i) => ({
        id: `f${i}`,
        title: `t${i}`,
        state: "open",
        agents: [],
      })),
    });
    const l = propose(many, null);
    const seen = new Set(Object.values(l.docs).map((p) => `${p.x},${p.y}`));
    assert.equal(seen.size, 9);
  });

  it("is stable: proposing twice from the same state changes nothing", () => {
    // A layout that differs between two identical renders is a canvas that
    // shuffles while you look at it.
    const s = state();
    const once = propose(s, null);
    assert.deepEqual(propose(s, once), once);
  });
});

describe("and never re-arranges what the user touched", () => {
  it("leaves a dragged document exactly where it was dropped", () => {
    const s = state();
    const dragged = place(propose(s, null), "doc", "f1", 777, 555);
    const after = propose(s, dragged);
    assert.deepEqual(after.docs["f1"], { x: 777, y: 555, pinned: true });
  });

  it("keeps it there when a flow finishes", () => {
    // The event most likely to trigger a re-propose is also the moment the user
    // is most likely to be looking at the desk.
    const dragged = place(propose(state(), null), "doc", "f1", 777, 555);
    const after = propose(
      state({
        flows: [
          { id: "f1", title: "ledger rewrite", state: "done", agents: [] },
        ],
      }),
      dragged,
    );
    assert.deepEqual(after.docs["f1"], { x: 777, y: 555, pinned: true });
  });

  it("keeps it there when a new flow appears", () => {
    const dragged = place(propose(state(), null), "doc", "f1", 777, 555);
    const s = state();
    s.flows.push({ id: "f3", title: "new", state: "open", agents: [] });
    const after = propose(s, dragged);
    assert.deepEqual(after.docs["f1"], { x: 777, y: 555, pinned: true });
    assert.ok(after.docs["f3"]);
  });

  it("never places a new document on top of a pinned one", () => {
    const s = state();
    const first = propose(s, null);
    // Pin f1 onto the cell the grid would hand the next flow.
    const target = { ...first.docs["f2"]! };
    const pinned = place(first, "doc", "f1", target.x, target.y);
    const s2 = state();
    s2.flows.push({ id: "f3", title: "new", state: "open", agents: [] });
    const after = propose(s2, pinned);
    const positions = Object.entries(after.docs).map(
      ([id, p]) => `${id}@${p.x},${p.y}`,
    );
    const coords = Object.values(after.docs).map((p) => `${p.x},${p.y}`);
    assert.equal(
      new Set(coords).size,
      coords.length,
      `documents overlap: ${positions.join(" ")}`,
    );
  });

  it("keeps a cube the user stacked, even before its step has run", () => {
    // The failure this prevents: drop ReviewAgent on f1, the desk re-proposes
    // from flow state, ReviewAgent is not in f1's steps yet, and the cube snaps
    // back — undoing the assignment in front of the person who made it.
    const s = state();
    const assigned = stack(propose(s, null), "ReviewAgent", "f1");
    const after = propose(s, assigned);
    assert.equal(after.cubes["ReviewAgent"]!.onDoc, "f1");
    assert.ok(stackOf(after, "f1").includes("ReviewAgent"));
  });

  it("stacks a dropped cube on top, never into the middle of the order", () => {
    // Stack order is step order. Inserting into it would claim an agent runs
    // before one that has already started.
    const l = stack(propose(state(), null), "LedgerLead", "f1");
    assert.deepEqual(stackOf(l, "f1"), [
      "SchemaAgent",
      "MigrationAgent",
      "LedgerLead",
    ]);
  });

  it("takes a cube off its document when it is dragged onto bare desk", () => {
    const l = place(propose(state(), null), "cube", "SchemaAgent", 40, 400);
    assert.equal(l.cubes["SchemaAgent"]!.onDoc, null);
    assert.deepEqual(stackOf(l, "f1"), ["MigrationAgent"]);
  });
});

describe("what the layout refuses to remember", () => {
  it("drops placements for flows that no longer exist", () => {
    // Otherwise the layout grows without bound and reserves grid cells for
    // documents nobody can see.
    const stale = place(propose(state(), null), "doc", "f2", 900, 900);
    const after = propose(state({ flows: [state().flows[0]!] }), stale);
    assert.equal(after.docs["f2"], undefined);
  });

  it("un-stacks a pinned cube whose document is gone, rather than orphaning it", () => {
    const assigned = stack(propose(state(), null), "ReviewAgent", "f2");
    const after = propose(state({ flows: [state().flows[0]!] }), assigned);
    assert.equal(after.cubes["ReviewAgent"]!.onDoc, null);
  });

  it("ignores a layout saved for a different scope", () => {
    // Scopes are the security boundary everywhere else in this system; a layout
    // that leaks across them would place another project's documents on this desk.
    const other = { ...propose(state(), null), scopeId: "group:someone-else" };
    const after = propose(state(), other);
    assert.equal(after.scopeId, "group:web-project-1");
    assert.equal(after.docs["f1"]!.pinned, false);
  });

  it("starts from nothing when there is no saved layout", () => {
    assert.deepEqual(
      propose({ scopeId: "s", flows: [], agents: [] }, null),
      emptyLayout("s"),
    );
  });
});
