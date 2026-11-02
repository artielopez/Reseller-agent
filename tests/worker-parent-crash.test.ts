import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

describe.skipIf(process.platform === "win32")(
  "active worker parent loss",
  () => {
    beforeAll(async () => {
      await promisify(execFile)(
        process.execPath,
        ["node_modules/typescript/bin/tsc", "-p", "tsconfig.worker.json"],
        { timeout: 30000 },
      );
    }, 35000);

    it("reaps the owned subprocess group after the worker is killed during active work", async () => {
      const directory = await mkdtemp(join(tmpdir(), "reseller-parent-loss-"));
      const ready = join(directory, "ready.json");
      const parentFile = join(directory, "parent.cjs");
      const target = `
      const {spawn}=require('node:child_process');
      const fs=require('node:fs');
      process.on('SIGTERM',()=>{});
      const child=spawn(process.execPath,['-e',
        "process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)"
      ],{stdio:['ignore','ignore','ignore','ipc']});
      child.once('message',()=>fs.writeFileSync(${JSON.stringify(ready)},
        JSON.stringify({leader:process.pid,descendant:child.pid,supervisor:process.ppid}),{mode:0o600}));
      setInterval(()=>{},1000);
    `;
      await writeFile(
        parentFile,
        `
      const {runProcess}=require(${JSON.stringify(resolve(".worker-build/worker/process.js"))});
      runProcess(process.execPath,['-e',${JSON.stringify(target)}],{
        cwd:${JSON.stringify(directory)},env:{},
        signal:new AbortController().signal,timeoutMs:30000
      }).catch(()=>{process.exitCode=1});
    `,
        { mode: 0o600 },
      );
      const parent = spawn(process.execPath, [parentFile], {
        env: { NODE_ENV: "test" },
        stdio: "ignore",
      });
      const exited = new Promise<void>((done, reject) => {
        parent.once("error", reject);
        parent.once("close", () => done());
      });
      void exited.catch(() => {});
      let pids:
        { leader: number; descendant: number; supervisor: number } | undefined;
      const alive = (pid: number) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
          throw error;
        }
      };
      try {
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
        expect(alive(pids!.leader)).toBe(true);
        expect(alive(pids!.descendant)).toBe(true);
        expect(parent.kill("SIGKILL")).toBe(true);
        await exited;
        await expect
          .poll(() => [alive(pids!.leader), alive(pids!.descendant)], {
            timeout: 3000,
          })
          .toEqual([false, false]);
        expect(pids!.supervisor).not.toBe(parent.pid);
        await expect.poll(() => alive(pids!.supervisor)).toBe(false);
      } finally {
        if (parent.exitCode === null && parent.signalCode === null)
          parent.kill("SIGKILL");
        await exited;
        // Only this test's detached process group, never the owner's services.
        if (pids && (alive(pids.leader) || alive(pids.descendant))) {
          try {
            process.kill(-pids.leader, "SIGKILL");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          }
        }
        if (pids && pids.supervisor !== parent.pid && alive(pids.supervisor))
          process.kill(pids.supervisor, "SIGKILL");
        await rm(directory, { recursive: true, force: true });
      }
    }, 12000);
  },
);
