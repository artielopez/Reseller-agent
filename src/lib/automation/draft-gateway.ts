import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  draftInputSchema,
  draftOutputSchema,
  type DraftInput,
  type DraftOutput,
} from "./drafting";
export type DraftGenerator = (
  input: DraftInput,
  signal: AbortSignal,
) => Promise<unknown>;
export type DraftGateway = {
  baseUrl: string;
  token: string;
  close: () => Promise<void>;
  result: () => DraftOutput;
};
const requestSchema = z
  .object({
    model: z.literal("reseller-draft"),
    stream: z.literal(true),
    messages: z.array(z.unknown()).min(1).max(16),
    max_completion_tokens: z.literal(1800),
    stream_options: z
      .object({ include_usage: z.boolean() })
      .strict()
      .optional(),
    tools: z.array(z.never()).optional(),
  })
  .strict();
function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    const finish = (error?: Error) => {
      clearTimeout(timer);
      request.off("data", data);
      request.off("end", end);
      request.off("error", fail);
      request.off("aborted", fail);
      if (error) {
        request.resume();
        reject(error);
      }
    };
    const fail = () => finish(new Error("Invalid request"));
    const data = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 32768) {
        finish(new Error("Request too large"));
        return;
      }
      chunks.push(chunk);
    };
    const end = () => {
      finish();
      try {
        resolve(
          JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              Buffer.concat(chunks),
            ),
          ),
        );
      } catch {
        reject(new Error("Invalid request"));
      }
    };
    const timer = setTimeout(fail, 2000);
    request.on("data", data);
    request.once("end", end);
    request.once("error", fail);
    request.once("aborted", fail);
  });
}
function reject(response: ServerResponse, status: number) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Connection: "close",
  });
  response.end(
    JSON.stringify({
      error: { message: "Draft runtime request unavailable." },
    }),
  );
}
/** One short-lived loopback capability, created only after durable job admission.
 * The generator is trusted parent code, not a function supplied by a runtime.
 * This endpoint alone does not verify process isolation or authorize paid work. */
export async function startDraftGateway(
  raw: DraftInput,
  generate: DraftGenerator,
  parentSignal: AbortSignal,
): Promise<DraftGateway> {
  const input = Object.freeze(draftInputSchema.parse(raw));
  parentSignal.throwIfAborted();
  const token = randomBytes(32).toString("hex"),
    expected = Buffer.from("Bearer " + token);
  const controller = new AbortController();
  let used = false,
    duplicate = false,
    closed = false,
    output: DraftOutput | undefined;
  let closePromise: Promise<void> | undefined;
  let authority = "";
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    void handle(request, response).catch(() => {
      if (!response.destroyed) reject(response, 502);
    });
  });
  async function handle(request: IncomingMessage, response: ServerResponse) {
    if (closed) return reject(response, 410);
    if (request.rawHeaders.length > 40) return reject(response, 431);
    if (
      request.headers.origin !== undefined ||
      request.headers.host !== authority
    )
      return reject(response, 403);
    if (request.method !== "POST" || request.url !== "/v1/chat/completions")
      return reject(response, 404);
    const supplied = Buffer.from(request.headers.authorization ?? "");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return reject(response, 401);
    if (used) {
      duplicate = true;
      return reject(response, 409);
    }
    used = true; // Burn the capability synchronously, before body parsing/await.
    try {
      if (
        !/^application\/json(?:;|$)/i.test(
          request.headers["content-type"] ?? "",
        )
      )
        throw new Error("Invalid type");
      requestSchema.parse(await readBody(request));
    } catch {
      return reject(response, 400);
    }
    if (controller.signal.aborted) return reject(response, 410);
    let result: DraftOutput;
    try {
      result = draftOutputSchema.parse(
        await generate(input, controller.signal),
      );
    } catch {
      return reject(response, 502);
    }
    if (closed || controller.signal.aborted || response.destroyed) return;
    output = result;
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "close",
    });
    const base = {
      id: "draft",
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "reseller-draft",
    };
    for (const [delta, finish_reason] of [
      [{ role: "assistant", content: JSON.stringify(result) }, null],
      [{}, "stop"],
    ]) {
      response.write(
        "data: " +
          JSON.stringify({
            ...base,
            choices: [{ index: 0, delta, finish_reason }],
          }) +
          "\n\n",
      );
    }
    response.end("data: [DONE]\n\n");
  }
  const close = () => {
    if (closePromise) return closePromise;
    closed = true;
    controller.abort();
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", abort);
    closePromise = new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    return closePromise;
  };
  const abort = () => {
    void close();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  server.maxConnections = 4;
  server.maxHeadersCount = 0; // Retain headers; enforce count explicitly before admission.
  server.headersTimeout = 3000;
  server.requestTimeout = 5000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    if (parentSignal.aborted || closed) throw new Error("Canceled");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Listener unavailable");
    authority = "127.0.0.1:" + address.port;
    server.on("error", abort);
    parentSignal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(abort, 25000);
    return {
      baseUrl: "http://" + authority + "/v1",
      token,
      close,
      result: () => {
        if (!output || duplicate || controller.signal.aborted)
          throw new Error("Draft runtime did not finish one clean request.");
        return { ...output };
      },
    };
  } catch {
    await close();
    throw new Error("Draft runtime endpoint unavailable.");
  }
}
