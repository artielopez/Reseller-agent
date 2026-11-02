import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runProcess } from "../src/worker/process";
const options = () => ({
  cwd: process.cwd(),
  env: { NODE_ENV: "test" as const, PATH: process.env.PATH },
  signal: new AbortController().signal,
  timeoutMs: 2000,
});
it("preserves private stdin, explicit environment and nonzero target exit through supervision", async () => {
  const result = await runProcess(
    process.execPath,
    [
      "-e",
      "let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{process.stdout.write(input+'|'+process.env.ONLY_TARGET);process.exitCode=7})",
    ],
    {
      ...options(),
      env: { NODE_ENV: "test", ONLY_TARGET: "synthetic" },
      input: "₱ synthetic input",
    },
  );
  expect(result).toEqual({
    code: 7,
    stdout: "₱ synthetic input|synthetic",
    stderr: "",
  });
});
it("rejects a missing executable without leaving a pending supervised request", async () => {
  await expect(
    runProcess("/nonexistent/reseller-synthetic-executable", [], options()),
  ).rejects.toThrow("Worker process could not finish safely.");
});
it("captures bounded output without a shell or inherited secrets", async () => {
  const r = await runProcess(
    process.execPath,
    [
      "-e",
      "process.stdout.write(process.env.SYNTHETIC_PRIVATE??'clean');process.stderr.write('diagnostic')",
    ],
    options(),
  );
  expect(r).toEqual({ code: 0, stdout: "clean", stderr: "diagnostic" });
});
it("fails closed for canceled starts, oversized output and timeout", async () => {
  const c = new AbortController();
  c.abort();
  await expect(
    runProcess(
      process.execPath,
      ["-e", "process.stdout.write('should not run')"],
      { ...options(), signal: c.signal },
    ),
  ).rejects.toThrow("Worker process");
  await expect(
    runProcess(
      process.execPath,
      ["-e", "process.stdout.write('x'.repeat(300000))"],
      options(),
    ),
  ).rejects.toThrow("Worker process");
  await expect(
    runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      ...options(),
      timeoutMs: 100,
    }),
  ).rejects.toThrow("Worker process");
});
it("kills a spawned descendant when its group leader exits", async () => {
  const r = await runProcess(
    process.execPath,
    [
      "-e",
      `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});process.stdout.write(String(c.pid));c.unref();`,
    ],
    options(),
  );
  const pid = Number(r.stdout);
  expect(pid).toBeGreaterThan(0);
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ESRCH") alive = false;
  }
  expect(alive).toBe(false);
});
it("preserves UTF-8 characters split across output chunks", async () => {
  const r = await runProcess(
    process.execPath,
    [
      "-e",
      `const b=Buffer.from('₱');process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.write(b.subarray(1)),20);`,
    ],
    options(),
  );
  expect(r.stdout).toBe("₱");
});

it("abort kills an active leader and descendant even when both ignore SIGTERM", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reseller-process-abort-"));
  const ready = join(directory, "ready.json");
  const controller = new AbortController();
  const task = runProcess(
    process.execPath,
    [
      "-e",
      `
      const {spawn}=require('node:child_process');
      const fs=require('node:fs');
      process.on('SIGTERM',()=>{});
      const child=spawn(process.execPath,['-e',
        "process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000);"
      ],{stdio:['ignore','ignore','ignore','ipc']});
      child.once('message',()=>fs.writeFileSync(${JSON.stringify(ready)},
        JSON.stringify({leader:process.pid,descendant:child.pid}),{mode:0o600}));
      setInterval(()=>{},1000);
    `,
    ],
    { ...options(), timeoutMs: 5000, signal: controller.signal },
  );
  // Attach a rejection handler before aborting to avoid an unhandled rejection.
  const outcome = task.then(
    () => "unexpected success",
    (error: Error) => error.message,
  );
  try {
    let pids: { leader: number; descendant: number } | undefined;
    await expect
      .poll(async () => {
        try {
          pids = JSON.parse(await readFile(ready, "utf8"));
          return true;
        } catch {
          return false;
        }
      })
      .toBe(true);
    controller.abort();
    expect(await outcome).toBe("Worker process could not finish safely.");
    for (const pid of [pids!.leader, pids!.descendant]) {
      expect(pid).toBeGreaterThan(0);
      expect(() => process.kill(pid, 0)).toThrowError(
        expect.objectContaining({ code: "ESRCH" }),
      );
    }
  } finally {
    controller.abort();
    await outcome;
    await rm(directory, { recursive: true, force: true });
  }
});
