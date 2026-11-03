import { expect, test } from "@playwright/test";

test("the real cloud generation route rejects anonymous requests without caching", async ({
  request,
}) => {
  // Exercise the running framework route rather than the client-side mock.
  // No bearer token means the handler stops before Auth/quota/provider calls.
  const response = await request.post("/api/generate", {
    data: {
      title: "Synthetic route check",
      price: 100,
      description: "",
      category: "Home & living",
      condition: "Good",
      status: "Draft",
    },
  });
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({
    error: "Sign in before generating listing copy.",
  });
});
