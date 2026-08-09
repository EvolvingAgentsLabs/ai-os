/**
 * Where everything sits on the desk, and who decides.
 *
 * This is the module [04-ai-ui](../../doc/04-ai-ui.md) is actually about. The
 * canvas has four claimed properties — spatial, live, generated, steerable — and
 * three of them are rendering. **Generated** is the one with a hard problem in
 * it, and the problem is not "compute a layout": it is *what happens to the
 * layout the user made when the system wants to propose a new one.*
 *
 * The rule, from that document, is one sentence:
 *
 * > The system proposes on state change; **it never re-arranges what the user
 * > has touched.**
 *
 * So every placement carries a `pinned` bit, set the moment a human drags it,
 * and `propose()` is written to route around pinned things rather than to
 * overwrite them. A canvas that forgets this is not "slightly annoying" — it is
 * a canvas that throws away the user's work every time an agent finishes a step,
 * which is precisely when they are looking at it.
 *
 * ## What a cube is, and why it can sit on a document
 *
 * A **document** is a flow. A **cube** is an agent. A cube sitting *on* a
 * document means that agent has work in that flow, and several cubes on one
 * document **stack** — which is the agent tree, made of objects you can point at
 * rather than an indented list.
 *
 * That is also why dropping a cube on a document is an instruction and not a
 * view change: it means *give this agent a step in this flow*. Direct
 * manipulation is an input, which is the fourth property, and it is the reason
 * this module models placement rather than just remembering coordinates.
 *
 * Pure and storage-free on purpose: no fetch, no DOM, no clock. The hard rule
 * above is a property of a function here, so it can be tested as one.
 */

/** A document is a flow; a cube is an agent. Nothing else has a position. */
export type Kind = "doc" | "cube";

export interface Placement {
  x: number;
  y: number;
  /**
   * A human put it here.
   *
   * The whole override rule hangs off this bit, which is why it is stored rather
   * than inferred: "did the position differ from what we would have proposed"
   * cannot distinguish a deliberate placement from a proposal that has since
   * changed its mind.
   */
  pinned: boolean;
}

export interface CubePlacement extends Placement {
  /** The flow this agent is stacked on, or null for a cube parked on the desk. */
  onDoc: string | null;
  /** Position within that document's stack. Ordering is meaning: it is step order. */
  slot: number;
}

export interface DeskLayout {
  scopeId: string;
  docs: Record<string, Placement>;
  cubes: Record<string, CubePlacement>;
}

/** What the desk is a picture of. Supplied by the caller; this module never fetches. */
export interface DeskState {
  scopeId: string;
  flows: Array<{ id: string; title: string; state: string; agents: string[] }>;
  /** Every agent the scope defines, whether or not it has work. */
  agents: string[];
}

export interface ProposeOptions {
  /** Desk area available for documents, in px. Only affects how many fit per row. */
  width?: number;
  docWidth?: number;
  docHeight?: number;
  gap?: number;
  /** Where parked cubes go: a strip down the left, outside the document grid. */
  shelfX?: number;
  /**
   * How wide that strip is.
   *
   * Separate from `shelfX` because they answer different questions — where a
   * cube sits, and where documents may not. The first version used one number
   * for both and put the document grid on top of the shelf, which is visible in
   * the first screenshot ever taken of this surface.
   */
  shelfWidth?: number;
}

const DEFAULTS = {
  width: 1200,
  docWidth: 260,
  docHeight: 190,
  gap: 28,
  shelfX: 14,
  shelfWidth: 150,
} as const;

export function emptyLayout(scopeId: string): DeskLayout {
  return { scopeId, docs: {}, cubes: {} };
}

/**
 * Lay the desk out from the current state, preserving everything the user placed.
 *
 * Three rules, in order, and the order is the whole design:
 *
 * 1. **A pinned placement is copied through untouched.** Not "usually", not
 *    "unless it collides" — untouched. A user who drags a document somewhere odd
 *    meant it; the system does not get a vote.
 * 2. **A pinned cube keeps its `onDoc`.** Dragging a cube onto a document is an
 *    assertion about the work, and re-deriving `onDoc` from the flow's steps
 *    would silently undo an assignment the moment it was made — before the step
 *    it created had run.
 * 3. Everything unpinned is arranged from state: documents into a grid over the
 *    free slots, cubes stacked on the documents whose flows name them, leftovers
 *    parked on the shelf.
 *
 * Deleted things are dropped rather than kept: a layout that accumulates
 * placements for flows that no longer exist grows without bound and eventually
 * reserves grid slots for nothing.
 */
