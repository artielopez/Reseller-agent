import { StringDecoder } from "node:string_decoder";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
export type ProcessResult = { code: number; stdout: string; stderr: string };
const failure = () => new Error("Worker process could not finish safely.");
/** POSIX owned-process-group execution. Never inherits env or invokes a shell. */
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
    options.timeoutMs <= 0
  )
    throw failure();
  const child = spawn(executable, args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let failed = false,
    stdout = "",
    stderr = "",
    size = 0;
  const outDecoder = new StringDecoder("utf8"),
    errDecoder = new StringDecoder("utf8");
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const signalGroup = (signal: NodeJS.Signals) => {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, signal);
    } catch (e) {
      if (!["ESRCH", "EPERM"].includes((e as NodeJS.ErrnoException).code ?? ""))
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
  const timer = setTimeout(abort, options.timeoutMs);
  options.signal.addEventListener("abort", abort, { once: true });
  child.stdout.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > 262144) abort();
    else stdout += outDecoder.write(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > 262144) abort();
    else stderr += errDecoder.write(chunk);
  });
  child.stdin.on("error", abort);
  child.once("exit", terminate); // Reap descendants even after a successful leader exit.
  let code: number | null;
  try {
    code = await new Promise<number | null>((resolve) => {
      child.once("error", () => {
        failed = true;
        resolve(null);
      });
      child.once("close", resolve);
      if (options.signal.aborted) abort();
      child.stdin.end(options.input ?? "");
    });
    signalGroup("SIGKILL");
    if (child.pid) {
      let alive = true;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          process.kill(-child.pid, 0);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ESRCH") {
            alive = false;
            break;
          } else if ((e as NodeJS.ErrnoException).code !== "EPERM") break;
        }
        await delay(50);
      }
      if (alive) failed = true;
    }
    if (failed || code === null) throw failure();
    return {
      code,
      stdout: stdout + outDecoder.end(),
      stderr: stderr + errDecoder.end(),
    };
  } finally {
    clearTimeout(timer);
    if (killTimer) clearTimeout(killTimer);
    options.signal.removeEventListener("abort", abort);
  }
}
