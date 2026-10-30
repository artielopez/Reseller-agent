import { z } from "zod";
import { channels, itemInputSchema, formatPHP, type Item } from "../domain";
const uuid = z.uuid(),
  revision = z.string().regex(/^[1-9][0-9]*$/);
const body = z.string().trim().min(1, "Enter a message.").max(10000);
export const inquiryInputSchema = z
  .object({
    id: uuid,
    item_id: uuid,
    channel: z.enum(channels),
    surface: z.enum(["dm", "group_comment"]),
    buyer_name: z.string().max(200),
    message: body,
    received_at: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine(
    (q) => q.surface !== "group_comment" || q.channel === "groups",
    "Public comments must use Facebook Groups.",
  );
export const inquirySchema = inquiryInputSchema
  .safeExtend({
    status: z.enum(["Open", "Answered", "Closed"]),
    revision,
    updated_at: z.string(),
    message: z.string(),
  })
  .strip();
export const contextSchema = z.object({
  inquiry_id: uuid,
  inquiry_revision: revision,
  item_revision: revision,
  channel: z.enum(channels),
  surface: z.enum(["dm", "group_comment"]),
  message: z.string(),
  item: itemInputSchema.extend({
    id: uuid,
    title: z.string(),
    description: z.string(),
  }),
});
export const replySchema = z.object({
  id: uuid,
  inquiry_id: uuid,
  body: z.string(),
  source: z.enum(["manual", "template"]),
  status: z.enum(["Draft", "Approved", "Dismissed"]),
  revision,
  context: contextSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  approved_at: z.string().nullable(),
});
export const threadSchema = z.object({
  inquiry: inquirySchema,
  context: contextSchema,
  replies: z.array(replySchema),
});
export type InquiryInput = z.infer<typeof inquiryInputSchema>;
export type Inquiry = z.infer<typeof inquirySchema>;
export type ReplyContext = z.infer<typeof contextSchema>;
export type Reply = z.infer<typeof replySchema>;
export type Thread = z.infer<typeof threadSchema>;
export const commandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("list") }).strict(),
  z.object({ op: z.literal("get"), id: uuid }).strict(),
  z
    .object({
      op: z.literal("saveInquiry"),
      input: inquiryInputSchema,
      expected_revision: revision.nullable(),
    })
    .strict(),
  z
    .object({
      op: z.literal("draft"),
      id: uuid,
      inquiry_id: uuid,
      body,
      source: z.enum(["manual", "template"]),
      context: contextSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal("edit"),
      id: uuid,
      body,
      expected_revision: revision,
    })
    .strict(),
  z
    .object({
      op: z.literal("approve"),
      id: uuid,
      expected_revision: revision,
      context: contextSchema,
    })
    .strict(),
  z
    .object({ op: z.literal("copy"), id: uuid, expected_revision: revision })
    .strict(),
  z
    .object({
      op: z.literal("status"),
      id: uuid,
      status: z.enum(["Open", "Answered", "Closed"]),
      expected_revision: revision,
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export function parseCommand(value: unknown): Command {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 16384)
    throw new Error(
      "This request is too large. Shorten the question or reply.",
    );
  return commandSchema.parse(value);
}
export function contextMatches(a: ReplyContext | null, b: ReplyContext) {
  if (!a) return false;
  return (
    JSON.stringify(contextSchema.parse(a)) ===
    JSON.stringify(contextSchema.parse(b))
  );
}
export function facts(item: Item) {
  return {
    ...itemInputSchema.parse(item),
    title: item.title,
    description: item.description,
    id: item.id,
  };
}
export function templateReply(c: ReplyContext) {
  const stock =
    c.item.status === "Sold"
      ? " This item is marked sold."
      : c.item.status === "Reserved"
        ? " This item is marked reserved."
        : "";
  if (c.surface === "group_comment")
    return "The asking price is " + formatPHP(c.item.price) + "." + stock;
  return (
    c.item.title +
    " — asking price " +
    formatPHP(c.item.price) +
    ". Condition: " +
    c.item.condition +
    "." +
    stock +
    "\n" +
    c.item.description +
    "\nThanks for your question. Let me confirm any other details."
  );
}
