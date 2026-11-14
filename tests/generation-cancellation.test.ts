import { afterEach, expect, it, vi } from "vitest";
import { createGenerationHandler } from "../src/lib/generation";
const facts = {
  title: "Synthetic lamp",
  description: "",
  price: 500,
  category: "Home & living",
  condition: "Good",
  status: "Draft",
};
function input(signal: AbortSignal, body: BodyInit = JSON.stringify(facts)) {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { authorization: "Bearer synthetic" },
    body,
    signal,
    duplex: "half",
  } as RequestInit);
}
afterEach(() => {
  vi.useRealTimers();
});
for (const stage of ["authenticate", "reserve"] as const) {
  it(`does not admit another stage after caller cancellation while ${stage} is waiting`, async () => {
    vi.useFakeTimers();
    let finish!: (value: boolean) => void;
    const delayed = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    const authenticate = vi.fn().mockResolvedValue(true),
      reserve = vi.fn().mockResolvedValue(true),
      generate = vi.fn();
    (stage === "authenticate" ? authenticate : reserve).mockReturnValue(
      delayed,
    );
    const caller = new AbortController();
    let response: Response | undefined;
    void createGenerationHandler({
      demo: false,
      aiEnabled: true,
      authenticate,
      reserve,
      generate,
    })(input(caller.signal)).then((value) => {
      response = value;
    });
    await vi.advanceTimersByTimeAsync(1);
    caller.abort();
    await vi.advanceTimersByTimeAsync(1);
    expect(response?.status).toBe(408);
    finish(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(generate).not.toHaveBeenCalled();
    expect(reserve).toHaveBeenCalledTimes(stage === "reserve" ? 1 : 0);
    expect(vi.getTimerCount()).toBe(0);
  });
}
it("bounds a stalled provider response and signals cancellation without a retry", async () => {
  vi.useFakeTimers();
  const generate = vi.fn(() => new Promise<never>(() => {}));
  let response: Response | undefined;
  void createGenerationHandler({
    demo: false,
    aiEnabled: true,
    authenticate: async () => true,
    reserve: async () => true,
    generate,
  })(input(new AbortController().signal)).then((value) => {
    response = value;
  });
  await vi.advanceTimersByTimeAsync(35_001);
  expect(response?.status).toBe(504);
  expect(generate).toHaveBeenCalledTimes(1);
  expect((generate.mock.calls[0] as unknown[])[1]).toMatchObject({
    aborted: true,
  });
  expect(vi.getTimerCount()).toBe(0);
});
it("releases a stalled request-body reader on cancellation before quota or model use", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn(),
    reserve = vi.fn(),
    generate = vi.fn();
  const stream = new ReadableStream({ cancel });
  const caller = new AbortController();
  let response: Response | undefined;
  void createGenerationHandler({
    demo: false,
    aiEnabled: true,
    authenticate: async () => true,
    reserve,
    generate,
  })(input(caller.signal, stream)).then((value) => {
    response = value;
  });
  await vi.advanceTimersByTimeAsync(1);
  caller.abort();
  await vi.advanceTimersByTimeAsync(1);
  expect(response?.status).toBe(408);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(reserve).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});
