import { setTimeout as delay } from "node:timers/promises";
import {
  createWorkerTransport,
  runDraftJob,
} from "../lib/automation/draft-worker";
import { createOpenAIDraftProvider } from "../lib/automation/draft-provider";
import { createOpenClawRuntime } from "./openclaw";
import { acquireWorkerLock, readWorkerConfig, runtimeOptions } from "./config";
import { runWorkerLoop } from "./runner";
async function main() {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !["check", "once", "watch"].includes(mode))
    throw new Error("Invalid command");
  const options = runtimeOptions(process.env);
  // Validate service settings before taking a lock, without logging any values.
  const config = mode === "check" ? undefined : readWorkerConfig(process.env);
  const release = await acquireWorkerLock(options.stateDir);
  const stop = new AbortController();
  let current: ReturnType<typeof createOpenClawRuntime> | undefined;
  const shutdown = () => {
    stop.abort();
    void current?.close().catch(() => {});
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  try {
    if (mode === "check") {
      current = createOpenClawRuntime(options, async () => {
        throw new Error("Preflight cannot infer");
      });
      if (!(await current.verifyRuntime())) throw new Error("Preflight failed");
      console.log(
        "Runtime preflight passed. No cloud connection or model request was made.",
      );
      return;
    }
    const transport = createWorkerTransport(
      config!.projectUrl,
      config!.publicKey,
      config!.token,
    );
    const provider = createOpenAIDraftProvider(config!.apiKey, config!.model);
    const status = await runWorkerLoop({
      watch: mode === "watch",
      signal: stop.signal,
      job: () => {
        const runtime = createOpenClawRuntime(options, provider);
        current = runtime;
        return {
          run: () =>
            runDraftJob((command) => {
              if (stop.signal.aborted && command.op !== "fail")
                return Promise.reject(new Error("Stopped"));
              return transport(command);
            }, runtime),
          close: () => runtime.close(),
        };
      },
      wait: async () => {
        try {
          await delay(15000, undefined, { signal: stop.signal });
        } catch {
          if (!stop.signal.aborted) throw new Error("Wait failed");
        }
      },
      report: (outcome) => {
        if (outcome.status === "completed")
          console.log("A Draft reply was saved for review. Nothing was sent.");
        else if (outcome.status !== "idle")
          console.log(
            "Worker stopped: " +
              outcome.status +
              ". Inspect the saved queue before retrying.",
          );
        else if (mode === "once")
          console.log("No draft was claimed in this pass.");
      },
    });
    if (!["idle", "completed", "stopped"].includes(status))
      process.exitCode = 1;
  } finally {
    try {
      await current?.close();
    } finally {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      await release();
    }
  }
}
void main().catch(() => {
  console.error(
    "Worker could not finish safely. Check configuration, runtime compatibility and the saved queue. No automatic retry. See docs/mac-draft-worker.md.",
  );
  process.exitCode = 1;
});
