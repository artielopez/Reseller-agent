import { expect, it } from "vitest";
import {
  initialState,
  capture,
  processEvent,
  updateSettings,
  approveReply,
  claimReply,
  decisionContext,
} from "../src/lib/automation/engine";
import { emptyItem } from "../src/lib/domain";
const now = Date.now();
const item = { ...emptyItem(), id: "lamp", price: 850, title: "Lamp" };
function ready() {
  return processEvent(
    capture(
      updateSettings(initialState(), { paused: false, mode: "simulate" }),
      {
        id: "e",
        threadId: "t",
        source: "synthetic",
        channel: "marketplace",
        surface: "dm",
        revision: 1,
        itemId: "lamp",
        body: "How much?",
        complete: true,
        receivedAt: now - 20000,
      },
    ),
    "e",
    [item],
    now,
  );
}
it("rejects approval when inventory changed after the user viewed the draft", () => {
  const s = ready(),
    viewed = decisionContext(s, "e", [item]);
  expect(() =>
    approveReply(
      s,
      "e",
      s.events[0].reply!.body,
      [{ ...item, price: 900 }],
      now,
      viewed,
    ),
  ).toThrow(/changed/i);
});
it("rejects a stale tab trying to deliver another tab's newly approved text", () => {
  const s = ready(),
    viewed = decisionContext(s, "e", [item]);
  const edited = approveReply(s, "e", "Let me check.", [item], now, viewed);
  expect(() => claimReply(edited, "e", [item], now, viewed)).toThrow(
    /changed/i,
  );
});

it("does not revive stale saved text by refreshing the displayed inventory", () => {
  const s = ready(),
    changed = [{ ...item, price: 900 }];
  expect(() =>
    approveReply(
      s,
      "e",
      s.events[0].reply!.body,
      changed,
      now,
      decisionContext(s, "e", changed),
    ),
  ).toThrow(/stale/i);
});
