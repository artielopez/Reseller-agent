import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import {
  draftInputSchema,
  draftOutputSchema,
  type DraftInput,
  type DraftOutput,
} from "./drafting";
const responseSchema = z.object({
  status: z.literal("completed"),
  error: z.null(),
  incomplete_details: z.null(),
  output: z.tuple([
    z.object({
      type: z.literal("message"),
      role: z.literal("assistant"),
      status: z.literal("completed"),
      content: z.tuple([
        z.object({
          type: z.literal("output_text"),
          text: z.string().max(16000),
        }),
      ]),
    }),
  ]),
});
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Canceled"));
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
/** Parent-worker use only. Never supply this key/model from buyer/runtime input.
 * One direct fetch, no SDK retry loop, redirects, conversation state or tools.
 * Model/account compatibility and provider retention still need live acceptance. */
export function createOpenAIDraftProvider(
  key: string,
  model: string,
  fetcher: typeof fetch = fetch,
) {
  if (
    !key.trim() ||
    /[\r\n]/.test(key) ||
    !/^[A-Za-z0-9_.:/-]{1,160}$/.test(model)
  )
    throw new Error("Invalid draft provider configuration.");
  return async (
    raw: DraftInput,
    parentSignal: AbortSignal,
  ): Promise<DraftOutput> => {
    const timerController = new AbortController();
    const signal = AbortSignal.any([parentSignal, timerController.signal]);
    const timer = setTimeout(() => timerController.abort(), 20000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      signal.throwIfAborted();
      const input = draftInputSchema.parse(raw);
      const response = await abortable(
        fetcher("https://api.openai.com/v1/responses", {
          method: "POST",
          redirect: "error",
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + key,
          },
          body: JSON.stringify({
            model,
            store: false,
            stream: false,
            background: false,
            tools: [],
            tool_choice: "none",
            reasoning: { effort: "none" },
            max_output_tokens: input.maxOutputTokens,
            input: [
              { role: "system", content: input.instructions },
              { role: "user", content: input.data },
            ],
            text: { format: zodTextFormat(draftOutputSchema, "buyer_draft") },
          }),
        }),
        signal,
      );
      if (!response.ok || !response.body)
        throw new Error("Provider unavailable");
      reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await abortable(reader.read(), signal);
        if (done) break;
        size += value.length;
        if (size > 65536) throw new Error("Response too large");
        chunks.push(value);
      }
      signal.throwIfAborted();
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const responseData = responseSchema.parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
      return draftOutputSchema.parse(
        JSON.parse(responseData.output[0].content[0].text),
      );
    } catch {
      throw new Error(
        "Draft provider could not return a usable answer. Review the job before trying again.",
      );
    } finally {
      clearTimeout(timer);
      timerController.abort();
      if (reader) {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  };
}
