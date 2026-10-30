import { expect, it, vi } from "vitest";
import { runWorkerLoop } from "../src/worker/runner";
it("waits for cleanup before polling and stops on uncertain submission without retry", async () => {
  const sequence: string[] = [];
  let count = 0;
  const job = vi.fn(async () => {
    sequence.push("job");
    return count++ === 0
      ? { status: "idle" as const }
      : { status: "unknown" as const, jobId: "synthetic" };
  });
  const cleanup = vi.fn(async () => {
    sequence.push("cleanup");
  });
  const wait = vi.fn(async () => {
    sequence.push("wait");
  });
  const result = await runWorkerLoop({
    watch: true,
    signal: new AbortController().signal,
    job: () => ({ run: job, close: cleanup }),
    wait,
    report: () => {},
  });
  expect(result).toBe("unknown");
  expect(sequence).toEqual(["job", "cleanup", "wait", "job", "cleanup"]);
  expect(job).toHaveBeenCalledTimes(2);
});
it("runs at most once in once mode; canceled or failed work never starts a follow-up", async () => {
  const abort = new AbortController();
  const run = vi.fn(async () => ({ status: "idle" as const }));
  const close = vi.fn(async () => {});
  const wait = vi.fn(async () => {});
  expect(
    await runWorkerLoop({
      watch: false,
      signal: abort.signal,
      job: () => ({ run, close }),
      wait,
      report: () => {},
    }),
  ).toBe("idle");
  expect(run).toHaveBeenCalledTimes(1);
  abort.abort();
  expect(
    await runWorkerLoop({
      watch: true,
      signal: abort.signal,
      job: () => ({ run, close }),
      wait,
      report: () => {},
    }),
  ).toBe("stopped");
  expect(run).toHaveBeenCalledTimes(1);
  await expect(
    runWorkerLoop({
      watch: true,
      signal: new AbortController().signal,
      job: () => ({
        run: async () => {
          throw new Error("failure");
        },
        close,
      }),
      wait,
      report: () => {},
    }),
  ).rejects.toThrow();
  expect(close).toHaveBeenCalledTimes(2);
  expect(wait).not.toHaveBeenCalled();
});
