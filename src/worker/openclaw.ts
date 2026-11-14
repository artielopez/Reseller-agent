import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { DraftDependencies } from "../lib/automation/drafting";
import { draftOutputSchema } from "../lib/automation/drafting";
import {
  startDraftGateway,
  type DraftGenerator,
} from "../lib/automation/draft-gateway";
import { runProcess } from "./process";
export type RuntimeOptions = {
  stateDir: string;
  installRoot: string;
  nodePath: string;
};
const failure = () =>
  new Error("Restricted runtime verification or execution failed.");
const launchers = [
  "openclaw.mjs",
  "node-runtime-recovery.mjs",
  "node-compile-cache.mjs",
  "node-host-launcher.mjs",
  "node-version.mjs",
  "cli-root-options.mjs",
  "gateway-run-argv.mjs",
  "gateway-shutdown-budget.mjs",
  "node-sqlite.mjs",
  "package.json",
];

export async function privateStateDirectory(path: string) {
  if (!path.startsWith("/")) throw failure();
  await mkdir(path, { recursive: true, mode: 0o700 });
  const canonical = await realpath(path);
  const info = await stat(path);
  if (
    canonical !== resolve(path) ||
    !info.isDirectory() ||
    info.uid !== process.getuid?.() ||
    (info.mode & 0o077) !== 0
  )
    throw failure();
  return canonical;
}
function policy(
  root: string,
  installation: string,
  node: string,
  port: number,
) {
  const literal = (p: string) => `(literal ${JSON.stringify(p)})`;
  const subpath = (p: string) => `(subpath ${JSON.stringify(p)})`;
  const directories = [
    "/System/Cryptexes/OS",
    "/System/Volumes/Preboot/Cryptexes/OS",
    "/System/Library",
    "/usr",
    "/bin",
    "/sbin",
    "/dev",
    "/opt/homebrew/Cellar",
    "/opt/homebrew/lib",
    root,
    ...["dist", "node_modules", "packages"].map((p) => join(installation, p)),
  ];
  const files = [
    node,
    "/private/etc/localtime",
    "/private/etc/hosts",
    "/private/etc/resolv.conf",
    "/private/etc/services",
    "/private/etc/protocols",
    ...launchers.map((p) => join(installation, p)),
  ];
  const ancestors = new Set<string>(["/"]);
  for (const path of [...directories, ...files])
    for (let parent = dirname(path); parent !== "/"; parent = dirname(parent))
      ancestors.add(parent);
  return [
    `(version 1)`,
    `(allow default)`,
    `(deny network*)`,
    `(deny file-read* file-write* (subpath "/"))`,
    `(allow file-read* ${directories.map(subpath).join(" ")} ${files.map(literal).join(" ")})`,
    `(allow file-read-metadata)`,
    `(allow file-read* ${[...ancestors]
      .filter(
        (p) => p.startsWith("/System") || p.startsWith("/opt") || p === "/",
      )
      .map(literal)
      .join(" ")})`,
    `(allow file-write* ${subpath(root)} (literal "/dev/null"))`,
    `(allow network-outbound (remote ip "localhost:${port}"))`,
  ].join("\n");
}
async function scratch(
  installation: string,
  node: string,
  baseUrl: string,
  token: string,
) {
  const root = await mkdtemp("/private/tmp/reseller-draft-run-");
  try {
    for (const part of ["state", "workspace", "tmp"])
      await mkdir(join(root, part), { mode: 0o700 });
    const config = {
      env: { shellEnv: { enabled: false } },
      agents: {
        defaults: {
          workspace: join(root, "workspace"),
          skipBootstrap: true,
          contextInjection: "never",
          skills: [],
          startupContext: { enabled: false },
          model: "reseller/reseller-draft",
          compaction: { enabled: false, memoryFlush: { enabled: false } },
        },
        entries: { main: { skills: [] } },
      },
      tools: { profile: "minimal", deny: ["*"] },
      plugins: { enabled: false },
      channels: {},
      cron: { enabled: false },
      hooks: { internal: { enabled: false } },
      models: {
        mode: "replace",
        providers: {
          reseller: {
            baseUrl,
            api: "openai-completions",
            apiKey: token,
            agentRuntime: { id: "openclaw" },
            timeoutSeconds: 20,
            models: [
              {
                id: "reseller-draft",
                name: "Restricted draft model",
                reasoning: false,
                input: ["text"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 32000,
                maxTokens: 1800,
              },
            ],
          },
        },
      },
    };
    await writeFile(join(root, "openclaw.json"), JSON.stringify(config), {
      mode: 0o600,
    });
    await writeFile(
      join(root, "isolation.sb"),
      policy(root, installation, node, Number(new URL(baseUrl).port)),
      { mode: 0o600 },
    );
    return root;
  } catch {
    await rm(root, { recursive: true, force: true });
    throw failure();
  }
}
function environment(root: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    OPENSSL_CONF: "/dev/null",
    PATH: "/opt/homebrew/bin:/usr/bin:/bin",
    TMPDIR: join(root, "tmp"),
    OPENCLAW_STATE_DIR: join(root, "state"),
    OPENCLAW_CONFIG_PATH: join(root, "openclaw.json"),
    OPENCLAW_CONFIG_READONLY: "1",
    NODE_DISABLE_COMPILE_CACHE: "1",
  };
}
async function localControl() {
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    res.end("synthetic-control");
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw failure();
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests: () => requests,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}
/** Foreground, draft-only runtime. Keys and saved input never enter its process.
 * close() must be awaited even after an upstream deadline rejects generation. */
