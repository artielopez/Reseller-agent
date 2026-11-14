import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker(
  fetcher = vi.fn(
    async () =>
      new Response('<html data-reseller-offline="v1">Offline</html>', {
        headers: { "Content-Type": "text/html" },
      }),
  ),
) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const put = vi.fn(),
    remove = vi.fn(),
    claim = vi.fn();
  const fallback = new Response("Offline");
  const caches = {
    open: async () => ({ put, match: async () => fallback }),
    keys: async () => [
      "unrelated-app",
      "reseller-offline-old",
      "reseller-offline-v1",
    ],
    delete: remove,
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      location: { origin: "https://app.example.test" },
      clients: { claim },
      addEventListener: (name: string, handler: (event: unknown) => void) => {
        handlers[name] = handler;
      },
    },
    caches,
    fetch: fetcher,
    URL,
    Response,
  });
  return { handlers, put, remove, claim, fetcher, fallback };
}
describe("private-workspace service worker", () => {
  it("caches only the verified static offline document and cleans only its own obsolete caches", async () => {
    const w = worker();
    let pending: Promise<unknown> = Promise.resolve();
    const waitUntil = (value: Promise<unknown>) => {
      pending = value;
    };
    w.handlers.install({ waitUntil });
    await pending;
    expect(w.put.mock.calls.map(([key]) => key)).toEqual(["/offline.html"]);
    w.handlers.activate({ waitUntil });
    await pending;
    expect(w.remove.mock.calls).toEqual([["reseller-offline-old"]]);
    expect(w.claim).toHaveBeenCalledOnce();
  });
  it("refuses to cache an access-gate or error page", async () => {
    const w = worker(
      vi.fn(
        async () =>
          new Response("Sign in to hosting", {
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );
    let pending: Promise<unknown> = Promise.resolve();
    w.handlers.install({
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await expect(pending).rejects.toThrow();
    expect(w.put).not.toHaveBeenCalled();
  });
  it("accepts only the owned static page after the hosting canonical redirect", async () => {
    for (const [url, allowed] of [
      ["https://app.example.test/offline", true],
      ["https://app.example.test/login", false],
      ["https://other.example.test/offline", false],
      ["https://app.example.test/offline?code=private", false],
    ] as const) {
      const response = new Response(
        '<html data-reseller-offline="v1">Offline</html>',
        { headers: { "Content-Type": "text/html" } },
      );
      Object.defineProperties(response, {
        url: { value: url },
        redirected: { value: true },
      });
      const w = worker(vi.fn(async () => response));
      let pending: Promise<unknown> = Promise.resolve();
      w.handlers.install({
        waitUntil: (p: Promise<unknown>) => {
          pending = p;
        },
      });
      if (allowed) {
        await pending;
        expect(w.put).toHaveBeenCalledOnce();
      } else {
        await expect(pending).rejects.toThrow();
        expect(w.put).not.toHaveBeenCalled();
      }
    }
  });
  it("never handles auth callbacks, data, photos, external requests or writes", () => {
    const w = worker();
    for (const [url, method, mode] of [
      ["/?code=private", "GET", "navigate"],
      ["/api/generate", "POST", "navigate"],
      ["/inbox?token=private", "GET", "navigate"],
      ["/photo.jpg", "GET", "no-cors"],
      ["https://other.example.test/", "GET", "navigate"],
      ["/", "POST", "navigate"],
    ]) {
      const respondWith = vi.fn();
      w.handlers.fetch({
        request: {
          url: new URL(url, "https://app.example.test").href,
          method,
          mode,
        },
        respondWith,
      });
      expect(respondWith).not.toHaveBeenCalled();
    }
    expect(w.fetcher).not.toHaveBeenCalled();
  });
  it("uses an offline page on network failure, never hides HTTP errors or caches app responses", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response("Denied", { status: 403 }));
    const w = worker(fetcher);
    let response: Promise<Response> = Promise.resolve(new Response());
    const event = {
      request: {
        url: "https://app.example.test/inbox",
        method: "GET",
        mode: "navigate",
      },
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
    };
    w.handlers.fetch(event);
    expect(await (await response).text()).toBe("Offline");
    w.handlers.fetch(event);
    expect((await response).status).toBe(403);
    expect(w.put).not.toHaveBeenCalled();
  });
});
