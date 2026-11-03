import { expect, it, vi } from "vitest";
import { createOpenAIDraftProvider } from "../src/lib/automation/draft-provider";
const input = {
  instructions: "Use only saved facts",
  data: '{"question":"Price?","item":{"price":500}}',
  maxOutputTokens: 1800 as const,
};
const answer = {
  body: "The price is PHP 500.",
  reviewReason: "Review before sending.",
};
const response = (overrides = {}) => ({
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
  ...overrides,
});
it("makes one bounded, tool-free, stateless request using only worker input", async () => {
  const f = vi.fn<typeof fetch>(async () => Response.json(response()));
  expect(
    await createOpenAIDraftProvider(
      "synthetic-key",
      "configured-model",
      f,
    )(input, new AbortController().signal),
  ).toEqual(answer);
  expect(f).toHaveBeenCalledTimes(1);
  const [url, init] = f.mock.calls[0];
  expect(url).toBe("https://api.openai.com/v1/responses");
  expect(init?.redirect).toBe("error");
  const body = JSON.parse(init!.body as string);
  expect(body).toMatchObject({
    model: "configured-model",
    store: false,
    stream: false,
    tools: [],
    tool_choice: "none",
    max_output_tokens: 1800,
    input: [
      { role: "system", content: input.instructions },
      { role: "user", content: input.data },
    ],
  });
  expect(body).not.toHaveProperty("previous_response_id");
  expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
});
it("rejects refusal, tool calls, incomplete, invalid and oversized output without retry", async () => {
  for (const value of [
    response({ status: "incomplete" }),
    response({ output: [{ type: "function_call" }] }),
    response({
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "refusal", refusal: "no" }],
        },
      ],
    }),
    response({ output: [] }),
    response({ error: { message: "private server error" } }),
    response({ extra: "x".repeat(70000) }),
  ]) {
    const f = vi.fn<typeof fetch>(async () => Response.json(value));
    await expect(
      createOpenAIDraftProvider(
        "synthetic-key",
        "model",
        f,
      )(input, new AbortController().signal),
    ).rejects.toThrow("Draft provider");
    expect(f).toHaveBeenCalledTimes(1);
  }
});
it("does not retry rate limits or redirects, and never exposes upstream errors", async () => {
  for (const status of [302, 429, 500]) {
    const f = vi.fn<typeof fetch>(
      async () => new Response("private key", { status }),
    );
    await expect(
      createOpenAIDraftProvider(
        "synthetic-key",
        "model",
        f,
      )(input, new AbortController().signal),
    ).rejects.toThrow("Draft provider");
    expect(f).toHaveBeenCalledTimes(1);
  }
});
it("rejects canceled and oversized input before network work", async () => {
  const f = vi.fn<typeof fetch>();
  const c = new AbortController();
  c.abort();
  const generate = createOpenAIDraftProvider("synthetic-key", "model", f);
  await expect(generate(input, c.signal)).rejects.toThrow();
  await expect(
    generate(
      { ...input, data: "x".repeat(17000) },
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(f).not.toHaveBeenCalled();
});
it("handles cancellation that occurs inside fetch without an unhandled rejection", async () => {
  const c = new AbortController();
  const f = vi.fn<typeof fetch>(() => {
    c.abort();
    return Promise.reject(new Error("private failure"));
  });
  await expect(
    createOpenAIDraftProvider("synthetic-key", "model", f)(input, c.signal),
  ).rejects.toThrow("Draft provider");
});
it("enforces its own deadline even when an injected transport never settles", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const f = vi.fn<typeof fetch>(async (_url, init) => {
    signal = init?.signal as AbortSignal;
    return new Promise<Response>(() => {});
  });
  try {
    const pending = createOpenAIDraftProvider(
      "synthetic-key",
      "model",
      f,
    )(input, new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow("Draft provider");
    await vi.advanceTimersByTimeAsync(20000);
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
