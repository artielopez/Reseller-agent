import { z } from "zod";
import { channels, formatPHP, type Item } from "../domain";

// This engine has no network adapter. All events and delivery outcomes are synthetic.
const id = z.string().trim().min(1).max(160);
export const eventSchema = z
  .object({
    id,
    threadId: id,
    source: z.literal("synthetic"),
    channel: z.enum(channels),
    surface: z.enum(["dm", "group_comment"]),
    postId: id.optional(),
    commentId: id.optional(),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    itemId: id.nullable(),
    body: z.string().trim().min(1).max(10_000),
    complete: z.boolean(),
    receivedAt: z.number().finite().nonnegative(),
  })
  .strict()
  .superRefine((e, c) => {
    if (
      e.surface === "group_comment" &&
      (e.channel !== "groups" || !e.postId || !e.commentId)
    )
      c.addIssue({
        code: "custom",
        message: "Group comments require a group post and comment ID.",
      });
  });
export type EventInput = z.infer<typeof eventSchema>;
export type Reply = {
  body: string;
  source: "template" | "human";
  facts: string;
  policyRevision: number;
  eventRevision: number;
};
export type Entry = EventInput & {
  status: "captured" | "review" | "ready" | "claimed" | "simulated" | "unknown";
  reason: string;
  reply: Reply | null;
  claim: string | null;
  completedAt: number | null;
};
export type Settings = {
  paused: boolean;
  mode: "review" | "simulate";
  nativeChannels: (typeof channels)[number][];
  revision: number;
};
export type State = {
  version: 1;
  settings: Settings;
  events: Entry[];
  takeovers: string[];
  availability: { itemId: string; facts: string; at: number }[];
};
export function initialState(): State {
  return {
    version: 1,
    settings: { paused: true, mode: "review", nativeChannels: [], revision: 1 },
    events: [],
    takeovers: [],
    availability: [],
  };
}
export function itemFacts(item: Item) {
  return JSON.stringify([
    item.id,
    item.title,
    item.price,
    item.condition,
    item.description,
    item.category,
    item.status,
  ]);
}
function clone(s: State): State {
  return structuredClone(s);
}
function entry(s: State, id: string) {
  const e = s.events.find((e) => e.id === id);
  if (!e) throw new Error("Question not found.");
  return e;
}
function locked(e: Entry) {
  return ["claimed", "unknown", "simulated"].includes(e.status);
}
function review(e: Entry, reason: string) {
  e.status = "review";
  e.reason = reason;
  e.reply = null;
  e.claim = null;
}
function sameThread(a: Entry, b: Entry) {
  return (
    a.threadId === b.threadId &&
    a.channel === b.channel &&
    a.surface === b.surface &&
    a.postId === b.postId
  );
}
export function capture(state: State, input: EventInput): State {
  const data = eventSchema.parse(input);
  const s = clone(state);
  const old = s.events.find((e) => e.id === data.id);
  if (old) {
    const previous = eventSchema.parse(
      Object.fromEntries(
        Object.keys(data).map((k) => [k, old[k as keyof Entry]]),
      ),
    );
    if (JSON.stringify(previous) === JSON.stringify(data)) return s;
    if (
      data.revision <= old.revision ||
      old.threadId !== data.threadId ||
      old.channel !== data.channel ||
      old.surface !== data.surface ||
      old.postId !== data.postId ||
      old.commentId !== data.commentId
    )
      throw new Error(
        "Event identity or revision conflicts with an existing question.",
      );
    if (locked(old))
      throw new Error(
        "A submitted or uncertain outcome must be reconciled before editing.",
      );
    Object.assign(old, data);
    review(old, "Question changed; review the updated context.");
  } else {
    if (s.events.length >= 200)
      throw new Error("This demo supports up to 200 questions.");
    s.events.unshift({
      ...data,
      status: "captured",
      reason: "Not processed yet.",
      reply: null,
      claim: null,
      completedAt: null,
    });
  }
  return s;
}
function gate(s: State, e: Entry, items: Item[], now: number): string | null {
  if (!Number.isFinite(now)) return "Invalid clock.";
  if (!e.complete) return "Capture is incomplete.";
  const item = items.find((i) => i.id === e.itemId);
  if (!item) return "Match this question to a saved item first.";
  if (s.settings.nativeChannels.includes(e.channel))
    return "Native platform replies are managed outside this app.";
  if (s.takeovers.includes(e.threadId))
    return "You have taken over this conversation.";
  if (
    s.events.some(
      (other) =>
        other.id !== e.id && sameThread(e, other) && other.status === "unknown",
    )
  )
    return "An earlier delivery outcome is unknown.";
  if (
    s.events.some(
      (other) =>
        other.id !== e.id &&
        sameThread(e, other) &&
        other.receivedAt >= e.receivedAt,
    )
  )
    return "A newer question needs review; do not answer the older question separately.";
  if (now - e.receivedAt > 86_400_000 || now < e.receivedAt)
    return "Question is stale or has a future timestamp.";
  return null;
}
export function processEvent(
  state: State,
  id: string,
  items: Item[],
  now: number,
): State {
  const s = clone(state),
    e = entry(s, id);
  if (locked(e)) return s;
  const block = gate(s, e, items, now);
  if (block) {
    review(e, block);
    return s;
  }
  const item = items.find((i) => i.id === e.itemId)!;
  const q = e.body
    .toLowerCase()
    .trim()
    .replace(/[?!.]+$/, "")
    .trim();
  let body: string | null = null;
  if (/^(how much|price|magkano)( po)?$/.test(q))
    body = "The asking price is " + formatPHP(item.price) + ".";
  else if (
    /^(condition|what condition is it in)$/.test(q) &&
    e.surface === "dm"
  )
    body =
      "The recorded condition is " +
      item.condition.toLowerCase() +
      ". Please check the listing for the full description and known flaws.";
  else if (
    /^(is this (still )?available|available|available pa)( po)?$/.test(q)
  ) {
    const confirmation = s.availability.find(
      (a) => a.itemId === item.id && a.facts === itemFacts(item),
    );
    if (item.status === "Sold") body = "This item is marked sold.";
    else if (item.status === "Reserved")
      body = "This item is currently reserved.";
    else if (
      item.status === "Listed" &&
      confirmation &&
      now >= confirmation.at &&
      now - confirmation.at <= 86_400_000
    )
      body =
        "Yes, the seller confirmed this item is available. The asking price is " +
        formatPHP(item.price) +
        ".";
  }
  if (!body) {
    review(
      e,
      "This question needs your review. No discount, reservation, payment or meeting commitment was made.",
    );
    return s;
  }
  e.reply = {
    body,
    source: "template",
    facts: itemFacts(item),
    policyRevision: s.settings.revision,
    eventRevision: e.revision,
  };
  e.status = s.settings.mode === "simulate" ? "ready" : "review";
  e.reason =
    s.settings.mode === "simulate"
      ? "Routine template ready for simulated delivery."
      : "Review this template before simulated delivery.";
  return s;
}
export function approveReply(
  state: State,
  id: string,
  body: string,
  items: Item[],
  now: number,
  viewedContext: string,
): State {
  const s = clone(state),
    e = entry(s, id);
  assertViewedContext(s, id, items, viewedContext);
  if (locked(e))
    throw new Error("This outcome is already submitted or uncertain.");
  const block = gate(s, e, items, now);
  if (block) throw new Error(block);
  const item = items.find((i) => i.id === e.itemId)!;
  if (
    e.reply &&
    (e.reply.facts !== itemFacts(item) ||
      e.reply.eventRevision !== e.revision ||
      e.reply.policyRevision !== s.settings.revision)
  )
    throw new Error(
      "Saved draft is stale. Choose Process again, then review or edit the refreshed draft.",
    );
  body = z.string().trim().min(1).max(10_000).parse(body);
  if (e.surface === "group_comment")
    throw new Error(
      "Custom public replies remain disabled in this demo; use the reviewed public price template.",
    );
  e.reply = {
    body,
    source: "human",
    facts: itemFacts(items.find((i) => i.id === e.itemId)!),
    policyRevision: s.settings.revision,
    eventRevision: e.revision,
  };
  e.status = "ready";
  e.reason = "You approved this exact text for simulation.";
  return s;
}
export function claimReply(
  state: State,
  id: string,
  items: Item[],
  now: number,
  viewedContext: string,
): { state: State; token: string | null } {
  const s = clone(state),
    e = entry(s, id);
  if (e.status !== "ready" || !e.reply) return { state: s, token: null };
  assertViewedContext(s, id, items, viewedContext);
  const block = gate(s, e, items, now);
  if (block) {
    review(e, block);
    return { state: s, token: null };
  }
  if (s.settings.paused) {
    e.reason = "Simulation is paused.";
    return { state: s, token: null };
  }
  if (now - e.receivedAt < 15_000) {
    e.reason = "Waiting 15 seconds for follow-up messages.";
    return { state: s, token: null };
  }
  const item = items.find((i) => i.id === e.itemId)!;
  if (
    e.reply.facts !== itemFacts(item) ||
    e.reply.eventRevision !== e.revision ||
    e.reply.policyRevision !== s.settings.revision
  ) {
    review(e, "Item, question or policy changed; review again.");
    return { state: s, token: null };
  }
  if (e.reply.source === "template") {
    if (s.settings.mode !== "simulate") {
      review(e, "Human review is required.");
      return { state: s, token: null };
    }
    const check = processEvent(s, id, items, now);
    if (check.events.find((x) => x.id === id)?.status !== "ready") {
      review(e, "Facts are no longer current; review again.");
      return { state: s, token: null };
    }
    if (
      s.events.filter(
        (x) =>
          sameThread(e, x) &&
          x.completedAt !== null &&
          now - x.completedAt < 3_600_000 &&
          x.reply?.source === "template",
      ).length >= 3
    ) {
      review(e, "Automatic reply limit reached for this conversation.");
      return { state: s, token: null };
    }
  }
  e.claim = crypto.randomUUID();
  e.status = "claimed";
  e.reason = "Claimed by the local simulator.";
  return { state: s, token: e.claim };
}
export function completeReply(
  state: State,
  id: string,
  token: string,
  outcome: "confirmed" | "unknown",
  now: number,
): State {
  const s = clone(state),
    e = entry(s, id);
  if (e.status !== "claimed" || !token || token !== e.claim)
    throw new Error("Delivery claim is no longer valid.");
  e.status = outcome === "confirmed" ? "simulated" : "unknown";
  e.completedAt = now;
  e.reason =
    outcome === "confirmed"
      ? "Simulated only — no buyer message was sent."
      : "Simulated uncertain result — automatic retry is blocked.";
  return s;
}
export function updateSettings(
  state: State,
  patch: Partial<Omit<Settings, "revision">>,
): State {
  const s = clone(state);
  s.settings = { ...s.settings, ...patch, revision: s.settings.revision + 1 };
  for (const e of s.events)
    if (!locked(e)) review(e, "Settings changed; process or review again.");
  return s;
}
export function takeOver(
  state: State,
  threadId: string,
  active: boolean,
): State {
  const s = clone(state);
  s.takeovers = s.takeovers.filter((id) => id !== threadId);
  if (active) s.takeovers.push(threadId);
  for (const e of s.events)
    if (e.threadId === threadId && !locked(e))
      review(
        e,
        active
          ? "You have taken over this conversation."
          : "Conversation resumed; process again.",
      );
  return s;
}
export function recordSellerReply(state: State, threadId: string): State {
  return takeOver(state, threadId, true);
}
export function setAvailability(state: State, item: Item, now: number): State {
  if (item.status !== "Listed")
    throw new Error("Only listed items can be confirmed available.");
  const s = clone(state);
  s.availability = s.availability.filter((a) => a.itemId !== item.id);
  s.availability.push({ itemId: item.id, facts: itemFacts(item), at: now });
  return s;
}

// Snapshot what the reviewer actually saw; compare it inside the queue transaction.
export function decisionContext(
  state: State,
  id: string,
  items: Item[],
): string {
  const e = entry(state, id),
    item = items.find((i) => i.id === e.itemId);
  return JSON.stringify([
    e,
    item ? itemFacts(item) : null,
    state.settings.revision,
  ]);
}

function assertViewedContext(
  state: State,
  id: string,
  items: Item[],
  viewedContext: string,
) {
  if (!viewedContext || decisionContext(state, id, items) !== viewedContext)
    throw new Error(
      "Item or conversation changed since you viewed it. Review the refreshed facts and draft before continuing.",
    );
}
