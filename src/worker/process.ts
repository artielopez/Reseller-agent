import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { processSupervisorSource } from "./process-supervisor";
export type ProcessResult = { code: number; stdout: string; stderr: string };
const failure = () => new Error("Worker process could not finish safely.");

/** A separate supervisor owns the target group. IPC loss aborts it even if
 * this worker is SIGKILLed, so its deadline/cleanup outlive the worker. */
export async function runProcess(
  executable: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    signal: AbortSignal;
    timeoutMs: number;
    input?: string;
  },
): Promise<ProcessResult> {
  if (
    process.platform === "win32" ||
    options.signal.aborted ||
    !Number.isFinite(options.timeoutMs) ||
    options.timeoutMs <= 0
  )
    throw failure();

  // No input, credentials, inherited NODE_OPTIONS or environment on argv.
  // The child gets the caller's explicit environment over the private pipe.
  const supervisor = spawn(process.execPath, ["-e", processSupervisorSource], {
    env: { NODE_ENV: "production" },
    detached: true,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  let result: ProcessResult | undefined;
  let failed = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const signalGroup = (signal: NodeJS.Signals) => {
    if (!supervisor.pid) return;
    try {
      process.kill(-supervisor.pid, signal);
    } catch (error) {
      if (
        !["ESRCH", "EPERM"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        failed = true;
    }
  };
  const terminate = () => {
    signalGroup("SIGTERM");
    killTimer ??= setTimeout(() => signalGroup("SIGKILL"), 200);
  };
  const abort = () => {
    failed = true;
    terminate();
  };
  options.signal.addEventListener("abort", abort, { once: true });
  try {
    await new Promise<void>((resolve) => {
      supervisor.once("error", () => {
        failed = true;
        resolve();
      });
      supervisor.once("close", (code) => {
        if (code !== 0 && !result) failed = true;
        resolve();
      });
      supervisor.on("message", (raw: unknown) => {
        const value = raw as Partial<ProcessResult> | null;
        if (
          !value ||
          !Number.isInteger(value.code) ||
          typeof value.stdout !== "string" ||
          typeof value.stderr !== "string" ||
          Buffer.byteLength(value.stdout) + Buffer.byteLength(value.stderr) >
            262144 ||
          result
        ) {
          abort();
          return;
        }
        result = value as ProcessResult;
        terminate();
      });
      supervisor.once("spawn", () => {
        if (options.signal.aborted) {
          abort();
          return;
        }
        supervisor.send(
          {
            type: "run",
            executable,
            args,
            cwd: options.cwd,
            env: options.env,
            timeoutMs: options.timeoutMs,
            input: options.input ?? "",
          },
          (error) => {
            if (error) abort();
          },
        );
      });
      if (options.signal.aborted) abort();
    });
    // The supervisor is the group anchor, known before any target can start.
    // Its crash cannot strand an unknown target group behind a completed call.
    signalGroup("SIGKILL");
    if (supervisor.pid) {
      let alive = true;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          process.kill(-supervisor.pid, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") {
            alive = false;
            break;
          }
          if ((error as NodeJS.ErrnoException).code !== "EPERM") break;
        }
        await delay(50);
      }
      if (alive) failed = true;
    }
    if (failed || options.signal.aborted || !result) throw failure();
    return result;
  } finally {
    if (killTimer) clearTimeout(killTimer);
    options.signal.removeEventListener("abort", abort);
  }
}
