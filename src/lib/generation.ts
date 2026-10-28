import {
  generatedCopySchema,
  generateTemplate,
  itemInputSchema,
  type GeneratedCopy,
  type ItemInput,
} from "./domain";
export type GenerationDependencies = {
  demo: boolean;
  aiEnabled: boolean;
  authenticate: (token: string) => Promise<boolean>;
  reserve: (token: string) => Promise<boolean>;
  generate: (item: ItemInput) => Promise<GeneratedCopy>;
};
const MAX_BODY = 16_384;
async function readBoundedBody(request: Request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BODY) {
        await reader.cancel();
        throw new RangeError("Request too large");
      }
      chunks.push(value);
    }
  } finally {
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
  return async (request: Request) => {
    const respond = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    const token =
      request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] || "";
    if (!deps.demo) {
      try {
        if (!token || !(await deps.authenticate(token)))
          return respond(
            { error: "Sign in before generating listing copy." },
            401,
          );
      } catch {
        return respond(
          { error: "Sign-in verification is unavailable. Please try again." },
          503,
        );
      }
    }
    let item: ItemInput;
    try {
      item = itemInputSchema.parse(JSON.parse(await readBoundedBody(request)));
    } catch (error) {
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
    if (deps.demo || !deps.aiEnabled)
      return respond({ source: "template", copy: generateTemplate(item) });
    try {
      if (!(await deps.reserve(token)))
        return respond(
          {
            error:
              "Daily AI limit reached (20 requests). Try tomorrow, or write your copy manually.",
          },
          429,
        );
    } catch {
      return respond(
        { error: "Could not check the AI allowance. Please try again later." },
        503,
      );
    }
    try {
      const copy = generatedCopySchema.parse(await deps.generate(item));
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
      return respond(
        {
          error:
            "AI generation could not finish. Your item is safe. Please try again or edit the copy manually.",
        },
        502,
      );
    }
  };
}
