import { afterEach, expect, it, vi } from "vitest";
import { withRequestDeadline } from "../src/lib/request-deadline";
afterEach(() => vi.useRealTimers());
it("does not start work when its parent is already canceled", async () => {
  const parent = new AbortController();
  parent.abort("private reason");
  const work = vi.fn(async () => "should not run");
  await expect(
    withRequestDeadline(work, "Safe cancellation", parent.signal),
  ).rejects.toThrow("Safe cancellation");
  expect(work).not.toHaveBeenCalled();
});
it("cleans timers on success and does not retry or surface a late rejection after timeout", async () => {
  vi.useFakeTimers();
  await expect(
    withRequestDeadline(async () => 42, "Safe timeout"),
  ).resolves.toBe(42);
  expect(vi.getTimerCount()).toBe(0);
  let fail!: (reason: Error) => void;
  const work = vi.fn(() => new Promise<never>((_, reject) => (fail = reject)));
  const result = expect(
    withRequestDeadline(work, "Safe timeout"),
  ).rejects.toThrow("Safe timeout");
  await vi.advanceTimersByTimeAsync(15000);
  await result;
  fail(new Error("private late transport error"));
  await vi.advanceTimersByTimeAsync(1);
  expect(work).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it("a parent cancellation settles an in-flight request even if transport ignores abort", async () => {
  vi.useFakeTimers();
  const parent = new AbortController();
  let captured: AbortSignal | undefined;
  const result = expect(
    withRequestDeadline(
      (s) => {
        captured = s;
        return new Promise<never>(() => {});
      },
      "Safe canceled",
      parent.signal,
    ),
  ).rejects.toThrow("Safe canceled");
  await vi.advanceTimersByTimeAsync(1);
  parent.abort();
  await result;
  expect(captured?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
