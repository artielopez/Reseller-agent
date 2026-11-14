import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/lib/config", () => ({ demoMode: false }));
vi.mock("../src/lib/supabase", () => ({
  getSupabase: () => ({ rpc: mock.rpc }),
}));
import { sellerWorkspace } from "../src/lib/seller/repository";
import { createQueueClient } from "../src/lib/automation/draft-controls";
import { mutateThread } from "../src/lib/buyer/repository";
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
for (const operation of ["seller", "queue", "buyer"] as const) {
  it(`cancels a ${operation} operation waiting for authentication before it can dispatch under another account`, async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    let dispatch!: () => void,
      signal: AbortSignal | undefined,
      writes = 0;
    const response = new Promise<{ data: unknown; error: null }>((resolve) => {
      dispatch = () => {
        if (!signal?.aborted) writes++;
        resolve({ data: null, error: null });
      };
    });
    mock.rpc.mockReturnValue({
      abortSignal: (s: AbortSignal) => {
        signal = s;
        return response;
      },
    });
    const client = createQueueClient(
      async (_command, s) => {
        signal = s;
        return response;
      },
      () => parent.signal,
    );
    let outcome: unknown;
    const request =
      operation === "queue"
        ? client.enroll("Synthetic worker")
        : operation === "seller"
          ? sellerWorkspace(
              { op: "review", expected_revision: "0" },
              parent.signal,
            )
          : mutateThread(
              {
                op: "status",
                id: "11111111-1111-4111-8111-111111111111",
                status: "Answered",
                expected_revision: "1",
              },
              parent.signal,
            );
    void request.catch((error) => {
      outcome = error;
    });
    await vi.advanceTimersByTimeAsync(1);
    parent.abort();
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBeInstanceOf(Error);
    expect(signal?.aborted).toBe(true);
    dispatch();
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
}
