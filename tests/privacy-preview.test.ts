import { expect, it, vi } from "vitest";
import { createPrivacyClient } from "../src/lib/privacy-preview";
it("validates the window before a request and sanitizes errors without retry", async () => {
  const rpc = vi.fn(async () => ({
    data: null,
    error: { message: "private server value" },
  }));
  const client = createPrivacyClient(rpc);
  await expect(client.preview(1)).rejects.toThrow("30, 90 or 180");
  expect(rpc).not.toHaveBeenCalled();
  await expect(client.preview(30)).rejects.toThrow("Could not load");
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("accepts only counts and snapshot fields, rejecting negative or malformed counts", async () => {
  const result = {
    as_of: "2026-11-03T04:00:00Z",
    cutoff: "2026-10-04T04:00:00Z",
    window_days: 30,
    items: 1,
    photo_references: 1,
    photo_objects: 2,
    questions: 3,
    replies: 1,
    history_candidates: 1,
    history_candidate_replies: 1,
    unlinked_photo_candidates: 1,
    message: "private text",
  };
  const rpc = vi.fn(async () => ({ data: result, error: null }));
  expect(
    JSON.stringify(await createPrivacyClient(rpc).preview(30)),
  ).not.toContain("private text");
  result.items = -1;
  await expect(createPrivacyClient(rpc).preview(30)).rejects.toThrow(
    "Could not load",
  );
});