export function propose(
  state: DeskState,
  saved: DeskLayout | null,
  opts: ProposeOptions = {},
): DeskLayout {
  const o = { ...DEFAULTS, ...opts };
  const prior = saved && saved.scopeId === state.scopeId ? saved : null;
  const next: DeskLayout = emptyLayout(state.scopeId);

  const flowIds = state.flows.map((f) => f.id);
  const liveFlows = new Set(flowIds);
  const liveAgents = new Set(state.agents);

  // ---- documents ------------------------------------------------------------
  // Pinned first, so the grid can be told which cells are already spoken for.
  const takenCells = new Set<string>();
  const cellOf = (x: number, y: number) =>
    `${Math.round(x / o.docWidth)},${Math.round(y / o.docHeight)}`;

  for (const id of flowIds) {
    const was = prior?.docs[id];
    if (was?.pinned) {
      next.docs[id] = { ...was };
      takenCells.add(cellOf(was.x, was.y));
    }
  }

  const originX = o.shelfWidth + o.gap;
  const perRow = Math.max(
    1,
    Math.floor((o.width - originX) / (o.docWidth + o.gap)),
  );
  let cursor = 0;
  for (const id of flowIds) {
    if (next.docs[id]) continue;
    // Walk forward until a cell nobody pinned is found. Bounded by construction:
    // there are more cells than documents, because cells are unbounded.
    let x = 0;
    let y = 0;
    for (;;) {
      const col = cursor % perRow;
      const row = Math.floor(cursor / perRow);
      x = originX + col * (o.docWidth + o.gap);
      y = 24 + row * (o.docHeight + o.gap);
      cursor += 1;
      if (!takenCells.has(cellOf(x, y))) break;
    }
    next.docs[id] = { x, y, pinned: false };
    takenCells.add(cellOf(x, y));
  }

  // ---- cubes ----------------------------------------------------------------
  // Which document each agent belongs on, when the user has not said otherwise.
  const derived = new Map<string, string>();
  for (const f of state.flows) {
    for (const a of f.agents) if (!derived.has(a)) derived.set(a, f.id);
  }

  const stackCount = new Map<string, number>();
  const nextSlot = (docId: string) => {
    const n = stackCount.get(docId) ?? 0;
    stackCount.set(docId, n + 1);
    return n;
  };

  // Pinned cubes claim their slots before anything is derived, so a derived cube
  // can never be stacked underneath a user-placed one by accident.
  for (const name of state.agents) {
    const was = prior?.cubes[name];
    if (!was?.pinned) continue;
    const onDoc = was.onDoc && liveFlows.has(was.onDoc) ? was.onDoc : null;
    next.cubes[name] = { ...was, onDoc };
    if (onDoc)
      stackCount.set(onDoc, Math.max(stackCount.get(onDoc) ?? 0, was.slot + 1));
  }

  let parked = 0;
  for (const name of state.agents) {
    if (next.cubes[name]) continue;
    const onDoc = derived.get(name) ?? null;
    if (onDoc) {
      next.cubes[name] = {
        x: 0,
        y: 0,
        pinned: false,
        onDoc,
        slot: nextSlot(onDoc),
      };
    } else {
      next.cubes[name] = {
        x: o.shelfX,
        y: 24 + parked * 30,
        pinned: false,
        onDoc: null,
        slot: 0,
      };
      parked += 1;
    }
  }

  // Anything the layout remembered for a thing that no longer exists is dropped.
  void liveAgents;
  return next;
}

/** A human moved something. This is the only way `pinned` becomes true. */
export function place(
  layout: DeskLayout,
  kind: Kind,
  id: string,
  x: number,
  y: number,
): DeskLayout {
  if (kind === "doc") {
    return {
      ...layout,
      docs: { ...layout.docs, [id]: { x, y, pinned: true } },
    };
  }
  const was = layout.cubes[id] ?? { x, y, pinned: true, onDoc: null, slot: 0 };
  // Dragging a cube out onto bare desk takes it off whatever it was stacked on.
  return {
    ...layout,
    cubes: {
      ...layout.cubes,
      [id]: { ...was, x, y, pinned: true, onDoc: null },
    },
  };
}

/**
 * A cube was dropped on a document.
 *
 * It goes on top of the stack rather than into a free slot, because the stack is
 * ordered and the order means step order — a cube inserted in the middle would
 * claim the agent runs before one that is already running.
 */
export function stack(
  layout: DeskLayout,
  agent: string,
  docId: string,
): DeskLayout {
  const occupied = Object.values(layout.cubes).filter((c) => c.onDoc === docId);
  const slot = occupied.length
    ? Math.max(...occupied.map((c) => c.slot)) + 1
    : 0;
  const was = layout.cubes[agent] ?? {
    x: 0,
    y: 0,
    pinned: true,
    onDoc: null,
    slot: 0,
  };
  return {
    ...layout,
    cubes: {
      ...layout.cubes,
      [agent]: { ...was, pinned: true, onDoc: docId, slot },
    },
  };
}

/** The cubes on one document, in stack order. */
export function stackOf(layout: DeskLayout, docId: string): string[] {
  return Object.entries(layout.cubes)
    .filter(([, c]) => c.onDoc === docId)
    .sort((a, b) => a[1].slot - b[1].slot)
    .map(([name]) => name);
}
