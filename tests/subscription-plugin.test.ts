import { expect, it, vi } from "vitest";
import plugin, { type Command } from "../integrations/openclaw-reseller/index";

it("registers only a CLI command and keeps inference disabled by default", async () => {
  const actions: Record<string, () => Promise<void>> = {};
  function command(path: string): Command {
    return {
      command: (name) => command([path, name].filter(Boolean).join(" ")),
      description() {
        return this;
      },
      action: (fn) => {
        actions[path] = fn;
      },
    };
  }
  const program = command("");
  const complete = vi.fn();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const previousExit = process.exitCode;
  try {
    plugin.register({
      pluginConfig: {},
      runtime: { version: "2026.9.6", llm: { complete } },
      registerCli: (registrar) => registrar({ program }),
    });
    expect(Object.keys(actions)).toEqual([
      "reseller-draft check",
      "reseller-draft generate",
    ]);
    await actions["reseller-draft check"]();
    expect(log).toHaveBeenLastCalledWith(
      JSON.stringify({
        ok: true,
        hostCompatible: true,
        inferenceEnabled: false,
        model: "openai/gpt-6-sol",
      }),
    );
    await actions["reseller-draft generate"]();
    expect(log).toHaveBeenLastCalledWith('{"ok":false,"reason":"unavailable"}');
    expect(complete).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  } finally {
    log.mockRestore();
    process.exitCode = previousExit;
  }
});
