import { z } from "zod";
import {
  createSubscriptionDraftProvider,
  type SubscriptionCompletion,
} from "../../src/worker/subscription-provider";
import { draftInputSchema } from "../../src/lib/automation/drafting";

export interface Command {
  command(name: string): Command;
  description(text: string): Command;
  action(run: () => Promise<void>): void;
}
type Api = {
  pluginConfig?: unknown;
  runtime: { version: string; llm: { complete: SubscriptionCompletion } };
  registerCli: (
    register: (ctx: { program: Command }) => void,
    options: object,
  ) => void;
};
const configSchema = z
  .object({
    liveEnabled: z.boolean().default(false),
    profileId: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/)
      .optional(),
  })
  .strict();

const plugin = {
  id: "reseller-draft",
  name: "Reseller draft completion",
  register(api: Api) {
    api.registerCli(
      ({ program }) => {
        const command = program
          .command("reseller-draft")
          .description(
            "Restricted buyer-draft completion; no agent tools or channel access",
          );
        const settings = () => {
          if (api.runtime.version !== "2026.9.6")
            throw new Error("Unsupported host");
          return configSchema.parse(api.pluginConfig ?? {});
        };
        const unavailable = () => {
          console.log(JSON.stringify({ ok: false, reason: "unavailable" }));
          process.exitCode = 1;
        };
        command
          .command("check")
          .description(
            "Check plugin compatibility without authentication or inference",
          )
          .action(async () => {
            try {
              const config = settings();
              console.log(
                JSON.stringify({
                  ok: true,
                  hostCompatible: true,
                  inferenceEnabled: config.liveEnabled,
                  model: "openai/gpt-6-sol",
                }),
              );
            } catch {
              unavailable();
            }
          });
        command
          .command("generate")
          .description(
            "Read one bounded draft input from stdin; requires verified live setup",
          )
          .action(async () => {
            const controller = new AbortController();
            const stop = () => controller.abort();
            let inputTimer: ReturnType<typeof setTimeout> | undefined;
            process.once("SIGINT", stop);
            process.once("SIGTERM", stop);
            try {
              // Intentionally off in the supplied configuration. OAuth alone does
              // not prove included quota, transport request bounds or no overage.
              const config = settings();
              if (!config.liveEnabled || !config.profileId)
                throw new Error("Live setup disabled");
              inputTimer = setTimeout(
                () => process.stdin.destroy(new Error("Input timeout")),
                5000,
              );
              const chunks: Buffer[] = [];
              let size = 0;
              for await (const chunk of process.stdin) {
                controller.signal.throwIfAborted();
                const bytes = Buffer.from(chunk);
                size += bytes.length;
                if (size > 16384) throw new Error("Input too large");
                chunks.push(bytes);
              }
              clearTimeout(inputTimer);
              const input = draftInputSchema.parse(
                JSON.parse(
                  new TextDecoder("utf-8", { fatal: true }).decode(
                    Buffer.concat(chunks),
                  ),
                ),
              );
              const draft = await createSubscriptionDraftProvider(
                (request) => api.runtime.llm.complete(request),
                config.profileId,
              )(input, controller.signal);
              console.log(JSON.stringify({ ok: true, draft }));
            } catch {
              unavailable();
            } finally {
              clearTimeout(inputTimer);
              controller.abort();
              process.off("SIGINT", stop);
              process.off("SIGTERM", stop);
            }
          });
      },
      {
        descriptors: [
          {
            name: "reseller-draft",
            description: "Restricted buyer-draft completion",
            hasSubcommands: true,
          },
        ],
      },
    );
  },
};
export default plugin;
