import assert from "node:assert/strict";

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
