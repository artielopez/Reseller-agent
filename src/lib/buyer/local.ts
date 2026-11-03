import { z } from "zod";
import { sellerTermsSchema, type SellerTerms } from "../seller/preferences";
import type { Item } from "../domain";
import {
  contextMatches,
  facts,
  inquirySchema,
  replySchema,
  type Command,
  type Inquiry,
  type Reply,
  type ReplyContext,
  type Thread,
} from "./domain";
const stateSchema = z.object({
  version: z.literal(1),
  inquiries: z.array(inquirySchema).max(200),
  replies: z.array(replySchema).max(2000),
});
export type LocalState = z.infer<typeof stateSchema>;
export const initialBuyerState = (): LocalState => ({
  version: 1,
  inquiries: [],
  replies: [],
});
const increment = (r: string) => (BigInt(r) + BigInt(1)).toString();
export function localCommand(
  raw: unknown,
  items: Item[],
  command: Command,
  now = new Date().toISOString(),
  sellerTerms?: SellerTerms,
): { state: LocalState; result: unknown } {
  const state = stateSchema.parse(
    raw === undefined ? initialBuyerState() : raw,
  );
  const getQ = (id: string) => {
    const q = state.inquiries.find((q) => q.id === id);
    if (!q) throw new Error("Question unavailable. Reload the inbox.");
    return q;
  };
  const context = (q: Inquiry): ReplyContext => {
    const i = items.find((i) => i.id === q.item_id);
    if (!i) throw new Error("Item unavailable. Reload inventory.");
    return {
      ...(sellerTerms
        ? { seller_terms: sellerTermsSchema.parse(sellerTerms) }
        : {}),
      inquiry_id: q.id,
      inquiry_revision: q.revision,
      item_revision: i.replyContextRevision || "1",
      channel: q.channel,
      surface: q.surface,
      message: q.message,
      item: facts(i),
    };
  };
  const thread = (q: Inquiry): Thread => ({
    inquiry: q,
    context: context(q),
    replies: state.replies
      .filter((r) => r.inquiry_id === q.id)
      .sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
      ),
  });
  const invalidate = (r: Reply) => {
    r.status = "Draft";
    r.approved_at = null;
    r.revision = increment(r.revision);
    r.updated_at = now;
  };
  // Same transaction as inventory reads/writes: demo copy cannot race a saved item edit.
  for (const r of state.replies) {
    const q = getQ(r.inquiry_id);
    if (r.status === "Approved" && !contextMatches(r.context, context(q)))
      invalidate(r);
  }
  if (command.op === "list")
    return {
      state,
      result: [...state.inquiries].sort(
        (a, b) =>
          b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id),
      ),
    };
  if (command.op === "saveInquiry") {
    const input = command.input;
    let q = state.inquiries.find((q) => q.id === input.id);
    if (!items.some((i) => i.id === input.item_id))
      throw new Error("Choose a saved item.");
    if (!q) {
      if (command.expected_revision !== null)
        throw new Error("Question unavailable.");
      if (state.inquiries.length >= 200)
        throw new Error("The demo supports 200 questions.");
      q = { ...input, status: "Open", revision: "1", updated_at: now };
      state.inquiries.push(q);
    } else {
      if (q.item_id !== input.item_id)
        throw new Error("Cannot move a question to another item.");
      if (command.expected_revision === null) {
        if (
          Object.entries(input).some(
            ([key, value]) => q![key as keyof Inquiry] !== value,
          )
        )
          throw new Error("Conflicting retry. Reload the inbox.");
      } else {
        if (q.revision !== command.expected_revision)
          throw new Error("Question changed. Reload and review again.");
        Object.assign(q, input, {
          revision: increment(q.revision),
          updated_at: now,
        });
        for (const r of state.replies)
          if (r.inquiry_id === q.id && r.status === "Approved") invalidate(r);
      }
    }
    return { state, result: thread(q) };
  }
  if (command.op === "get") return { state, result: thread(getQ(command.id)) };
  if (command.op === "status") {
    const q = getQ(command.id);
    if (q.revision !== command.expected_revision)
      throw new Error("Question changed. Reload and review again.");
    if (q.status !== command.status) {
      q.status = command.status;
      q.revision = increment(q.revision);
      q.updated_at = now;
      for (const r of state.replies)
        if (r.inquiry_id === q.id && r.status === "Approved") invalidate(r);
    }
    return { state, result: thread(q) };
  }
  if (command.op === "draft") {
    const q = getQ(command.inquiry_id),
      ctx = context(q);
    if (!contextMatches(command.context, ctx))
      throw new Error("Facts changed. Reload and prepare a fresh draft.");
    const old = state.replies.find((r) => r.id === command.id);
    if (old) {
      if (
        old.inquiry_id !== q.id ||
        old.body !== command.body ||
        old.source !== command.source ||
        !contextMatches(old.context, ctx)
      )
        throw new Error("Conflicting retry. Reload the inbox.");
    } else {
      if (state.replies.length >= 2000)
        throw new Error("The demo draft limit is reached.");
      state.replies.push({
        id: command.id,
        inquiry_id: q.id,
        body: command.body,
        source: command.source,
        status: "Draft",
        revision: "1",
        context: ctx,
        created_at: now,
        updated_at: now,
        approved_at: null,
      });
    }
    return { state, result: thread(q) };
  }
  const r = state.replies.find((r) => r.id === command.id);
  if (!r) throw new Error("Reply unavailable.");
  const q = getQ(r.inquiry_id),
    ctx = context(q);
  if (command.expected_revision !== r.revision)
    throw new Error("Reply changed. Reload and review again.");
  if (command.op === "edit") {
    r.body = command.body;
    r.source = "manual";
    invalidate(r);
  } else {
    if (q.status !== "Open" || !contextMatches(r.context, ctx))
      throw new Error("Facts changed. Reload and prepare a fresh draft.");
    if (command.op === "approve") {
      if (!contextMatches(command.context, ctx) || r.status === "Dismissed")
        throw new Error("Review changed. Reload first.");
      r.status = "Approved";
      r.approved_at = now;
      r.revision = increment(r.revision);
      r.updated_at = now;
    } else {
      if (r.status !== "Approved")
        throw new Error("Approve the saved reply first.");
      return { state, result: { body: r.body, revision: r.revision } };
    }
  }
  return { state, result: thread(q) };
}
