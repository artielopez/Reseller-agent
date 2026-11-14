import { afterEach, expect, it, vi } from "vitest";
import { emptyItem } from "../src/lib/domain";
const mock = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getSession: mock.session } }),
}));
import { requestListingCopy } from "../src/lib/listing-generation";
const facts = () => ({ ...emptyItem(), title: "Synthetic lamp" });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it("never sends listing facts after account cancellation during a delayed session lookup", async () => {
  let release!: (value: unknown) => void;
  mock.session.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const parent = new AbortController();
  const request = requestListingCopy(facts(), parent.signal);
  const assertion = expect(request).rejects.toThrow(
    /Generation did not finish/,
  );
  await Promise.resolve();
  parent.abort();
  await assertion;
  release({
    data: { session: { access_token: "synthetic-token" } },
    error: null,
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
});
it("does not call generation when there is no authenticated session", async () => {
  mock.session.mockResolvedValue({ data: { session: null }, error: null });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    requestListingCopy(facts(), new AbortController().signal),
  ).rejects.toThrow(/session expired/);
  expect(fetch).not.toHaveBeenCalled();
});
it("bounds stalled response decoding and makes only one generation request", async () => {
  vi.useFakeTimers();
  mock.session.mockResolvedValue({
    data: { session: { access_token: "synthetic-token" } },
    error: null,
  });
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: () => new Promise(() => {}) });
  vi.stubGlobal("fetch", fetch);
  let outcome: unknown;
  void requestListingCopy(facts(), new AbortController().signal).catch(
    (error) => {
      outcome = error;
    },
  );
  await vi.advanceTimersByTimeAsync(45_001);
  expect(outcome).toBeInstanceOf(Error);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
