import { mkdtemp, rm, chmod, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { readWorkerConfig, acquireWorkerLock } from "../src/worker/config";
const env = {
  RESELLER_SUPABASE_URL: "https://synthetic.supabase.co",
  RESELLER_SUPABASE_PUBLIC_KEY: "sb_publishable_synthetic",
  RESELLER_WORKER_TOKEN: "a".repeat(64),
  OPENAI_API_KEY: "synthetic",
  OPENAI_MODEL: "configured-model",
};
it("requires explicit parent-only credentials and rejects privileged Supabase keys", () => {
  expect(readWorkerConfig(env)).toMatchObject({
    projectUrl: env.RESELLER_SUPABASE_URL,
    token: env.RESELLER_WORKER_TOKEN,
  });
  for (const key of Object.keys(env))
    expect(() => readWorkerConfig({ ...env, [key]: "" })).toThrow();
  for (const key of [
    "sb_secret_unsafe",
    "a." + Buffer.from('{"role":"service_role"}').toString("base64url") + ".c",
    "invalid",
  ])
    expect(() =>
      readWorkerConfig({ ...env, RESELLER_SUPABASE_PUBLIC_KEY: key }),
    ).toThrow();
  expect(() =>
    readWorkerConfig({ ...env, RESELLER_SUPABASE_URL: "http://localhost" }),
  ).toThrow();
  const anon =
    "a." + Buffer.from('{"role":"anon"}').toString("base64url") + ".c";
  expect(
    readWorkerConfig({ ...env, RESELLER_SUPABASE_PUBLIC_KEY: anon }).publicKey,
  ).toBe(anon);
});
it("uses an exclusive owner-private lock, retaining ambiguous existing locks", async () => {
  const state = await mkdtemp(join(tmpdir(), "reseller-lock-")); // canonicalize macOS /var alias
  const { realpath } = await import("node:fs/promises");
  const directory = await realpath(state);
  try {
    await chmod(directory, 0o755);
    await expect(acquireWorkerLock(directory)).rejects.toThrow();
    await chmod(directory, 0o700);
    const release = await acquireWorkerLock(directory);
    expect(
      await readFile(join(directory, "worker.lock", "owner.json"), "utf8"),
    ).toContain(String(process.pid));
    await expect(acquireWorkerLock(directory)).rejects.toThrow();
    await release();
    await release();
    const next = await acquireWorkerLock(directory);
    await next();
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});
