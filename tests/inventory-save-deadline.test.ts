import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyItem } from "../src/lib/domain";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  upload: vi.fn(),
  rpc: vi.fn(),
  remove: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("../src/lib/config", () => ({ demoMode: false }));
vi.mock("../src/lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getUser: mocks.auth },
    rpc: mocks.rpc,
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
    from: () => ({ select: () => ({ in: mocks.lookup }) }),
  }),
}));
import { saveItem } from "../src/lib/repository";
const receipt = {
  data: {
    saveRevision: "44444444-4444-4444-8444-444444444444",
    updatedAt: "2026-11-04T00:00:00Z",
    replyContextRevision: "2",
  },
  error: null,
};
const authenticated = {
  data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
  error: null,
};
function abortable<T>(promise: Promise<T>) {
  return Object.assign(promise, { abortSignal: () => promise });
}
const pending = () => new Promise<never>(() => {});
const item = () => ({
  ...emptyItem(),
  title: "Lamp",
  photos: [{ id: crypto.randomUUID(), url: "data:image/jpeg;base64,/9j/2Q==" }],
});
beforeEach(() => {
  vi.useFakeTimers();
  mocks.auth.mockResolvedValue(authenticated);
  mocks.upload.mockResolvedValue({ error: null });
  mocks.rpc.mockReturnValue(abortable(Promise.resolve(receipt)));
  mocks.remove.mockResolvedValue({ error: null });
  mocks.lookup.mockReturnValue(
    abortable(Promise.resolve({ data: [], error: null })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
for (const stage of ["auth", "upload", "rpc"] as const) {
  it(`bounds a stalled ${stage} save stage and never continues late work into another write`, async () => {
    let finish!: (value: unknown) => void;
    const delayed = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    mocks[stage].mockReturnValue(abortable(delayed));
    let outcome: unknown;
    void saveItem(item()).then(
      (v) => {
        outcome = v;
      },
      (e) => {
        outcome = e;
      },
    );
    await vi.advanceTimersByTimeAsync(125_001);
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(
      /confirm.*save|reload inventory/i,
    );
    const calls = mocks.rpc.mock.calls.length;
    finish(
      stage === "auth"
        ? authenticated
        : stage === "rpc"
          ? receipt
          : { error: null },
    );
    await vi.advanceTimersByTimeAsync(5_001);
    expect(mocks.rpc).toHaveBeenCalledTimes(calls);
    expect(mocks.upload).toHaveBeenCalledTimes(stage === "auth" ? 0 : 1);
    if (stage === "rpc") expect(mocks.remove).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
}
it("returns the confirmed saved revision even when old-photo cleanup never responds", async () => {
  mocks.remove.mockReturnValue(pending());
  const current = item();
  let result: unknown;
  void saveItem(current, {
    ...current,
    photos: [{ id: crypto.randomUUID(), url: "old", path: "own/item/old.jpg" }],
  }).then((v) => {
    result = v;
  });
  await vi.advanceTimersByTimeAsync(125_001);
  expect(result).toMatchObject(receipt.data);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it("surfaces the original stale-save conflict when rejected-upload cleanup stalls", async () => {
  mocks.rpc.mockReturnValue(
    abortable(Promise.resolve({ data: null, error: { code: "PT409" } })),
  );
  mocks.lookup.mockReturnValue(abortable(pending()));
  let outcome: unknown;
  void saveItem(item()).catch((e) => {
    outcome = e;
  });
  await vi.advanceTimersByTimeAsync(125_001);
  expect(outcome).toBeInstanceOf(Error);
  expect((outcome as Error).message).toMatch(/changed elsewhere/i);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("account cancellation stops a pending upload from later saving into a new session", async () => {
  let finish!: (value: { error: null }) => void;
  mocks.upload.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const controller = new AbortController();
  let outcome: unknown;
  void saveItem(item(), undefined, controller.signal).catch((error) => {
    outcome = error;
  });
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  controller.abort();
  await vi.advanceTimersByTimeAsync(1);
  expect(outcome).toBeInstanceOf(Error);
  finish({ error: null });
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.lookup).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
