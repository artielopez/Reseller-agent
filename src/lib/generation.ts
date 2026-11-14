import {
  generatedCopySchema,
  generateTemplate,
  itemInputSchema,
  type GeneratedCopy,
  type ItemInput,
} from "./domain";
import { withRequestDeadline } from "./request-deadline";
export type GenerationDependencies = {
  demo: boolean;
  aiEnabled: boolean;
  authenticate: (token: string, signal: AbortSignal) => Promise<boolean>;
  reserve: (token: string, signal: AbortSignal) => Promise<boolean>;
  generate: (item: ItemInput, signal: AbortSignal) => Promise<GeneratedCopy>;
};
const MAX_BODY = 16_384;
async function readBoundedBody(request: Request, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      total += value.length;
      if (total > MAX_BODY) {
        cancel();
        throw new RangeError("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
export function createGenerationHandler(deps: GenerationDependencies) {
  const respond = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  async function run(request: Request, signal: AbortSignal) {
    signal.throwIfAborted();
    const token =
      request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] || "";
    if (!deps.demo) {
      try {
        const authenticated = token && (await deps.authenticate(token, signal));
        signal.throwIfAborted();
        if (!authenticated)
          return respond(
            { error: "Sign in before generating listing copy." },
            401,
          );
      } catch {
        signal.throwIfAborted();
        return respond(
          { error: "Sign-in verification is unavailable. Please try again." },
          503,
        );
      }
    }
    let item: ItemInput;
    try {
      item = itemInputSchema.parse(
        JSON.parse(await readBoundedBody(request, signal)),
      );
    } catch (error) {
      signal.throwIfAborted();
      return respond(
        {
          error:
            error instanceof RangeError
              ? "Request is too large."
              : "Check the item title, condition, category, price and description.",
        },
        error instanceof RangeError ? 413 : 400,
      );
    }
    signal.throwIfAborted();
    if (deps.demo || !deps.aiEnabled)
      return respond({ source: "template", copy: generateTemplate(item) });
    try {
      const reserved = await deps.reserve(token, signal);
      signal.throwIfAborted();
      if (!reserved)
        return respond(
          {
            error:
              "Daily AI limit reached (20 requests). Try tomorrow, or write your copy manually.",
          },
          429,
        );
    } catch {
      signal.throwIfAborted();
      return respond(
        { error: "Could not check the AI allowance. Please try again later." },
        503,
      );
    }
    try {
      const generated = await deps.generate(item, signal);
      signal.throwIfAborted();
      const copy = generatedCopySchema.parse(generated);
      for (const value of Object.values(copy)) {
        if (
          !value.title.trim() ||
          value.title.length > 160 ||
          !value.description.trim() ||
          value.description.length > 6000
        )
          throw new Error("Invalid output");
      }
      return respond({ source: "ai", copy });
    } catch {
      signal.throwIfAborted();
      return respond(
        {
          error:
            "AI generation could not finish. Your item is safe. Please try again or edit the copy manually.",
        },
        502,
      );
    }
  }
  return async (request: Request) => {
    try {
      return await withRequestDeadline(
        (signal) => run(request, signal),
        "Generation stopped.",
        request.signal,
        35_000,
      );
    } catch {
      return respond(
        {
          error:
            "Generation stopped before completion. Your item is safe. An AI attempt may already have been used; no automatic retry was made.",
        },
        request.signal.aborted ? 408 : 504,
      );
    }
  };
}
