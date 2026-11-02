import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import {
  draftInputSchema,
  draftOutputSchema,
  type DraftInput,
} from "../lib/automation/drafting";
import { runProcess } from "./process";

export type SubscriptionBrokerOptions = {
  installRoot: string;
  nodePath: string;
  pluginPath: string;
  profileId: string;
  /** Exact synthetic acceptance payload; no arbitrary inbox processing yet. */
  inputSha256: string;
  /** Operator-observed allowance, zero credits and auto-reload off.
   * Short-lived attestation, not a provider spending-limit API. */
  verifiedUntil: number;
};
const failure = () =>
  new Error("Subscription broker unavailable. No fallback was attempted.");
const checkResult = z
  .object({
    ok: z.literal(true),
    hostCompatible: z.literal(true),
    inferenceEnabled: z.literal(false),
    model: z.literal("openai/gpt-6-sol"),
  })
  .strict();
const draftResult = z
  .object({ ok: z.literal(true), draft: draftOutputSchema })
  .strict();

/** Trusted auth broker, analogous to the API provider in the parent. No agent
 * turn or model tools: the framework alone reads/refreshes its own OAuth store.
 * The existing sandboxed runtime continues to receive only the local gateway. */
export function createSubscriptionBroker(
  options: SubscriptionBrokerOptions,
  run = runProcess,
) {
  const lifetime = new AbortController();
  let verified = false;
  let active: Promise<unknown> | undefined;
  function eligible() {
    return (
      !lifetime.signal.aborted &&
      Number.isFinite(options.verifiedUntil) &&
      options.verifiedUntil > Date.now() &&
      options.verifiedUntil <= Date.now() + 3600000 &&
      /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/.test(options.profileId) &&
      /^[a-f0-9]{64}$/.test(options.inputSha256) &&
      [options.installRoot, options.nodePath, options.pluginPath].every(
        isAbsolute,
      )
    );
  }
  async function invoke(
    live: boolean,
    signal: AbortSignal,
    input?: DraftInput,
  ) {
    if (!eligible()) throw failure();
    signal.throwIfAborted();
    let root: string | undefined;
    try {
      const install = await realpath(options.installRoot);
      const node = await realpath(options.nodePath);
      const plugin = await realpath(options.pluginPath);
      const metadata = JSON.parse(
        await readFile(join(install, "package.json"), "utf8"),
      );
      if (metadata.name !== "openclaw" || metadata.version !== "2026.9.6")
        throw failure();
      root = await mkdtemp(join(tmpdir(), "reseller-subscription-"));
      for (const part of ["workspace", "tmp"])
        await mkdir(join(root, part), { mode: 0o700 });
      const config = {
        env: { shellEnv: { enabled: false } },
        logging: { level: "silent", consoleLevel: "silent" },
        auth: {
          profiles: {
            [options.profileId]: { provider: "openai", mode: "oauth" },
          },
          order: { openai: [options.profileId] },
        },
        agents: {
          defaults: {
            workspace: join(root, "workspace"),
            skipBootstrap: true,
            contextInjection: "never",
            model: { primary: "openai/gpt-6-sol", fallbacks: [] },
          },
        },
        tools: { deny: ["*"] },
        plugins: {
          allow: ["reseller-draft", "openai"],
          load: { paths: [plugin] },
          slots: { memory: "none" },
          entries: {
            "reseller-draft": {
              enabled: true,
              config: { liveEnabled: live },
              llm: {
                allowModelOverride: true,
                allowedCompletionModels: ["openai/gpt-6-sol"],
              },
            },
          },
        },
        channels: {},
        cron: { enabled: false },
        hooks: { internal: { enabled: false } },
      };
      const configPath = join(root, "openclaw.json");
      await writeFile(configPath, JSON.stringify(config), {
        mode: 0o600,
        flag: "wx",
      });
      if (!eligible()) throw failure();
      const result = await run(
        node,
        [
          join(install, "openclaw.mjs"),
          "reseller-draft",
          live ? "generate" : "check",
        ],
        {
          cwd: join(root, "workspace"),
          env: {
            NODE_ENV: "production",
            HOME: homedir(),
            PATH: "/opt/homebrew/bin:/usr/bin:/bin",
            TMPDIR: join(root, "tmp"),
            OPENCLAW_CONFIG_PATH: configPath,
            NO_COLOR: "1",
          },
          signal: AbortSignal.any([signal, lifetime.signal]),
          timeoutMs: live ? 25000 : 15000,
          input: input
            ? JSON.stringify(draftInputSchema.parse(input))
            : undefined,
        },
      );
      signal.throwIfAborted();
      lifetime.signal.throwIfAborted();
      if (result.code !== 0) throw failure();
      return JSON.parse(result.stdout) as unknown;
    } catch {
      throw failure();
    } finally {
      if (root) await rm(root, { recursive: true, force: true });
    }
  }
  function track<T>(task: () => Promise<T>) {
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
    verify: async () => {
      if (active || !eligible()) return false;
      verified = false;
      return track(async () => {
        try {
          checkResult.parse(await invoke(false, lifetime.signal));
          verified = true;
          return true;
        } catch {
          return false;
        }
      });
    },
    generate: (raw: DraftInput, signal: AbortSignal) => {
      if (!verified || active || !eligible() || signal.aborted)
        return Promise.reject(failure());
      const input = draftInputSchema.safeParse(raw);
      if (
        !input.success ||
        createHash("sha256")
          .update(JSON.stringify(input.data))
          .digest("hex") !== options.inputSha256
      )
        return Promise.reject(failure());
      return track(
        async () =>
          draftResult.parse(
            await invoke(true, signal, draftInputSchema.parse(raw)),
          ).draft,
      );
    },
    close: async () => {
      verified = false;
      lifetime.abort();
      try {
        await active;
      } catch {
        /* Caller owns outcome. */
      }
    },
  };
}
