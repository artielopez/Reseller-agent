import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Server } from "node:http";
import { expect, it, vi } from "vitest";
const controls = vi.hoisted(() => ({ servers: [] as Server[] }));
vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    createServer: (...args: Parameters<typeof actual.createServer>) => {
      const server = actual.createServer(...args);
      controls.servers.push(server);
      if (controls.servers.length === 2)
        vi.spyOn(server, "listen").mockImplementation(() => {
          queueMicrotask(() =>
            server.emit(
              "error",
              Object.assign(new Error("Synthetic bind failure"), {
                code: "EADDRINUSE",
              }),
            ),
          );
          return server;
        });
      return server;
    },
  };
});
import { createOpenClawRuntime } from "../src/worker/openclaw";
const enabled =
  process.env.RUN_OPENCLAW_PROBE === "1" && process.platform === "darwin";
it.skipIf(!enabled)(
  "closes the first preflight listener if creating the second fails",
  async () => {
    const stateDir = await mkdtemp(join(process.cwd(), ".worker-test-"));
    const provider = vi.fn();
    const runtime = createOpenClawRuntime(
      {
        stateDir,
        installRoot: "/opt/homebrew/lib/node_modules/openclaw",
        nodePath: "/opt/homebrew/bin/node",
      },
      provider,
    );
    try {
      expect(await runtime.verifyRuntime()).toBe(false);
      await runtime.close();
      expect(controls.servers).toHaveLength(2);
      expect(controls.servers[0].listening).toBe(false);
      expect(provider).not.toHaveBeenCalled();
    } finally {
      await runtime.close();
      // Test-owned fallback cleanup lets a failing regression terminate normally.
      for (const server of controls.servers) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      await rm(stateDir, { recursive: true, force: true });
    }
  },
);
