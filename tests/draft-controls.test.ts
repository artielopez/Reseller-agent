import { describe, expect, it, vi } from "vitest";
import { createQueueClient } from "../src/lib/automation/draft-controls";
const id = "11111111-1111-4111-8111-111111111111";
describe("owner draft controls boundary", () => {
  it("rejects invalid commands without performing a request", async () => {
    const rpc = vi.fn();
    const client = createQueueClient(rpc);
    await expect(client.enroll("   ")).rejects.toThrow("Check");
    await expect(client.pause(true, "0")).rejects.toThrow("Check");
    await expect(client.enqueue("bad", id)).rejects.toThrow("Check");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("parses safe list fields and drops unexpected response data", async () => {
    const client = createQueueClient(async () => ({
      data: {
        paused: true,
        revision: "1",
        workers: [
          {
            id,
            label: "Mac",
            expires_at: "2099-01-01T00:00:00Z",
            revoked_at: null,
            last_seen_at: null,
            token_hash: "hidden",
          },
        ],
        jobs: [],
        secret: "hidden",
      },
      error: null,
    }));
    const state = await client.list();
    expect(state.workers[0].label).toBe("Mac");
    expect(JSON.stringify(state)).not.toContain("hidden");
  });
  it("sanitizes network, RPC and malformed response failures without retrying", async () => {
    for (const result of [
      new Error("private secret"),
      { data: null, error: { code: "XX000", message: "private secret" } },
      { data: { token: "private secret" }, error: null },
    ]) {
      const rpc = vi.fn(async () => {
        if (result instanceof Error) throw result;
        return result;
      });
      await expect(createQueueClient(rpc).enroll("Mac")).rejects.toThrow(
        "Reload worker settings",
      );
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });
  it("reports stale controls distinctly and validates returned enrollment", async () => {
    await expect(
      createQueueClient(async () => ({
        data: null,
        error: { code: "40001" },
      })).pause(false, "1"),
    ).rejects.toThrow("changed");
    const rpc = vi.fn(async () => ({
      data: { id, token: "a".repeat(64), expires_at: "2099-01-01T00:00:00Z" },
      error: null,
    }));
    expect((await createQueueClient(rpc).enroll(" Mac ")).token).toHaveLength(
      64,
    );
    expect(rpc).toHaveBeenCalledWith({ op: "enroll", label: "Mac" });
  });
});
