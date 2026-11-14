import { test as base, expect, type Page } from "@playwright/test";

// Both addresses are public configuration, not credentials. Every backend
// request must be fulfilled by a test route; the context guard denies escapes.
export const backendOrigin =
  process.env.RESELLER_COMPILED_TEST === "1"
    ? "https://ecusonvqyjnuwjhvcivb.supabase.co"
    : "https://reseller-test.supabase.co";
const sessionKey = `sb-${new URL(backendOrigin).hostname.split(".")[0]}-auth-token`;

export const test = base.extend({
  context: async ({ context, baseURL }, runWithContext) => {
    const origin = new URL(baseURL!);
    if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1")
      throw new Error("Cloud contracts require an owned loopback server.");
    const escaped: string[] = [];
    await context.route("**/*", (route) => {
      const request = route.request();
      if (
        new URL(request.url()).origin === origin.origin &&
        ["GET", "HEAD"].includes(request.method())
      )
        return route.continue();
      escaped.push(`${request.method()} ${new URL(request.url()).pathname}`);
      return route.abort();
    });
    await runWithContext(context);
    expect(
      escaped,
      "Every backend or write request must have a synthetic handler",
    ).toEqual([]);
  },
});
export { expect };
export type { Page };

export async function seedSession(page: Page, saved: unknown) {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: sessionKey, value: saved },
  );
}

export async function publishSession(
  page: Page,
  saved: unknown,
  event: "SIGNED_IN" | "TOKEN_REFRESHED" = "SIGNED_IN",
) {
  await page.evaluate(
    ({ key, value, event }) => {
      if (event === "SIGNED_IN")
        localStorage.setItem(key, JSON.stringify(value));
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event, session: value });
      channel.close();
    },
    { key: sessionKey, value: saved, event },
  );
}
