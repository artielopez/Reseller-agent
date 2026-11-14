import { afterEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/config", () => ({ demoMode: false }));
vi.mock("../src/lib/supabase", () => ({ getSupabase: () => ({ rpc }) }));
import { approvedText } from "../src/lib/buyer/repository";
afterEach(() => vi.useRealTimers());
it("bounds approval revalidation even when auth or the network never answers", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const pending = new Promise<never>(() => {});
  rpc.mockReturnValue(
    Object.assign(pending, {
      abortSignal: (s: AbortSignal) => {
        signal = s;
        return pending;
      },
    }),
  );
  const result = expect(
    approvedText("44444444-4444-4444-8444-444444444444", "1"),
  ).rejects.toThrow("Could not recheck approval");
  await vi.advanceTimersByTimeAsync(10000);
  await result;
  expect(signal?.aborted).toBe(true);
  expect(rpc).toHaveBeenCalledTimes(1);
});
