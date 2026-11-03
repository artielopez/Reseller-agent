import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Start the built Sites Worker locally on port 3020 before running this check.
// No cookies, bearer token, email request or provider call is used.
const origin = "http://127.0.0.1:3020";
for (const path of ["/", "/inbox"]) {
  const response = await fetch(origin + path, {
    signal: AbortSignal.timeout(10_000),
  });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Reseller Agent/);
  assert.match(html, /<script/);
  console.log(`${path}: production Worker HTML 200`);
}
const response = await fetch(origin + "/api/generate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "Synthetic route check" }),
  signal: AbortSignal.timeout(10_000),
});
assert.equal(response.status, 401);
assert.equal(response.headers.get("cache-control"), "no-store");
assert.deepEqual(await response.json(), {
  error: "Sign in before generating listing copy.",
});
console.log("/api/generate: anonymous rejection 401, no-store");

// Fresh, disposable browser contexts check the actual compiled client chunks.
// Never attach a personal browser or allow requests outside this loopback app.
const browser = await chromium.launch({ timeout: 10_000 });
try {
  for (const path of ["/", "/inbox"]) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      const unexpected = [];
      await context.route("**/*", (route) => {
        if (new URL(route.request().url()).origin === origin)
          return route.continue();
        unexpected.push("Non-local browser request blocked");
        return route.abort();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      page.on("pageerror", (error) => unexpected.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 400)
          unexpected.push(`HTTP ${response.status()} loading browser resource`);
      });
      await page.goto(origin + path, {
        waitUntil: "networkidle",
        timeout: 15_000,
      });
      await page
        .getByRole("button", { name: "Email me a sign-in link", exact: true })
        .waitFor();
      assert.deepEqual(
        unexpected,
        [],
        `${path}: compiled client must load without errors or external access`,
      );
      assert.equal((await context.cookies()).length, 0);
      console.log(
        `${path}: compiled sign-in rendered without page/resource errors or external requests`,
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