export function createOpenClawRuntime(
  options: RuntimeOptions,
  provider: DraftGenerator,
): Pick<DraftDependencies, "verifyRuntime" | "generate"> & {
  close: () => Promise<void>;
} {
  const lifetime = new AbortController();
  let verified = false,
    closed = false;
  let installation = "",
    node = "";
  let active: Promise<unknown> | undefined;
  async function preflight() {
    verified = false;
    let root: string | undefined,
      canary: string | undefined,
      outside: string | undefined;
    const controls: Awaited<ReturnType<typeof localControl>>[] = [];
    try {
      if (process.platform !== "darwin" || closed) return false;
      const state = await privateStateDirectory(options.stateDir);
      installation = await realpath(options.installRoot);
      node = await realpath(options.nodePath);
      // State must be in the denied home tree, outside every public code exception.
      if (
        !state.startsWith(homedir() + "/") ||
        state === installation ||
        state.startsWith(installation + "/")
      )
        throw failure();
      const metadata = JSON.parse(
        await readFile(join(installation, "package.json"), "utf8"),
      );
      if (metadata.name !== "openclaw" || metadata.version !== "2026.9.6")
        throw failure();
      controls.push(await localControl());
      controls.push(await localControl());
      root = await scratch(
        installation,
        node,
        controls[0].url + "/v1",
        "synthetic-preflight",
      );
      canary = join(state, `read-canary-${randomUUID()}`);
      outside = `/private/tmp/reseller-write-canary-${randomUUID()}`;
      await writeFile(canary, "synthetic-denied", { mode: 0o600 });
      const guard = `const fs=require('node:fs');(async()=>{
        function denied(fn){try{fn();process.exit(41)}catch(e){if(!['EPERM','EACCES'].includes(e.code))process.exit(42)}}
        denied(()=>fs.readFileSync(${JSON.stringify(canary)}));
        denied(()=>fs.writeFileSync(${JSON.stringify(outside)},'forbidden'));
        denied(()=>fs.writeFileSync(${JSON.stringify(canary)},'forbidden'));
        fs.writeFileSync('allowed','synthetic');if(fs.readFileSync('allowed','utf8')!=='synthetic')process.exit(43);
        if(process.env.OPENAI_API_KEY||process.env.RESELLER_WORKER_TOKEN)process.exit(44);
        if(await(await fetch(${JSON.stringify(controls[0].url)},{signal:AbortSignal.timeout(1500)})).text()!=='synthetic-control')process.exit(45);
        try{await fetch(${JSON.stringify(controls[1].url)},{signal:AbortSignal.timeout(1500)});process.exit(46)}catch(e){if(!['EPERM','EACCES'].includes(e.cause?.code))process.exit(47)}
      })().catch(()=>process.exit(48));`;
      const invoke = (args: string[]) =>
        runProcess(
          "/usr/bin/sandbox-exec",
          ["-f", join(root!, "isolation.sb"), node, ...args],
          {
            cwd: join(root!, "workspace"),
            env: environment(root!),
            signal: lifetime.signal,
            timeoutMs: 12000,
          },
        );
      const guardResult = await invoke(["-e", guard]);
      if (
        guardResult.code !== 0 ||
        controls[0].requests() !== 1 ||
        controls[1].requests() !== 0
      )
        throw failure();
      const validation = await invoke([
        join(installation, "openclaw.mjs"),
        "config",
        "validate",
        "--json",
      ]);
      if (validation.code !== 0 || JSON.parse(validation.stdout).valid !== true)
        throw failure();
      verified = !closed;
      return verified;
    } catch {
      return false;
    } finally {
      for (const control of controls) await control.close();
      if (canary) await rm(canary, { force: true });
      if (outside) await rm(outside, { force: true });
      if (root) await rm(root, { recursive: true, force: true });
    }
  }
  async function generate(
    input: Parameters<DraftGenerator>[0],
    signal: AbortSignal,
  ) {
    let root: string | undefined;
    const combined = AbortSignal.any([signal, lifetime.signal]);
    const gateway = await startDraftGateway(input, provider, combined);
    try {
      root = await scratch(installation, node, gateway.baseUrl, gateway.token);
      const result = await runProcess(
        "/usr/bin/sandbox-exec",
        [
          "-f",
          join(root, "isolation.sb"),
          node,
          join(installation, "openclaw.mjs"),
          "agent",
          "exec",
          "--config",
          join(root, "openclaw.json"),
          "--cwd",
          join(root, "workspace"),
          "--message-file",
          "-",
          "--json",
          "--timeout",
          "21",
          "--thinking",
          "off",
          "--model",
          "reseller/reseller-draft",
        ],
        {
          cwd: join(root, "workspace"),
          env: environment(root),
          signal: combined,
          timeoutMs: 23000,
          input:
            "Request the configured draft model once. No tools or sending.",
        },
      );
      const envelope = JSON.parse(result.stdout);
      const output = draftOutputSchema.parse(JSON.parse(envelope.final));
      if (
        result.code !== 0 ||
        envelope.ok !== true ||
        envelope.status !== "ok" ||
        envelope.assistantTurns !== 1 ||
        (envelope.toolSummary?.calls ?? 0) !== 0 ||
        JSON.stringify(output) !== JSON.stringify(gateway.result())
      )
        throw failure();
      if (
        (await readdir(join(root, "tmp"))).some((name) =>
          name.startsWith("openclaw-agent-exec-"),
        )
      )
        throw failure();
      return output;
    } finally {
      await gateway.close();
      if (root) await rm(root, { recursive: true, force: true });
    }
  }
  function track<T>(task: () => Promise<T>): Promise<T> {
    const result = task();
    active = result;
    void result
      .finally(() => {
        if (active === result) active = undefined;
      })
      .catch(() => {});
    return result;
  }
  return {
    verifyRuntime: () =>
      active || closed ? Promise.resolve(false) : track(preflight),
    generate: (input, signal) => {
      if (!verified || active || closed) return Promise.reject(failure());
      verified = false;
      return track(() => generate(input, signal));
    },
    close: async () => {
      closed = true;
      verified = false;
      lifetime.abort();
      try {
        await active;
      } catch {
        /* Already rejected to caller. */
      }
    },
  };
}
