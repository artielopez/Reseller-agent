import { beforeEach, expect, it, vi } from "vitest";
import { emptyItem } from "../src/lib/domain";
const state = vi.hoisted(() => ({
  objects: new Set<string>(),
  referenced: new Set<string>(),
  rpcError: false,
  committed: false,
  confirmError: false,
  rpcCode: "",
  calls: [] as { name: string; payload: unknown }[],
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
      name: string,
      { payload }: { payload: { photos: { path: string }[] } },
    ) => {
      state.calls.push({ name, payload });
      if (state.committed || !state.rpcError)
        payload.photos.forEach((photo) => state.referenced.add(photo.path));
      return {
        data: {
          saveRevision: "44444444-4444-4444-8444-444444444444",
          updatedAt: "2026-11-03T00:00:00Z",
          replyContextRevision: "2",
        },
        error: state.rpcError
          ? Object.assign(new Error("Lost response"), { code: state.rpcCode })
          : null,
      };
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
  state.rpcCode = "";
  state.calls.length = 0;
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
it("retains uploads after an uncertain save even when metadata is not visible yet", async () => {
  state.rpcError = true;
  await expect(saveItem(item())).rejects.toThrow();
  expect(state.objects.size).toBe(1);
});
it("reports an explicit conflict and cleans only definitively rejected unreferenced uploads", async () => {
  state.rpcError = true;
  state.rpcCode = "PT409";
  await expect(saveItem(item())).rejects.toThrow(/changed.*reload/i);
  expect(state.objects.size).toBe(0);
});
it("returns persisted photo paths on successful save", async () => {
  const result = await saveItem(item());
  expect(result.photos[0].path).toMatch(
    /^11111111-1111-4111-8111-111111111111\//,
  );
  expect(state.objects.has(result.photos[0].path!)).toBe(true);
  expect(result).toMatchObject({
    saveRevision: "44444444-4444-4444-8444-444444444444",
    updatedAt: "2026-11-03T00:00:00Z",
    replyContextRevision: "2",
  });
  expect(state.calls[0]).toMatchObject({
    name: "save_inventory_item_checked",
    payload: { saveRevision: null },
  });
});
