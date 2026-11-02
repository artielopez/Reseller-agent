import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createSubscriptionBroker } from "../src/worker/subscription-broker";

const input = {
  instructions: "Only use supplied facts.",
  data: '{"question":"Price?","price":850}',
  maxOutputTokens: 1800 as const,
};
it("pins OAuth, strips ambient credentials, passes bounded data only on stdin and removes scratch state", async () => {
  const root = await mkdtemp(join(tmpdir(), "reseller-broker-test-"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "openclaw", version: "2026.9.6" }),
  );
  const paths: string[] = [];
  const run = vi.fn(async (_exe, args, options) => {
    paths.push(options.cwd);
    const config = JSON.parse(
      await readFile(options.env.OPENCLAW_CONFIG_PATH, "utf8"),
    );
    expect(Object.keys(options.env).sort()).toEqual(
      [
        "NODE_ENV",
        "HOME",
        "NO_COLOR",
        "OPENCLAW_CONFIG_PATH",
        "PATH",
        "TMPDIR",
      ].sort(),
    );
    expect(config.auth.order).toEqual({ openai: ["openai:test-oauth"] });
    expect(config.agents.defaults.model.fallbacks).toEqual([]);
    expect(config.tools.deny).toEqual(["*"]);
    expect(config.plugins.allow).toEqual(["reseller-draft", "openai"]);
    expect(args).not.toContain(input.data);
    const live = args.at(-1) === "generate";
    expect(config.plugins.entries["reseller-draft"].config.liveEnabled).toBe(
      live,
    );
    if (live) expect(JSON.parse(options.input)).toEqual(input);
    return {
      code: 0,
      stderr: "",
      stdout: JSON.stringify(
        live
          ? {
              ok: true,
              draft: {
                body: "PHP 850.",
                reviewReason: "Check before copying.",
              },
            }
          : {
              ok: true,
              hostCompatible: true,
              inferenceEnabled: false,
              model: "openai/gpt-6-sol",
            },
      ),
    };
  });
  const broker = createSubscriptionBroker(
    {
      installRoot: root,
      nodePath: process.execPath,
      pluginPath: root,
      inputSha256: createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex"),
      profileId: "openai:test-oauth",
      verifiedUntil: Date.now() + 60000,
    },
    run,
  );
  try {
    await expect(
      broker.generate(input, new AbortController().signal),
    ).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(await broker.verify()).toBe(true);
    await expect(
      broker.generate(
        { ...input, data: "Unexpected private buyer text" },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(await broker.generate(input, new AbortController().signal)).toEqual({
      body: "PHP 850.",
      reviewReason: "Check before copying.",
    });
    expect(run).toHaveBeenCalledTimes(2);
    for (const path of paths) await expect(readdir(path)).rejects.toThrow();
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("rejects expired verification and never invokes a provider", async () => {
  const run = vi.fn();
  const broker = createSubscriptionBroker(
    {
      installRoot: "/missing",
      nodePath: process.execPath,
      pluginPath: "/missing",
      inputSha256: "a".repeat(64),
      profileId: "openai:test",
      verifiedUntil: Date.now() - 1,
    },
    run,
  );
  expect(await broker.verify()).toBe(false);
  await expect(
    broker.generate(input, new AbortController().signal),
  ).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
  await broker.close();
});
it("cancels an in-flight broker process, drains it and cleans its files", async () => {
  const root = await mkdtemp(join(tmpdir(), "reseller-broker-abort-"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "openclaw", version: "2026.9.6" }),
  );
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let path = "";
  const run = vi.fn<typeof import("../src/worker/process").runProcess>(
    async (_exe, args, options) => {
      if (args.at(-1) === "check")
        return {
          code: 0,
          stderr: "",
          stdout: JSON.stringify({
            ok: true,
            hostCompatible: true,
            inferenceEnabled: false,
            model: "openai/gpt-6-sol",
          }),
        };
      path = options.cwd;
      started();
      await new Promise<void>((_resolve, reject) =>
        options.signal.addEventListener(
          "abort",
          () => reject(new Error("secret-detail")),
          { once: true },
        ),
      );
      throw new Error("unreachable");
    },
  );
  const broker = createSubscriptionBroker(
    {
      installRoot: root,
      nodePath: process.execPath,
      pluginPath: root,
      inputSha256: createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex"),
      profileId: "openai:owner",
      verifiedUntil: Date.now() + 60000,
    },
    run,
  );
  try {
    expect(await broker.verify()).toBe(true);
    const task = broker.generate(input, new AbortController().signal);
    const failed = expect(task).rejects.toThrow(
      /^Subscription broker unavailable. No fallback was attempted.$/,
    );
    await ready;
    await expect(
      broker.generate(input, new AbortController().signal),
    ).rejects.toThrow();
    await broker.close();
    await failed;
    await expect(readdir(path)).rejects.toThrow();
    expect(await broker.verify()).toBe(false);
    expect(run).toHaveBeenCalledTimes(2);
  } finally {
    await broker.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("refuses unapproved payloads before launching the auth broker", async () => {
  const run = vi.fn();
  const broker = createSubscriptionBroker(
    {
      installRoot: "/missing",
      nodePath: process.execPath,
      pluginPath: "/missing",
      profileId: "openai:owner",
      verifiedUntil: Date.now() + 60000,
      inputSha256: "a".repeat(64),
    },
    run,
  );
  await expect(
    broker.generate(input, new AbortController().signal),
  ).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});
