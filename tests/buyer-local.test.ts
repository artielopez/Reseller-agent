import { it, expect } from "vitest";
import { initialBuyerState, localCommand } from "../src/lib/buyer/local";
import {
  parseCommand,
  type Thread,
  type Command,
} from "../src/lib/buyer/domain";
import { demoItems } from "../src/lib/demo";
const items = demoItems(),
  qid = "44444444-4444-4444-8444-444444444444",
  rid = "55555555-5555-4555-8555-555555555555";
it("keeps demo approval, copy and replay behavior aligned with the SQL boundary", () => {
  let state = initialBuyerState();
  let result: unknown;
  const run = (command: Command) => {
    ({ state, result } = localCommand(state, items, parseCommand(command)));
    return result as Thread;
  };
  const input = {
    id: qid,
    item_id: items[0].id,
    channel: "groups" as const,
    surface: "group_comment" as const,
    buyer_name: "",
    message: "Price?",
    received_at: "2026-10-30T00:00:00Z",
  };
  let t = run({ op: "saveInquiry", input, expected_revision: null });
  run({ op: "saveInquiry", input, expected_revision: null });
  expect(state.inquiries).toHaveLength(1);
  t = run({
    op: "draft",
    id: rid,
    inquiry_id: qid,
    body: "Asking price 6500.",
    source: "manual",
    context: t.context,
  });
  t = run({
    op: "approve",
    id: rid,
    expected_revision: t.replies[0].revision,
    context: t.context,
  });
  const approved = t.replies[0];
  run({ op: "copy", id: rid, expected_revision: approved.revision });
  expect(state.inquiries[0].status).toBe("Open");
  items[0] = { ...items[0], price: 7000, replyContextRevision: "2" };
  expect(() =>
    run({ op: "copy", id: rid, expected_revision: approved.revision }),
  ).toThrow(/changed/i);
  t = run({ op: "get", id: qid });
  expect(t.replies[0].status).toBe("Draft");
  expect(t.replies[0].context?.item.price).toBe(6500);
  expect(() =>
    run({
      op: "approve",
      id: rid,
      expected_revision: t.replies[0].revision,
      context: t.context,
    }),
  ).toThrow(/fresh/i);
});
it("refuses corrupt local data rather than replacing saved conversations", () => {
  expect(() =>
    localCommand({ version: 1, inquiries: [{}], replies: [] }, demoItems(), {
      op: "list",
    }),
  ).toThrow();
});
it("invalidates local approval when saved terms change while retaining the original draft text and context", () => {
  const inventory = demoItems();
  let state = initialBuyerState();
  let terms: import("../src/lib/seller/preferences").SellerTerms | undefined =
    undefined;
  const run = (command: Command) => {
    const out = localCommand(
      state,
      inventory,
      parseCommand(command),
      "2026-10-31T01:00:00Z",
      terms,
    );
    state = out.state;
    return out.result as Thread;
  };
  let t = run({
    op: "saveInquiry",
    expected_revision: null,
    input: {
      id: qid,
      item_id: inventory[0].id,
      channel: "marketplace",
      surface: "dm",
      buyer_name: "",
      message: "Pickup?",
      received_at: "2026-10-31T00:00:00Z",
    },
  });
  t = run({
    op: "draft",
    id: rid,
    inquiry_id: qid,
    body: "Original private draft",
    source: "manual",
    context: t.context,
  });
  t = run({
    op: "approve",
    id: rid,
    expected_revision: t.replies[0].revision,
    context: t.context,
  });
  const approved = t.replies[0];
  terms = {
    revision: "1",
    pickup_area: "Quezon City",
    delivery_notes: "",
    payment_notes: "",
  };
  expect(() =>
    run({ op: "copy", id: rid, expected_revision: approved.revision }),
  ).toThrow();
  t = run({ op: "get", id: qid });
  expect(t.context.seller_terms).toEqual(terms);
  expect(t.replies[0]).toMatchObject({
    status: "Draft",
    body: "Original private draft",
    context: approved.context,
  });
});
