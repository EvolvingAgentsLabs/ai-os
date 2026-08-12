/**
 * Living documents — the surfaces that change while you are looking at them.
 *
 * A desk of documents that only change when you press something is a file
 * browser. What makes this a *system* is that some of these documents are being
 * written right now by something that is not you, and the difference between the
 * ones you can write to and the ones you cannot is the difference between a
 * conversation and a log. Today that distinction is nowhere: everything on the
 * desk is a flow, and a flow has no notion of who may speak.
 *
 * ## The four kinds, and why exactly four
 *
 * The two questions that matter about any surface here are **who writes** and
 * **who is expected to answer**. Crossing them gives four, and each one is a
 * thing that already exists in the system without a name:
 *
 * | kind | written by | you can write | what it is |
 * |---|---|---|---|
 * | `work` | agents | no | a flow running with nobody waiting on it |
 * | `chat` | you and agents | yes | the project conversation, solo or with a team |
 * | `project-log` | agents | no | everything the agents said at project level |
 * | `system-log` | system agents | no | the same, for the scope that has no project |
 *
 * A fifth kind has been proposed twice and refused twice: a "notification"
 * stream. It is `project-log` filtered, and a filtered view of a log is a view,
 * not a document.
 *
 * ## Read-only is a property of the document, not of the UI
 *
 * `writable` is here rather than in the desk because a surface that is read-only
 * because *the renderer did not draw an input box* is read-only until somebody
 * adds one. The log of what agents said is not a place a person may write, and
 * that has to be true in the model or it is not true.
 *
 * ## Borrowed vocabulary, not a borrowed framework
 *
 * The word `channel` and the shape — a directory of files, each one a surface an
 * agent can be attached to — are lifted from Vercel's eve, which gets this right:
 * an agent is a directory, and the things it talks through are files beside it.
 * What is deliberately *not* lifted is the framework. eve's agents are markdown
 * for instructions and TypeScript for tools, channels and schedules, and it runs
 * on a server; ai-os's agents are one markdown file executed by a harness that
 * lives in a vendored subtree we do not modify. Adopting eve here would mean two
 * agent formats and two runtimes, which is the specific kind of expensive that
 * doc/00 warns about. The idea is free; the dependency is not.
 */

/** Who may write, and therefore what the surface is for. */
export const CHANNEL_KINDS = [
  "work",
  "chat",
  "project-log",
  "system-log",
] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export interface ChannelMessage {
  at: number;
  /** An agent name, or `null` for the person. */
  author: string | null;
  body: string;
  /** The flow this message belongs to, when it belongs to one. */
  flowId?: string;
}

export interface Channel {
  id: string;
  kind: ChannelKind;
  title: string;
  /** `org:` for a system log; a project scope for everything else. */
  scopeId: string;
  /**
   * Whether a person may append to it.
   *
   * Derived, never stored: a log that is writable because somebody set a flag is
   * a log with an editable history, and the reason to have a log at all is that
   * its history is not editable.
   */
  writable: boolean;
  /**
   * Whether something is expected to write to it without being asked.
   *
   * This is what "living" means, and it is the flag the desk needs in order to
   * decide what to poll. A `chat` nobody is running is still writable and is not
   * live; a finished `work` document is neither.
   */
  live: boolean;
  messages: ChannelMessage[];
}

/** Only a chat takes human input. The rest are records of what happened. */
export const isWritable = (kind: ChannelKind): boolean => kind === "chat";

/**
 * Build a channel, with `writable` derived rather than passed.
 *
 * `live` is a fact about the world — is an agent working on this — so it is an
 * argument. `writable` is a fact about the kind, so it is not.
 */
export function channel(
  init: Omit<Channel, "writable" | "messages" | "live"> & {
    live?: boolean;
    messages?: ChannelMessage[];
  },
): Channel {
  return {
    ...init,
    writable: isWritable(init.kind),
    live: init.live ?? false,
    messages: init.messages ?? [],
  };
}

/** Raised when something tries to write where writing is not allowed. */
export class ReadOnlyChannel extends Error {
  // Declared rather than a parameter property: the repo type-strips at runtime
  // (`erasableSyntaxOnly`), and a parameter property is syntax that has to be
  // compiled away rather than erased.
  readonly channelId: string;

  constructor(channelId: string, kind: ChannelKind) {
    super(
      `${channelId} is a ${kind}: it records what agents did and nobody types into it`,
    );
    this.channelId = channelId;
    this.name = "ReadOnlyChannel";
  }
}

/**
 * Append, refusing on the two grounds that are not the caller's to override.
 *
 * A person writing to a log, and an agent claiming to be the person. The second
 * is the one worth having: a `null` author means "the human said this", and an
 * agent that can write that can put words in their mouth in a record they cannot
 * edit.
 */
export function append(ch: Channel, msg: ChannelMessage): Channel {
  if (!ch.writable && msg.author === null) throw new ReadOnlyChannel(ch.id, ch.kind);
  if (ch.kind === "system-log" && ch.scopeId !== "org:")
    throw new Error(`${ch.id} is a system log but is scoped to ${ch.scopeId}`);
  return { ...ch, messages: [...ch.messages, msg] };
}

/**
 * The channels a scope has, before anything has happened in it.
 *
 * Every project gets the same three, always, even when empty. A log that appears
 * once there is something in it cannot be checked for silence — and "the agents
 * have said nothing for an hour" is a thing a person needs to be able to see.
 */
export function channelsFor(scopeId: string, title: string): Channel[] {
  if (scopeId === "org:")
    return [
      channel({
        id: "system-log",
        kind: "system-log",
        title: "System",
        scopeId,
      }),
    ];
  return [
    channel({ id: `${scopeId}/chat`, kind: "chat", title, scopeId }),
    channel({
      id: `${scopeId}/log`,
      kind: "project-log",
      title: `${title} — what the agents said`,
      scopeId,
    }),
  ];
}

/**
 * Turn a flow into the living document it already is.
 *
 * A running flow is a work channel whose messages are its steps' results; this
 * is a projection, not a second store. The desk polls flows every five seconds
 * already, so a work channel costs nothing new — what it buys is that a flow
 * nobody is waiting on stops being invisible.
 */
export function workChannel(flow: {
  id: string;
  title: string;
  scopeId?: string;
  steps: Array<{ index: number; agent: string | null; state: string; result?: string | null }>;
}): Channel {
  return channel({
    id: `${flow.id}/work`,
    kind: "work",
    title: flow.title,
    scopeId: flow.scopeId ?? "",
    live: flow.steps.some((s) => s.state === "running"),
    messages: flow.steps
      .filter((s) => s.result)
      .map((s) => ({ at: s.index, author: s.agent, body: s.result! })),
  });
}
