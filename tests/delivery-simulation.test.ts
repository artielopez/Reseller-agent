import { expect, it, vi } from "vitest";
import {
  FakeDeliveryAdapter,
  runDeliverySimulation,
} from "../src/lib/automation/delivery-simulation";
const id = "55555555-5555-4555-8555-555555555555",
  lease = "66666666-6666-4666-8666-666666666666";
const candidate = {
  simulation: true,
  body: "The saved price is ₱850.",
  destination: {
    channel: "marketplace",
    surface: "dm",
    account_id: "synthetic:account",
    thread_id: "synthetic:thread",
    post_id: null,
    comment_id: null,
    message_id: "synthetic:question",
  },
};
function transport() {
  let claimed = false;
  return vi.fn(async (command: Record<string, unknown>): Promise<unknown> => {
    if (command.op === "claim") {
      if (claimed) return null;
      claimed = true;
      return {
        id,
        lease_id: lease,
        status: "claimed",
        candidate,
        simulation: true,
      };
    }
    if (command.op === "start")
      return { id, status: "submitted", candidate, simulation: true };
    if (command.op === "outcome")
      return { id, status: command.outcome, simulation: true };
    throw new Error("Unknown command");
  });
}
it("durably starts before invoking the in-memory fake adapter and never retries a claimed job", async () => {
  const rpc = transport(),
    adapter = new FakeDeliveryAdapter("confirmed");
  const submit = vi.spyOn(adapter, "submit");
  expect(await runDeliverySimulation(rpc, id, adapter)).toBe("confirmed");
  expect(submit).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls.map(([c]) => c.op)).toEqual([
    "claim",
    "start",
    "outcome",
  ]);
  expect(rpc.mock.invocationCallOrder[1]).toBeLessThan(
    submit.mock.invocationCallOrder[0],
  );
  expect(await runDeliverySimulation(rpc, id, adapter)).toBe("idle");
  expect(submit).toHaveBeenCalledTimes(1);
});
it("does not call the fake adapter after an uncertain start or changed destination", async () => {
  const rpc = transport(),
    adapter = new FakeDeliveryAdapter("confirmed");
  const submit = vi.spyOn(adapter, "submit");
  rpc
    .mockResolvedValueOnce({
      id,
      lease_id: lease,
      status: "claimed",
      candidate,
      simulation: true,
    })
    .mockRejectedValueOnce(new Error("Lost start response"));
  expect(await runDeliverySimulation(rpc, id, adapter)).toBe("unknown");
  expect(submit).not.toHaveBeenCalled();
  const changed = transport();
  changed
    .mockResolvedValueOnce({
      id,
      lease_id: lease,
      status: "claimed",
      candidate,
      simulation: true,
    })
    .mockResolvedValueOnce({
      id,
      status: "submitted",
      candidate: {
        ...candidate,
        destination: {
          ...candidate.destination,
          thread_id: "synthetic:changed",
        },
      },
      simulation: true,
    });
  expect(await runDeliverySimulation(changed, id, adapter)).toBe("unknown");
  expect(submit).not.toHaveBeenCalled();
});
it("records lost acknowledgment as unknown and exposes exact fake confirmation evidence without resubmission", async () => {
  const rpc = transport(),
    adapter = new FakeDeliveryAdapter("lost_ack");
  expect(await runDeliverySimulation(rpc, id, adapter)).toBe("unknown");
  expect(rpc.mock.calls.at(-1)?.[0]).toMatchObject({
    op: "outcome",
    id,
    lease_id: lease,
    outcome: "unknown",
  });
  expect(adapter.confirmationFor(id)).toMatchObject({
    simulation_id: id,
    destination: candidate.destination,
  });
  expect(await runDeliverySimulation(rpc, id, adapter)).toBe("idle");
});
it("rejects real destinations and never retries an ambiguous outcome write", async () => {
  const rpc = transport(),
    adapter = new FakeDeliveryAdapter("confirmed");
  const submit = vi.spyOn(adapter, "submit");
  rpc.mockResolvedValueOnce({
    id,
    lease_id: lease,
    status: "claimed",
    candidate: {
      ...candidate,
      destination: { ...candidate.destination, account_id: "real-account" },
    },
    simulation: true,
  });
  expect(await runDeliverySimulation(rpc, id, adapter)).toBe("unavailable");
  expect(submit).not.toHaveBeenCalled();
  const ambiguous = transport();
  ambiguous
    .mockImplementationOnce(async () => ({
      id,
      lease_id: lease,
      status: "claimed",
      candidate,
      simulation: true,
    }))
    .mockImplementationOnce(async () => ({
      id,
      status: "submitted",
      candidate,
      simulation: true,
    }))
    .mockRejectedValueOnce(new Error("Lost outcome response"));
  expect(await runDeliverySimulation(ambiguous, id, adapter)).toBe("unknown");
  expect(ambiguous).toHaveBeenCalledTimes(3);
  expect(submit).toHaveBeenCalledTimes(1);
});
