import { request as httpRequest } from "node:http";
import { expect, it, vi } from "vitest";
import {
  startDraftGateway,
  type DraftGateway,
  type DraftGenerator,
} from "../src/lib/automation/draft-gateway";
const input = {
  instructions: "Use saved facts",
  data: '{"price":500}',
  maxOutputTokens: 1800 as const,
};
const answer = { body: "PHP 500.", reviewReason: "Check first." };
const body = {
  model: "reseller-draft",
  stream: true,
  messages: [{ role: "user", content: "Untrusted runtime text" }],
  max_completion_tokens: 1800,
};
function request(
  g: DraftGateway,
  changes: {
    body?: unknown;
    token?: string;
    headers?: Record<string, string>;
    path?: string;
  } = {},
) {
  return fetch(g.baseUrl + (changes.path ?? "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + (changes.token ?? g.token),
      "Content-Type": "application/json",
      ...changes.headers,
    },
    body: JSON.stringify(changes.body ?? body),
  });
}
it("admits one concurrent request, freezes worker input and invalidates the run after a duplicate", async () => {
  let release!: () => void;
  const ready = new Promise<void>((r) => {
    release = r;
  });
  const generate = vi.fn<DraftGenerator>(async () => {
    await ready;
    return answer;
  });
  const mutable = { ...input };
  const g = await startDraftGateway(
    mutable,
    generate,
    new AbortController().signal,
  );
  try {
    mutable.data = "Changed after start";
    const first = request(g);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const second = await request(g);
    expect(second.status).toBe(409);
    release();
    expect((await first).status).toBe(200);
    expect(generate.mock.calls[0][0]).toEqual(input);
    expect(() => g.result()).toThrow("Draft runtime");
  } finally {
    release();
    await g.close();
  }
});
it("returns only validated SSE output and records a usable result", async () => {
  const g = await startDraftGateway(
    input,
    async () => answer,
    new AbortController().signal,
  );
  try {
    const response = await request(g);
    expect(response.status).toBe(200);
    const content = await response.text();
    expect(content).toContain("[DONE]");
    expect(content).toContain("PHP 500.");
    expect(content).not.toContain("Untrusted runtime text");
    expect(g.result()).toEqual(answer);
  } finally {
    await g.close();
  }
});
it("rejects wrong capabilities, origins and paths before inference", async () => {
  const generate = vi.fn(async () => answer);
  const g = await startDraftGateway(
    input,
    generate,
    new AbortController().signal,
  );
  try {
    expect((await request(g, { token: "wrong" })).status).toBe(401);
    expect(
      (await request(g, { headers: { Origin: "https://example.test" } }))
        .status,
    ).toBe(403);
    expect((await request(g, { path: "/other" })).status).toBe(404);
    expect(generate).not.toHaveBeenCalled();
    expect((await request(g)).status).toBe(200);
  } finally {
    await g.close();
  }
});
it("never repeats inference after failed output or provider failure", async () => {
  for (const value of [
    new Error("private provider detail"),
    { ...answer, tool_calls: [{}] },
  ]) {
    const generate = vi.fn(async () => {
      if (value instanceof Error) throw value;
      return value;
    });
    const g = await startDraftGateway(
      input,
      generate,
      new AbortController().signal,
    );
    try {
      const failed = await request(g);
      expect(failed.status).toBe(502);
      expect(await failed.text()).not.toContain("private");
      expect((await request(g)).status).toBe(409);
      expect(generate).toHaveBeenCalledTimes(1);
      expect(() => g.result()).toThrow();
    } finally {
      await g.close();
    }
  }
});
it("burns malformed or oversized authenticated attempts without any provider call", async () => {
  for (const invalid of [
    { ...body, tools: [{ name: "exec" }] },
    { ...body, messages: ["x".repeat(33000)] },
    { ...body, model: "other" },
  ]) {
    const generate = vi.fn(async () => answer);
    const g = await startDraftGateway(
      input,
      generate,
      new AbortController().signal,
    );
    try {
      expect((await request(g, { body: invalid })).status).toBe(400);
      expect((await request(g)).status).toBe(409);
      expect(generate).not.toHaveBeenCalled();
    } finally {
      await g.close();
    }
  }
});
it("cancellation closes the listener and prevents late provider success", async () => {
  const c = new AbortController();
  let signal: AbortSignal | undefined;
  let release!: (value: unknown) => void;
  const g = await startDraftGateway(
    input,
    async (_input, s) => {
      signal = s;
      return new Promise((r) => {
        release = r;
      });
    },
    c.signal,
  );
  const pending = request(g).catch(() => null);
  await vi.waitFor(() => expect(signal).toBeDefined());
  c.abort();
  release(answer);
  await pending;
  expect(signal?.aborted).toBe(true);
  expect(() => g.result()).toThrow();
  await g.close();
  await expect(request(g)).rejects.toThrow();
});
it("settles startup when canceled immediately", async () => {
  const c = new AbortController();
  const pending = startDraftGateway(input, async () => answer, c.signal);
  c.abort();
  await expect(pending).rejects.toThrow("Draft runtime");
}, 3000);
it("expires an unused loopback capability without starting inference", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const generate = vi.fn(async () => answer);
  const g = await startDraftGateway(
    input,
    generate,
    new AbortController().signal,
  );
  try {
    await vi.advanceTimersByTimeAsync(25000);
    vi.useRealTimers();
    await expect(request(g)).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    await g.close();
  }
});

it("rejects excess headers even when Origin would fall beyond Node's parsed header limit", async () => {
  const generate = vi.fn(async () => answer);
  const g = await startDraftGateway(
    input,
    generate,
    new AbortController().signal,
  );
  try {
    const headers: Record<string, string> = {
      Host: new URL(g.baseUrl).host,
      Authorization: "Bearer " + g.token,
      "Content-Type": "application/json",
      Connection: "close",
    };
    for (let n = 0; n < 20; n++) headers["X-Filler-" + n] = "synthetic";
    headers.Origin = "https://example.test";
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        g.baseUrl + "/chat/completions",
        { method: "POST", headers },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode!));
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify(body));
    });
    expect(status).toBe(431);
    expect(generate).not.toHaveBeenCalled();
    expect((await request(g)).status).toBe(200);
  } finally {
    await g.close();
  }
});
