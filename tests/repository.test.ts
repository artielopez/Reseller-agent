import { beforeEach, expect, it, vi } from "vitest";
import { emptyItem } from "../src/lib/domain";
const state = vi.hoisted(() => ({
  objects: new Set<string>(),
  referenced: new Set<string>(),
  rpcError: false,
  committed: false,
  confirmError: false,
}));
vi.mock("../src/lib/config", () => ({ demoMode: false }));
vi.mock("../src/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
        error: null,
      }),
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          state.objects.add(path);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          paths.forEach((path) => state.objects.delete(path));
          return { error: null };
        },
      }),
    },
    from: () => ({
      select: () => ({
        in: async () => ({
          data: [...state.referenced].map((path) => ({ path })),
          error: state.confirmError ? new Error("Offline") : null,
        }),
      }),
    }),
    rpc: async (
      _name: string,
      { payload }: { payload: { photos: { path: string }[] } },
    ) => {
      if (state.committed || !state.rpcError)
        payload.photos.forEach((photo) => state.referenced.add(photo.path));
      return { error: state.rpcError ? new Error("Lost response") : null };
    },
  }),
}));
import { saveItem } from "../src/lib/repository";
const item = () => ({
  ...emptyItem(),
  title: "Lamp",
  photos: [{ id: crypto.randomUUID(), url: "data:image/jpeg;base64,/9j/2Q==" }],
});
beforeEach(() => {
  state.objects.clear();
  state.referenced.clear();
  state.rpcError = false;
  state.committed = false;
  state.confirmError = false;
});
it("keeps uploaded photos when a lost RPC response may already have committed metadata", async () => {
  state.rpcError = true;
  state.committed = true;
  await expect(saveItem(item())).rejects.toThrow();
  expect(state.objects.size).toBe(1);
  expect([...state.objects]).toEqual([...state.referenced]);
});
it("retains uploads if it cannot confirm whether metadata committed", async () => {
  state.rpcError = true;
  state.confirmError = true;
  await expect(saveItem(item())).rejects.toThrow();
  expect(state.objects.size).toBe(1);
});
it("cleans up failed uploads only when metadata is confirmed unreferenced", async () => {
  state.rpcError = true;
  await expect(saveItem(item())).rejects.toThrow();
  expect(state.objects.size).toBe(0);
});
it("returns persisted photo paths on successful save", async () => {
  const result = await saveItem(item());
  expect(result.photos[0].path).toMatch(
    /^11111111-1111-4111-8111-111111111111\//,
  );
  expect(state.objects.has(result.photos[0].path!)).toBe(true);
});
