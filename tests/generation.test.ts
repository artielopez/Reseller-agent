import { expect, it } from "vitest";
import {
  createGenerationHandler,
  type GenerationDependencies,
} from "../src/lib/generation";
const facts = {
  title: "Lamp",
  description: "Scratch on base",
  price: 500,
  category: "Home & living",
  condition: "Good",
  status: "Draft",
};
const request = (body: unknown = facts, token = "") =>
  new Request("http://localhost/api/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
const deps = (
  patch: Partial<GenerationDependencies> = {},
): GenerationDependencies => ({
  demo: false,
  aiEnabled: true,
  authenticate: async () => false,
  reserve: async () => true,
  generate: async () => {
    throw new Error("Provider must not be reached");
  },
  ...patch,
});
it("rejects unauthenticated paid generation", async () => {
  expect((await createGenerationHandler(deps())(request())).status).toBe(401);
});
it("returns labeled template copy in demo without provider or auth", async () => {
  const response = await createGenerationHandler(deps({ demo: true }))(
    request(),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    source: "template",
    copy: {
      carousell: { description: expect.stringContaining("Scratch on base") },
    },
  });
});
it("rejects malformed and oversized inputs", async () => {
  const handler = createGenerationHandler(deps({ demo: true }));
  expect((await handler(request({ ...facts, price: -1 }))).status).toBe(400);
  expect(
    (await handler(request({ ...facts, description: "x".repeat(20000) })))
      .status,
  ).toBe(413);
  expect(
    (
      await handler(
        new Request("http://localhost/api/generate", {
          method: "POST",
          body: "{",
        }),
      )
    ).status,
  ).toBe(400);
});
it("stops authenticated requests at the daily quota", async () => {
  const response = await createGenerationHandler(
    deps({
      authenticate: async (token) => token === "valid",
      reserve: async () => false,
    }),
  )(request(facts, "valid"));
  expect(response.status).toBe(429);
});
it("does not expose provider errors or silently substitute demo results", async () => {
  const response = await createGenerationHandler(
    deps({
      authenticate: async () => true,
      generate: async () => {
        throw new Error("secret-provider-detail");
      },
    }),
  )(request(facts, "valid"));
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("secret-provider-detail");
});
