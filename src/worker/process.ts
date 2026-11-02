import { spawn } from "node:child_process";
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
  const abort = () => {
    failed = true;
    if (supervisor.connected) supervisor.send({ type: "abort" }, () => {});
  };
  options.signal.addEventListener("abort", abort, { once: true });
  try {
    await new Promise<void>((resolve) => {
      supervisor.once("error", () => {
        failed = true;
        resolve();
      });
      supervisor.once("close", (code) => {
        if (code !== 0) failed = true;
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
    if (failed || options.signal.aborted || !result) throw failure();
    return result;
  } finally {
    options.signal.removeEventListener("abort", abort);
  }
}
