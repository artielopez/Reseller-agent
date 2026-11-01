import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { privateStateDirectory, type RuntimeOptions } from "./openclaw";
const failure = () =>
  new Error(
    "Worker configuration is missing or invalid. Check the local setup guide; do not paste credentials into logs.",
  );
export function runtimeOptions(
  env: Record<string, string | undefined>,
): RuntimeOptions {
  return {
    stateDir:
      env.RESELLER_WORKER_STATE_DIR ||
      join(homedir(), ".reseller-agent-worker"),
    installRoot:
      env.RESELLER_OPENCLAW_PATH || "/opt/homebrew/lib/node_modules/openclaw",
    nodePath: env.RESELLER_OPENCLAW_NODE || "/opt/homebrew/bin/node",
  };
}
export function readWorkerConfig(env: Record<string, string | undefined>) {
  const projectUrl = env.RESELLER_SUPABASE_URL ?? "",
    publicKey = env.RESELLER_SUPABASE_PUBLIC_KEY ?? "",
    token = env.RESELLER_WORKER_TOKEN ?? "",
    apiKey = env.OPENAI_API_KEY ?? "",
    model = env.OPENAI_MODEL ?? "";
  try {
    const url = new URL(projectUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !apiKey.trim() ||
      /[\r\n]/.test(apiKey) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(model)
    )
      throw failure();
    const isPublishable = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey);
    if (!isPublishable) {
      const parts = publicKey.split(".");
      if (
        parts.length !== 3 ||
        !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p)) ||
        JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role !==
          "anon"
      )
        throw failure();
    }
    return { projectUrl: url.origin, publicKey, token, apiKey, model };
  } catch {
    throw failure();
  }
}
/** Existing locks never expire automatically: crash/PID-reuse recovery is manual. */
export async function acquireWorkerLock(
  state: string,
): Promise<() => Promise<void>> {
  const directory = await privateStateDirectory(state),
    path = join(directory, "worker.lock");
  try {
    await mkdir(path, { mode: 0o700 });
  } catch {
    throw new Error(
      "Worker lock exists or cannot be created. Stop the other worker and follow recovery instructions before retrying.",
    );
  }
  const identity = await stat(path),
    nonce = randomUUID();
  try {
    await writeFile(
      join(path, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        nonce,
      }),
      { mode: 0o600, flag: "wx" },
    );
  } catch {
    await rm(path, { recursive: true, force: true });
    throw failure();
  }
  let released = false;
  return async () => {
    if (released) return;
    const current = await stat(path);
    if (
      current.ino !== identity.ino ||
      current.dev !== identity.dev ||
      JSON.parse(await readFile(join(path, "owner.json"), "utf8")).nonce !==
        nonce
    )
      throw new Error("Worker lock changed; recovery requires inspection.");
    await rm(path, { recursive: true });
    released = true;
  };
}
