import { describe, expect, it } from "vitest";
import { restoreState } from "../src/lib/automation/demo-store";
import {
  initialState,
  capture,
  processEvent,
  updateSettings,
  claimReply as claimReviewed,
  decisionContext,
  type State,
} from "../src/lib/automation/engine";
import { emptyItem, type Item } from "../src/lib/domain";

describe("saved demo queue validation", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  const item = { ...emptyItem(), id: "lamp", title: "Lamp", price: 500 };
  function ready() {
    return processEvent(
      capture(
        updateSettings(initialState(), { paused: false, mode: "simulate" }),
        {
          id: "event",
          threadId: "thread",
          source: "synthetic",
          channel: "marketplace",
          surface: "dm",
          revision: 1,
          itemId: item.id,
          body: "How much?",
          complete: true,
          receivedAt: now - 20000,
        },
      ),
      "event",
      [item],
      now,
    );
  }
  it("restores valid drafts without changing approved facts", () => {
    const s = ready();
    expect(restoreState(s)).toEqual(s);
  });
  it("preserves interrupted claims as unknown instead of retryable", () => {
    const claimed = claimReply(ready(), "event", [item], now);
    const restored = restoreState(claimed.state);
    expect(restored.events[0].status).toBe("unknown");
    expect(claimReply(restored, "event", [item], now).token).toBeNull();
  });
  it("rejects unsupported storage, duplicate IDs, live sources and missing drafts", () => {
    expect(() => restoreState({ version: 99 })).toThrow();
    const s = ready();
    expect(() =>
      restoreState({ ...s, events: [s.events[0], s.events[0]] }),
    ).toThrow();
    expect(() =>
      restoreState({
        ...s,
        events: [{ ...s.events[0], source: "carousell-live" }],
      }),
    ).toThrow();
    expect(() =>
      restoreState({ ...s, events: [{ ...s.events[0], reply: null }] }),
    ).toThrow();
  });
});

function claimReply(state: State, id: string, items: Item[], now: number) {
  return claimReviewed(
    state,
    id,
    items,
    now,
    decisionContext(state, id, items),
  );
}
