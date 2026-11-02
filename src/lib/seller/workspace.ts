import { z } from "zod";
import type { Item } from "../domain";
import { localCommand } from "../buyer/local";
import {
  applyPreferences,
  defaultPreferences,
  preferencesInputSchema,
  preferencesSchema,
  reviewSince,
  termsContext,
} from "./preferences";
const revision = z.string().regex(/^(0|[1-9][0-9]{0,38})$/);
export const sellerCommandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("get") }).strict(),
  z
    .object({
      op: z.literal("save"),
      expected_revision: revision,
      input: preferencesInputSchema,
    })
    .strict(),
  z.object({ op: z.literal("review"), expected_revision: revision }).strict(),
]);
export type SellerCommand = z.infer<typeof sellerCommandSchema>;
const count = z.number().int().min(0).max(200);
export const workspaceSchema = z.object({
  preferences: preferencesSchema,
  summary: z.object({
    total: count,
    open: count,
    ready: count,
    needs_review: count,
    received: count,
    since: z.iso.datetime({ offset: true }),
    as_of: z.iso.datetime({ offset: true }),
  }),
});
export type SellerWorkspace = z.infer<typeof workspaceSchema>;
export function localSellerWorkspace(
  raw: unknown,
  buyer: unknown,
  items: Item[],
  input: SellerCommand,
  now = new Date().toISOString(),
) {
  const command = sellerCommandSchema.parse(input);
  let preferences = preferencesSchema.parse(raw ?? defaultPreferences());
  if (command.op === "save")
    preferences = applyPreferences(
      preferences,
      command.input,
      command.expected_revision,
    );
  if (command.op === "review") {
    if (command.expected_revision !== preferences.revision)
      throw new Error("Preferences changed. Reload before marking reviewed.");
    preferences = preferencesSchema.parse({
      ...preferences,
      revision: (BigInt(preferences.revision) + BigInt(1)).toString(),
      last_reviewed_at: now,
    });
  }
  const { state } = localCommand(
    buyer,
    items,
    { op: "list" },
    now,
    termsContext(preferences),
  );
  const since = reviewSince(preferences, now),
    open = state.inquiries.filter((q) => q.status === "Open");
  const ready = (id: string) =>
    state.replies.some((r) => r.inquiry_id === id && r.status === "Approved");
  const summary = {
    total: state.inquiries.length,
    open: open.length,
    ready: open.filter((q) => ready(q.id)).length,
    needs_review: open.filter(
      (q) =>
        !ready(q.id) &&
        state.replies.some(
          (r) => r.inquiry_id === q.id && r.status !== "Dismissed",
        ),
    ).length,
    received: state.inquiries.filter(
      (q) =>
        Date.parse(q.received_at) >= Date.parse(since) &&
        Date.parse(q.received_at) <= Date.parse(now),
    ).length,
    since,
    as_of: now,
  };
  return { state, result: workspaceSchema.parse({ preferences, summary }) };
}
