import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createOpenClawRuntime } from "../src/worker/openclaw";
const enabled =
  process.env.RUN_OPENCLAW_PROBE === "1" && process.platform === "darwin";
const input = {
  instructions: "Use saved facts only",
  data: '{"price":500}',
  maxOutputTokens: 1800 as const,
};
it("cannot generate without successful runtime verification", async () => {
  const provider = vi.fn();
  const runtime = createOpenClawRuntime(
    {
      stateDir: "/not-configured",
      installRoot: "/not-configured",
      nodePath: "/not-configured",
    },
    provider,
  );
  await expect(
    runtime.generate(input, new AbortController().signal),
  ).rejects.toThrow();
  expect(provider).not.toHaveBeenCalled();
  await runtime.close();
});
it.skipIf(!enabled)(
  "preflights the actual home/read, outside-write and network guards then drafts once without retained run state",
  async () => {
    const stateDir = await mkdtemp(join(process.cwd(), ".worker-test-"));
    const provider = vi.fn(async () => ({
      body: "The saved price is ₱500.",
      reviewReason: "Synthetic check.",
    }));
    const runtime = createOpenClawRuntime(
      {
        stateDir,
        installRoot: "/opt/homebrew/lib/node_modules/openclaw",
        nodePath: "/opt/homebrew/bin/node",
      },
      provider,
    );
    try {
      expect(await runtime.verifyRuntime()).toBe(true);
      expect(
        await runtime.generate(input, new AbortController().signal),
      ).toEqual({
        body: "The saved price is ₱500.",
        reviewReason: "Synthetic check.",
      });
      expect(provider).toHaveBeenCalledTimes(1);
      await expect(
        runtime.generate(input, new AbortController().signal),
      ).rejects.toThrow();
      expect(provider).toHaveBeenCalledTimes(1);
      await runtime.close();
      expect(await readdir(stateDir)).toEqual([]);
    } finally {
      await runtime.close();
      await rm(stateDir, { recursive: true, force: true });
    }
  },
  30000,
);
it.skipIf(!enabled)(
  "cancels in-flight generation and drains its process and private run state before close resolves",
  async () => {
    const stateDir = await mkdtemp(join(process.cwd(), ".worker-test-"));
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const provider = vi.fn(async (_input: unknown, signal: AbortSignal) => {
      started();
      return await new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("Canceled")), {
          once: true,
        });
      });
    });
    const runtime = createOpenClawRuntime(
      {
        stateDir,
        installRoot: "/opt/homebrew/lib/node_modules/openclaw",
        nodePath: "/opt/homebrew/bin/node",
      },
      provider,
    );
    try {
      expect(await runtime.verifyRuntime()).toBe(true);
      const pending = runtime.generate(input, new AbortController().signal);
      const rejected = expect(pending).rejects.toThrow();
      await entered;
      await runtime.close();
      await rejected;
      expect(provider).toHaveBeenCalledTimes(1);
      expect(await readdir(stateDir)).toEqual([]);
      expect(await runtime.verifyRuntime()).toBe(false);
    } finally {
      await runtime.close();
      await rm(stateDir, { recursive: true, force: true });
    }
  },
  30000,
);
