import { afterEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/config", () => ({ demoMode: false }));
vi.mock("../src/lib/supabase", () => ({ getSupabase: () => ({ rpc }) }));
import { createQueueClient } from "../src/lib/automation/draft-controls";
import { createPrivacyClient } from "../src/lib/privacy-preview";
import { readThread, mutateThread } from "../src/lib/buyer/repository";
import { sellerWorkspace } from "../src/lib/seller/repository";
const id = "11111111-1111-4111-8111-111111111111";
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
for (const operation of [
  "queue list",
  "queue mutation",
  "privacy",
  "buyer read",
  "buyer mutation",
  "seller read",
] as const) {
  it(`bounds ${operation} even when Auth/network ignores cancellation, without retries`, async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const forever = new Promise<never>(() => {});
    const transport = vi.fn((_input: unknown, supplied?: AbortSignal) => {
      signal = supplied;
      return forever;
    });
    rpc.mockReturnValue(
      Object.assign(forever, {
        abortSignal(s: AbortSignal) {
          signal = s;
          return forever;
        },
      }),
    );
    const queue = createQueueClient(transport),
      privacy = createPrivacyClient(transport);
    const work =
      operation === "queue list"
        ? queue.list()
        : operation === "queue mutation"
          ? queue.enqueue(id, id)
          : operation === "privacy"
            ? privacy.preview(30)
            : operation === "buyer read"
              ? readThread(id)
              : operation === "buyer mutation"
                ? mutateThread({
                    op: "status",
                    id,
                    status: "Answered",
                    expected_revision: "1",
                  })
                : sellerWorkspace({ op: "get" });
    let outcome: unknown;
    void work.then(
      () => (outcome = "unexpected success"),
      (e) => (outcome = e),
    );
    await vi.advanceTimersByTimeAsync(15_001);
    expect(outcome).toBeInstanceOf(Error);
    expect(signal?.aborted).toBe(true);
    expect(transport.mock.calls.length + rpc.mock.calls.length).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
}
