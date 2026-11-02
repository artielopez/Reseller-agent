import { afterEach, expect, it, vi } from "vitest";
import { writeClipboard } from "../src/lib/clipboard";
afterEach(() => vi.useRealTimers());
it("fails promptly when the browser clipboard never settles", async () => {
  vi.useFakeTimers();
  const write = vi.fn(() => new Promise<void>(() => {}));
  const result = expect(writeClipboard("synthetic", write)).rejects.toThrow(
    "Clipboard unavailable",
  );
  await vi.advanceTimersByTimeAsync(3000);
  await result;
  expect(write).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it("cleans its timer on success and propagates rejection without retries", async () => {
  vi.useFakeTimers();
  await expect(
    writeClipboard("synthetic", async () => {}),
  ).resolves.toBeUndefined();
  await expect(
    writeClipboard("synthetic", async () => {
      throw new Error("Denied");
    }),
  ).rejects.toThrow();
  expect(vi.getTimerCount()).toBe(0);
});
