import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

// Exercise the compiled CLI and OS signals, not a reconstructed main function.
// Only fetch is replaced. It cannot reach Supabase or a model; the isolated
// environment contains dummy values and no installed-agent/account credentials.
describe.skipIf(process.platform === "win32")("worker CLI lifecycle", () => {
  beforeAll(async () => {
    await promisify(execFile)(
      process.execPath,
      ["node_modules/typescript/bin/tsc", "-p", "tsconfig.worker.json"],
      { cwd: process.cwd(), timeout: 30000 },
    );
  }, 35000);

  async function fixture(holdClaim = false) {
    const directory = await realpath(
      await mkdtemp(join(tmpdir(), "reseller-cli-")),
    );
    const preload = join(directory, "synthetic-fetch.cjs");
    const journal = join(directory, "requests.jsonl");
    const release = join(directory, "release-claim");
    await writeFile(journal, "", { mode: 0o600 });
    await writeFile(
      preload,
      `const fs = require('node:fs');
const {setTimeout: delay} = require('node:timers/promises');
const record = event => fs.appendFileSync(${JSON.stringify(journal)}, JSON.stringify(event)+'\\n');
${holdClaim ? `process.on('SIGINT',()=>record({signal:'SIGINT'}));` : ""}
globalThis.fetch = async (url, init) => {
  if (url !== 'https://synthetic.supabase.co/rest/v1/rpc/draft_worker') {
    record({unexpectedNetwork:true}); throw Error('Synthetic network denied');
  }
  const {command} = JSON.parse(init.body);
  record({op:command.op});
  if (command.op !== 'claim') throw Error('Only an empty synthetic queue is permitted');
  ${holdClaim ? `while(!fs.existsSync(${JSON.stringify(release)})) await delay(10,undefined,{signal:init.signal});` : ""}
  record({claimReturned:true});
  return Response.json(null);
};`,
      { mode: 0o600 },
    );
    type RunningWorker = {
      child: ReturnType<typeof spawn>;
      closed: Promise<{ code: number | null; signal: string | null }>;
      output: () => string;
    };
    const launched: RunningWorker[] = [];
    function start(mode: "once" | "watch" = "watch"): RunningWorker {
      const child = spawn(
        process.execPath,
        ["--require", preload, resolve(".worker-build/worker/main.js"), mode],
        {
          cwd: process.cwd(),
          env: {
            PATH: process.env.PATH,
            NODE_ENV: "test",
            HOME: directory,
            RESELLER_WORKER_STATE_DIR: directory,
            RESELLER_OPENCLAW_PATH: join(directory, "absent-install"),
            RESELLER_OPENCLAW_NODE: process.execPath,
            RESELLER_SUPABASE_URL: "https://synthetic.supabase.co",
            RESELLER_SUPABASE_PUBLIC_KEY: "sb_publishable_synthetic",
            RESELLER_WORKER_TOKEN: "a".repeat(64),
            OPENAI_API_KEY: "synthetic-parent-key",
            OPENAI_MODEL: "synthetic-model",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
      const closed = new Promise<{
        code: number | null;
        signal: string | null;
      }>((done, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => done({ code, signal }));
      });
      // Keep the promise handled even when an earlier assertion fails.
      void closed.catch(() => {});
      const worker = { child, closed, output: () => output };
      launched.push(worker);
      return worker;
    }
    const events = async () =>
      (await readFile(journal, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    return {
      directory,
      start,
      events,
      releaseClaim: () =>
        writeFile(release, "synthetic release", { mode: 0o600 }),
      cleanup: async () => {
        for (const worker of launched) {
          if (
            worker.child.exitCode === null &&
            worker.child.signalCode === null
          )
            worker.child.kill("SIGKILL");
          await worker.closed;
        }
        await rm(directory, { recursive: true, force: true });
      },
    };
  }

  async function bounded<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(Error("CLI did not exit promptly")),
            3000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer!);
    }
  }

  it("SIGTERM stops an idle watcher, releases its lock and permits a clean once restart", async () => {
    const f = await fixture();
    try {
      const worker = f.start();
      await expect
        .poll(f.events)
        .toEqual([{ op: "claim" }, { claimReturned: true }]);
      expect(worker.child.kill("SIGTERM")).toBe(true);
      expect(await bounded(worker.closed)).toEqual({ code: 0, signal: null });
      await expect(
        stat(join(f.directory, "worker.lock")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      const restarted = f.start("once");
      expect(await bounded(restarted.closed)).toEqual({
        code: 0,
        signal: null,
      });
      expect(restarted.output()).toContain("No draft was claimed");
      expect(await f.events()).toEqual([
        { op: "claim" },
        { claimReturned: true },
        { op: "claim" },
        { claimReturned: true },
      ]);
      expect(worker.output() + restarted.output()).not.toContain(
        "synthetic-parent-key",
      );
    } finally {
      await f.cleanup();
    }
  });

  it("SIGINT during a pending claim drains that request and exits without another poll", async () => {
    const f = await fixture(true);
    try {
      const worker = f.start();
      await expect.poll(f.events).toEqual([{ op: "claim" }]);
      expect(worker.child.kill("SIGINT")).toBe(true);
      await expect
        .poll(f.events)
        .toEqual([{ op: "claim" }, { signal: "SIGINT" }]);
      await f.releaseClaim();
      expect(await bounded(worker.closed)).toEqual({ code: 0, signal: null });
      expect(await f.events()).toEqual([
        { op: "claim" },
        { signal: "SIGINT" },
        { claimReturned: true },
      ]);
      await expect(
        stat(join(f.directory, "worker.lock")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await f.cleanup();
    }
  });

  it("SIGKILL leaves its exact lock intact and restart fails before any request", async () => {
    const f = await fixture();
    try {
      const worker = f.start();
      await expect
        .poll(f.events)
        .toEqual([{ op: "claim" }, { claimReturned: true }]);
      const lock = join(f.directory, "worker.lock");
      const before = await readFile(join(lock, "owner.json"), "utf8");
      expect(JSON.parse(before).pid).toBe(worker.child.pid);
      expect(worker.child.kill("SIGKILL")).toBe(true);
      expect(await bounded(worker.closed)).toEqual({
        code: null,
        signal: "SIGKILL",
      });
      const restarted = f.start("once");
      expect(await bounded(restarted.closed)).toEqual({
        code: 1,
        signal: null,
      });
      expect(restarted.output()).toContain("Worker could not finish safely");
      expect(await readFile(join(lock, "owner.json"), "utf8")).toBe(before);
      expect(await f.events()).toEqual([
        { op: "claim" },
        { claimReturned: true },
      ]);
      // Only this fixture's processes were launched; both close handles are
      // terminal. This explicit test cleanup is not stale-lock eviction logic.
    } finally {
      await f.cleanup();
    }
  });
});
