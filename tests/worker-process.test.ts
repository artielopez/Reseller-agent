import { expect, it } from "vitest";
import { runProcess } from "../src/worker/process";
const options = () => ({
  cwd: process.cwd(),
  env: { NODE_ENV: "test" as const, PATH: process.env.PATH },
  signal: new AbortController().signal,
  timeoutMs: 2000,
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
