import { spawn } from "node:child_process";
import { expect, it, vi } from "vitest";
import {
  startDraftGateway,
  type DraftGateway,
  type DraftGenerator,
} from "../src/lib/automation/draft-gateway";
import { createOpenAIDraftProvider } from "../src/lib/automation/draft-provider";
const enabled =
  process.env.RUN_OPENCLAW_PROBE === "1" && process.platform === "darwin";
function probe(g: DraftGateway): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "python3",
      ["scripts/check-openclaw-draft-gateway.py"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error("Synthetic probe failed: " + stderr));
      else {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error("Invalid synthetic probe result"));
        }
      }
    });
    child.stdin.end(JSON.stringify({ baseUrl: g.baseUrl, token: g.token }));
  });
}
it.skipIf(!enabled)(
  "installed isolated OpenClaw uses the real gateway once and returns the frozen provider answer",
  async () => {
    const answer = {
      body: "The saved price is PHP 500.",
      reviewReason: "Synthetic result. Review before sending.",
    };
    const upstream = vi.fn<typeof fetch>(async () =>
      Response.json({
        status: "completed",
        error: null,
        incomplete_details: null,
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: JSON.stringify(answer) }],
          },
        ],
      }),
    );
    const generate = vi.fn<DraftGenerator>(
      createOpenAIDraftProvider(
        "synthetic-parent-key",
        "configured-model",
        upstream,
      ),
    );
    const input = {
      instructions: "Only supplied facts",
      data: '{"price":500}',
      maxOutputTokens: 1800 as const,
    };
    const g = await startDraftGateway(
      input,
      generate,
      new AbortController().signal,
    );
    try {
      const result = await probe(g);
      expect(result).toMatchObject({
        exitCode: 0,
        ok: true,
        assistantTurns: 1,
        retainedPromptFiles: [],
        temporaryRunDirsRemaining: 0,
        liveWorkerAdmitted: false,
      });
      expect(result.toolSummary).toBeNull();
      expect(JSON.parse(result.final as string)).toEqual(answer);
      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate.mock.calls[0][0]).toEqual(input);
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(upstream.mock.calls[0][1]!.body as string).input[1].content,
      ).toBe(input.data);
      expect(g.result()).toEqual(answer);
    } finally {
      await g.close();
    }
  },
  30000,
);
it.skipIf(!enabled)(
  "installed OpenClaw cannot repeat provider inference after a rejected result",
  async () => {
    const upstream = vi.fn<typeof fetch>(async () =>
      Response.json({
        status: "completed",
        error: null,
        incomplete_details: null,
        output: [{ type: "function_call", name: "exec" }],
      }),
    );
    const generate = vi.fn<DraftGenerator>(
      createOpenAIDraftProvider(
        "synthetic-parent-key",
        "configured-model",
        upstream,
      ),
    );
    const g = await startDraftGateway(
      {
        instructions: "Only supplied facts",
        data: "{}",
        maxOutputTokens: 1800,
      },
      generate,
      new AbortController().signal,
    );
    try {
      const result = await probe(g);
      expect(result.ok).toBe(false);
      expect(result.exitCode).not.toBe(0);
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(generate).toHaveBeenCalledTimes(1);
      expect(() => g.result()).toThrow();
      expect(result.retainedPromptFiles).toEqual([]);
      expect(result.temporaryRunDirsRemaining).toBe(0);
    } finally {
      await g.close();
    }
  },
  30000,
);
