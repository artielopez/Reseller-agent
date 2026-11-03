import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ order: vi.fn(), signed: vi.fn() }));
vi.mock("../src/lib/config", () => ({ demoMode: false }));
vi.mock("../src/lib/supabase", () => ({
  getSupabase: () => ({
    from: () => ({ select: () => ({ order: mocks.order }) }),
    storage: { from: () => ({ createSignedUrls: mocks.signed }) },
  }),
}));
import { listItems } from "../src/lib/repository";
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
for (const phase of ["inventory", "private photos"] as const) {
  it(`releases inventory loading if ${phase} never answers`, async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => {});
    const value = {
      data: [
        {
          id: "i",
          title: "Test",
          description: "",
          price: 1,
          category: "Other",
          condition: "Good",
          status: "Draft",
          updated_at: "2026-11-04T00:00:00Z",
          save_revision: "r",
          item_photos: [{ id: "p", path: "own/item/photo.jpg", position: 0 }],
          listings: [],
        },
      ],
      error: null,
    };
    let signal: AbortSignal | undefined;
    const response = phase === "inventory" ? pending : Promise.resolve(value);
    mocks.order.mockReturnValue(
      Object.assign(response, {
        abortSignal(s: AbortSignal) {
          signal = s;
          return response;
        },
      }),
    );
    mocks.signed.mockReturnValue(pending);
    let outcome: unknown;
    void listItems().then(
      () => (outcome = "unexpected success"),
      (e) => (outcome = e),
    );
    await vi.advanceTimersByTimeAsync(15_001);
    expect(outcome).toBeInstanceOf(Error);
    expect(signal?.aborted).toBe(true);
    expect(mocks.order).toHaveBeenCalledTimes(1);
    expect(mocks.signed).toHaveBeenCalledTimes(
      phase === "private photos" ? 1 : 0,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
}
