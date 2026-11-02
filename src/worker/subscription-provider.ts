import { z } from "zod";
import {
  draftInputSchema,
  draftOutputSchema,
  type DraftInput,
  type DraftOutput,
} from "../lib/automation/drafting";

export type SubscriptionRequest = {
  model: "openai/gpt-6-sol";
  requiredAuthMode: "oauth";
  systemPrompt: string;
  messages: { role: "user"; content: string }[];
  maxTokens: 1800;
  reasoning: "off";
  purpose: "reseller.buyer-draft";
  responseFormat: {
    type: "json_schema";
    json_schema: { name: string; strict: true; schema: object };
  };
  signal: AbortSignal;
};
export type SubscriptionCompletion = (
  request: SubscriptionRequest,
) => Promise<unknown>;

const resultSchema = z.object({
  text: z.string().min(1).max(16000),
  provider: z.literal("openai"),
  model: z.literal("gpt-6-sol"),
  stopReason: z.literal("stop"),
  execution: z.object({
    mode: z.literal("direct-provider"),
    owner: z.object({ kind: z.literal("provider"), id: z.literal("openai") }),
  }),
});

/** Receives the trusted OpenClaw host capability, never a buyer-provided function. */
export function createSubscriptionDraftProvider(
  complete: SubscriptionCompletion,
) {
  return async (
    raw: DraftInput,
    parentSignal: AbortSignal,
  ): Promise<DraftOutput> => {
    const controller = new AbortController();
    const signal = AbortSignal.any([parentSignal, controller.signal]);
    const timer = setTimeout(() => controller.abort(), 20000);
    let onAbort: (() => void) | undefined;
    try {
      signal.throwIfAborted();
      const input = draftInputSchema.parse(raw);
      const canceled = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("Canceled"));
        signal.addEventListener("abort", onAbort, { once: true });
      });
      const request: SubscriptionRequest = {
        model: "openai/gpt-6-sol",
        requiredAuthMode: "oauth",
        systemPrompt: input.instructions,
        messages: [{ role: "user", content: input.data }],
        maxTokens: input.maxOutputTokens,
        reasoning: "off",
        purpose: "reseller.buyer-draft",
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "buyer_draft",
            strict: true,
            schema: z.toJSONSchema(draftOutputSchema),
          },
        },
        signal,
      };
      // The host resolves and refreshes its own OAuth login. No key or token is
      // accepted, returned or extracted here. This adapter has no retry loop.
      const rawResult = await Promise.race([
        Promise.resolve().then(() => {
          signal.throwIfAborted();
          return complete(request);
        }),
        canceled,
      ]);
      signal.throwIfAborted();
      const result = resultSchema.parse(rawResult);
      return draftOutputSchema.parse(JSON.parse(result.text));
    } catch {
      throw new Error(
        "Subscription drafting could not finish. No fallback was attempted.",
      );
    } finally {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener("abort", onAbort);
      controller.abort();
    }
  };
}
