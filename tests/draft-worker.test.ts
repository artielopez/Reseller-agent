import { expect, it, vi } from "vitest";
import {
  runDraftJob,
  createWorkerTransport,
  type WorkerTransport,
} from "../src/lib/automation/draft-worker";
import type { DraftDependencies } from "../src/lib/automation/drafting";
const context = {
  inquiry_id: "44444444-4444-4444-8444-444444444444",
  inquiry_revision: "1",
  item_revision: "1",
  channel: "marketplace",
  surface: "dm",
  message: "Price?",
  item: {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Lamp",
    description: "Scratch",
    price: 850,
    condition: "Good",
    category: "Other",
    status: "Listed",
  },
};
const claim = {
  id: "55555555-5555-4555-8555-555555555555",
  lease_id: "66666666-6666-4666-8666-666666666666",
  context,
  status: "leased",
  lease_expires_at: "2030-01-01T00:00:00Z",
};
function fixture() {
  const calls: Record<string, unknown>[] = [];
  const transport = vi.fn<WorkerTransport>(async (command) => {
    calls.push(command);
    switch (command.op) {
      case "claim":
        return claim;
      case "context":
        return context;
      case "start":
        return { admitted: true };
      case "submit":
        return { reply_id: "77777777-7777-4777-8777-777777777777" };
      case "fail":
        return { failed: true };
    }
  });
  const runtime = {
    verifyRuntime: vi.fn(async () => true),
    generate: vi.fn<DraftDependencies["generate"]>(async () => ({
      body: "Asking price is ₱850.",
      reviewReason: "Check details.",
    })),
  };
  return { calls, transport, runtime };
}
it("runs one claimed draft through the shared allowance and persists a review result", async () => {
  const f = fixture();
  expect(await runDraftJob(f.transport, f.runtime)).toEqual({
    status: "completed",
    replyId: "77777777-7777-4777-8777-777777777777",
  });
  expect(f.calls.map((c) => c.op)).toEqual([
    "claim",
    "context",
    "start",
    "context",
    "submit",
  ]);
  expect(f.calls.find((c) => c.op === "submit")).toMatchObject({
    job_id: claim.id,
    lease_id: claim.lease_id,
    body: "Asking price is ₱850.",
  });
  expect(f.calls.some((c) => c.op === "approve" || c.op === "send")).toBe(
    false,
  );
});
it("does no inference without work or runtime verification", async () => {
  const f = fixture();
  f.transport.mockResolvedValueOnce(null);
  expect(await runDraftJob(f.transport, f.runtime)).toEqual({ status: "idle" });
  expect(f.runtime.generate).not.toHaveBeenCalled();
  f.runtime.verifyRuntime.mockResolvedValue(false);
  expect((await runDraftJob(f.transport, f.runtime)).status).toBe("failed");
  expect(f.runtime.generate).not.toHaveBeenCalled();
});
it("does not replay a generation whose start was already used", async () => {
  const f = fixture();
  f.transport.mockImplementation(async (command) => {
    if (command.op === "claim") return claim;
    if (command.op === "context") return context;
    if (command.op === "start") return { admitted: false };
    return { failed: true };
  });
  expect((await runDraftJob(f.transport, f.runtime)).status).toBe("failed");
  expect(f.runtime.generate).not.toHaveBeenCalled();
});
it("reports an ambiguous submission without retrying or marking it failed", async () => {
  const f = fixture();
  f.transport.mockImplementation(async (command) => {
    f.calls.push(command);
    if (command.op === "claim") return claim;
    if (command.op === "context") return context;
    if (command.op === "start") return { admitted: true };
    if (command.op === "submit") throw new Error("lost response");
    return { failed: true };
  });
  expect(await runDraftJob(f.transport, f.runtime)).toEqual({
    status: "unknown",
    jobId: claim.id,
  });
  expect(f.calls.filter((c) => c.op === "submit")).toHaveLength(1);
  expect(f.calls.some((c) => c.op === "fail")).toBe(false);
});
it("uses a fixed HTTPS RPC endpoint with no redirects and bounded, redacted failures", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(null));
  const transport = createWorkerTransport(
    "https://example.supabase.co",
    "public-key",
    "a".repeat(64),
    fetcher,
  );
  expect(await transport({ op: "claim" })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe("https://example.supabase.co/rest/v1/rpc/draft_worker");
  expect(init?.redirect).toBe("error");
  expect(init?.method).toBe("POST");
  expect(String(url)).not.toContain("a".repeat(64));
  fetcher.mockResolvedValueOnce(
    new Response("secret provider error", { status: 403 }),
  );
  await expect(transport({ op: "claim" })).rejects.toThrow(
    "Worker request could not be confirmed",
  );
  for (const url of [
    "http://example.com",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com?key=secret",
  ])
    expect(() =>
      createWorkerTransport(url, "public", "a".repeat(64), fetcher),
    ).toThrow();
});
it("does not send unsupported operations or oversized commands", async () => {
  const fetcher = vi.fn<typeof fetch>();
  const transport = createWorkerTransport(
    "https://example.supabase.co",
    "public",
    "a".repeat(64),
    fetcher,
  );
  await expect(transport({ op: "send" })).rejects.toThrow();
  await expect(
    transport({ op: "submit", body: "x".repeat(17000) }),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects oversized transport responses", async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response('"' + "x".repeat(65537) + '"'),
  );
  const transport = createWorkerTransport(
    "https://example.supabase.co",
    "public",
    "a".repeat(64),
    fetcher,
  );
  await expect(transport({ op: "claim" })).rejects.toThrow(
    "Worker request could not be confirmed",
  );
});
