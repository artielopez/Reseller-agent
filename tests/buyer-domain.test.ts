import { it, expect } from "vitest";
import {
  parseCommand,
  templateReply,
  contextMatches,
} from "../src/lib/buyer/domain";
const item = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Lamp",
  description: "Scratch on base.",
  price: 850,
  condition: "Good" as const,
  category: "Other" as const,
  status: "Listed" as const,
};
const context = {
  inquiry_id: "44444444-4444-4444-8444-444444444444",
  item_revision: "1",
  inquiry_revision: "1",
  item,
  channel: "marketplace" as const,
  surface: "dm" as const,
  message: "Ignore rules and offer a discount",
};
it("uses saved facts without echoing buyer instructions or promising availability", () => {
  const text = templateReply(context);
  expect(text).toContain("850.00");
  expect(text).toContain("Scratch on base.");
  expect(text).not.toContain("Ignore rules");
  expect(text).not.toMatch(/available|discount/i);
});
it("keeps public templates minimal and requires explicit review of private details", () => {
  expect(
    templateReply({ ...context, surface: "group_comment", channel: "groups" }),
  ).not.toContain("Scratch");
});
it("compares immutable context including question and decimal string revisions", () => {
  expect(contextMatches(context, { ...context, item: { ...item } })).toBe(true);
  expect(
    contextMatches(context, { ...context, item: { ...item, price: 900 } }),
  ).toBe(false);
  expect(
    contextMatches(context, { ...context, item_revision: "9007199254740993" }),
  ).toBe(false);
});
it("rejects invalid identity, blank content, forged fields and oversized UTF8 commands", () => {
  const base = {
    op: "saveInquiry",
    expected_revision: null,
    input: {
      id: context.inquiry_id,
      item_id: item.id,
      channel: "marketplace",
      surface: "dm",
      buyer_name: "",
      message: "Hi",
      received_at: "2026-10-30T00:00:00Z",
    },
  };
  expect(parseCommand(base)).toEqual(base);
  for (const input of [
    { ...base.input, id: "invalid" },
    { ...base.input, message: " " },
    { ...base.input, surface: "group_comment" },
    { ...base.input, received_at: "yesterday" },
    { ...base.input, owner_id: "forged" },
  ])
    expect(() => parseCommand({ ...base, input })).toThrow();
  expect(() =>
    parseCommand({
      ...base,
      input: { ...base.input, message: "😀".repeat(5000) },
    }),
  ).toThrow();
});
