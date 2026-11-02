import { afterEach, expect, it, vi } from "vitest";
import {
  createSubscriptionDraftProvider,
  type SubscriptionCompletion,
} from "../src/worker/subscription-provider";

const input = {
  instructions: "Use saved facts only. Return a draft for review.",
  data: JSON.stringify({ question: "How much?", item: { price: 850 } }),
  maxOutputTokens: 1800 as const,
};
const output = {
  body: "The asking price is PHP 850.",
  reviewReason: "Review before use.",
};
const response = () => ({
  text: JSON.stringify(output),
  provider: "openai",
  model: "gpt-6-sol",
  stopReason: "stop",
  execution: {
    mode: "direct-provider",
    owner: { kind: "provider", id: "openai" },
  },
});
afterEach(() => vi.useRealTimers());

it("uses the host OAuth-only completion API once with frozen facts and no tools or auth material", async () => {
  const complete = vi.fn<SubscriptionCompletion>(async () => response());
  const provider = createSubscriptionDraftProvider(complete);
  expect(await provider(input, new AbortController().signal)).toEqual(output);
  expect(complete).toHaveBeenCalledTimes(1);
  const request = complete.mock.calls[0][0];
  expect(request).toMatchObject({
    model: "openai/gpt-6-sol",
    requiredAuthMode: "oauth",
    maxTokens: 1800,
    systemPrompt: input.instructions,
    messages: [{ role: "user", content: input.data }],
  });
  expect(Object.keys(request).sort()).toEqual([
    "maxTokens",
    "messages",
    "model",
    "purpose",
    "reasoning",
    "requiredAuthMode",
    "responseFormat",
    "signal",
    "systemPrompt",
  ]);
  expect(request.responseFormat).toMatchObject({
    type: "json_schema",
    json_schema: { strict: true },
  });
  expect(request.signal.aborted).toBe(true); // Closing the call also closes late transport work.
});

it.each([
  { provider: "anthropic" },
  { model: "different-model" },
  { stopReason: "toolUse" },
  { stopReason: "length" },
  { stopReason: undefined },
  { execution: undefined },
  {
    execution: {
      mode: "isolated-agent-runtime",
      owner: { kind: "harness", id: "agents-api" },
    },
  },
  { text: '{"body":"x","reviewReason":"x","send":true}' },
  { text: '{"body":"x"}' },
  { text: "not JSON" },
  { text: "x".repeat(16001) },
])(
  "rejects incomplete, changed-route, tool-bearing or malformed output: %j",
  async (patch) => {
    const complete = vi.fn<SubscriptionCompletion>(async () => ({
      ...response(),
      ...patch,
    }));
    await expect(
      createSubscriptionDraftProvider(complete)(
        input,
        new AbortController().signal,
      ),
    ).rejects.toThrow("Subscription drafting could not finish");
    expect(complete).toHaveBeenCalledTimes(1);
  },
);

it("never retries or reveals provider errors containing credentials or buyer text", async () => {
  const complete = vi.fn<SubscriptionCompletion>(async () => {
    throw new Error("SECRET buyer private message");
  });
  await expect(
    createSubscriptionDraftProvider(complete)(
      input,
      new AbortController().signal,
    ),
  ).rejects.toThrow(
    /^Subscription drafting could not finish\. No fallback was attempted\.$/,
  );
  expect(complete).toHaveBeenCalledTimes(1);
});

it("rejects invalid input and cancellation before any host call", async () => {
  const complete = vi.fn<SubscriptionCompletion>(async () => response());
  await expect(
    createSubscriptionDraftProvider(complete)(
      { ...input, model: "other" } as typeof input,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(
    createSubscriptionDraftProvider(complete)(input, controller.signal),
  ).rejects.toThrow();
  expect(complete).not.toHaveBeenCalled();
});

it("times out and aborts the host call without waiting for an uncooperative completion", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const complete = vi.fn<SubscriptionCompletion>(async (request) => {
    signal = request.signal;
    return await new Promise(() => {});
  });
  const pending = createSubscriptionDraftProvider(complete)(
    input,
    new AbortController().signal,
  );
  const rejected = expect(pending).rejects.toThrow(
    "Subscription drafting could not finish",
  );
  await vi.advanceTimersByTimeAsync(20000);
  await rejected;
  expect(signal?.aborted).toBe(true);
  expect(complete).toHaveBeenCalledTimes(1);
});
it("rejects a late result after parent cancellation without retry", async () => {
  let finish!: (value: unknown) => void;
  const complete = vi.fn<SubscriptionCompletion>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new AbortController();
  const task = createSubscriptionDraftProvider(complete)(
    input,
    controller.signal,
  );
  const rejected = expect(task).rejects.toThrow("No fallback");
  await Promise.resolve();
  controller.abort();
  await rejected;
  finish(response());
  expect(complete).toHaveBeenCalledTimes(1);
});
