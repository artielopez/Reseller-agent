import { test, expect, type Page } from "@playwright/test";
const owner = "11111111-1111-4111-8111-111111111111";
function session(id = owner) {
  return {
    access_token: "synthetic-access",
    refresh_token: "synthetic-refresh",
    token_type: "bearer",
    expires_at: 4102444800,
    expires_in: 3600,
    user: {
      id,
      aud: "authenticated",
      role: "authenticated",
      email: "seller@example.test",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-11-04T00:00:00Z",
    },
  };
}
async function inventory(page: Page) {
  await page.addInitScript(
    (saved) =>
      localStorage.setItem(
        "sb-reseller-test-auth-token",
        JSON.stringify(saved),
      ),
    session(),
  );
  await page.route("https://reseller-test.supabase.co/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/auth/v1/user")
      return route.fulfill({ json: session().user });
    if (path === "/rest/v1/items") return route.fulfill({ json: [] });
    return route.fulfill({
      status: 400,
      json: { message: "Unexpected fixture request" },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Item title", { exact: true })
    .fill("Private previous account lamp");
}
test("a timed-out inventory save keeps edits and makes no automatic second save", async ({
  page,
}) => {
  await inventory(page);
  let count = 0,
    release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/rest/v1/rpc/save_inventory_item_checked",
    async (route) => {
      count++;
      await held;
      await route.fulfill({ status: 500, json: {} }).catch(() => {});
    },
  );
  await page.clock.install();
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect.poll(() => count).toBe(1);
  await page.clock.fastForward(120_001);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "reload inventory before retrying",
  );
  await expect(page.getByLabel("Item title", { exact: true })).toHaveValue(
    "Private previous account lamp",
  );
  await expect(
    page.getByRole("button", { name: "Save item", exact: true }),
  ).toBeEnabled();
  expect(count).toBe(1);
  release();
});
test("an inventory save finishing after an account switch cannot enter the new workspace", async ({
  page,
}) => {
  await inventory(page);
  let release!: () => void,
    requested = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/rest/v1/rpc/save_inventory_item_checked",
    async (route) => {
      requested = true;
      await held;
      await route.fulfill({
        json: {
          saveRevision: "44444444-4444-4444-8444-444444444444",
          updatedAt: "2026-11-04T00:00:00Z",
          replyContextRevision: "1",
        },
      });
    },
  );
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  const canceled = page.waitForEvent("requestfailed", (request) =>
    request.url().includes("/rpc/save_inventory_item_checked"),
  );
  await page.evaluate((saved) => {
    localStorage.setItem("sb-reseller-test-auth-token", JSON.stringify(saved));
    const channel = new BroadcastChannel("sb-reseller-test-auth-token");
    channel.postMessage({ event: "SIGNED_IN", session: saved });
    channel.close();
  }, session("66666666-6666-4666-8666-666666666666"));
  await expect(page.getByLabel("Item title", { exact: true })).toHaveCount(0);
  await canceled;
  release();
  // Wait for an observable settled render, not only the network acknowledgment.
  await page
    .getByLabel("Search inventory")
    .fill("Private previous account lamp");
  await expect(
    page.getByRole("button", {
      name: "Edit Private previous account lamp",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Private previous account lamp saved.", { exact: true }),
  ).toHaveCount(0);
});
for (const path of ["/", "/inbox"]) {
  test(`stalled initial session refresh releases the ${path} loading screen`, async ({
    page,
  }) => {
    await page.addInitScript(
      (saved) =>
        localStorage.setItem(
          "sb-reseller-test-auth-token",
          JSON.stringify(saved),
        ),
      { ...session(), expires_at: 1 },
    );
    let requested = false,
      release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("https://reseller-test.supabase.co/**", async (route) => {
      requested = true;
      await held;
      await route
        .fulfill({ status: 401, json: { error: "synthetic expired session" } })
        .catch(() => {});
    });
    await page.clock.install();
    await page.goto(path);
    await expect.poll(() => requested).toBe(true);
    await expect(
      page.getByRole("button", { name: "Email me a sign-in link" }),
    ).toHaveCount(0);
    await page.clock.fastForward(15_001);
    await expect(
      page.getByRole("button", { name: "Email me a sign-in link" }),
    ).toBeVisible();
    release();
  });
}

test("a lost sign-in-email response releases the form without automatically resending", async ({
  page,
}) => {
  let requests = 0,
    release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "https://reseller-test.supabase.co/auth/v1/otp**",
    async (route) => {
      requests++;
      await held;
      await route.fulfill({ json: {} }).catch(() => {});
    },
  );
  await page.goto("/");
  await page.getByLabel("Email address").fill("seller@example.test");
  await page.clock.install();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect.poll(() => requests).toBe(1);
  await page.clock.fastForward(15_001);
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link" }),
  ).toBeEnabled();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Check your inbox before requesting another link",
  );
  expect(requests).toBe(1);
  release();
});

test("stalled listing generation preserves item facts and can recover without another model request", async ({
  page,
}) => {
  await inventory(page);
  let requests = 0,
    release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/generate", async (route) => {
    requests++;
    await held;
    await route
      .fulfill({ status: 500, json: { error: "Synthetic failure" } })
      .catch(() => {});
  });
  await page.clock.install();
  await page
    .getByRole("button", { name: "Generate listing copy", exact: true })
    .click();
  await expect.poll(() => requests).toBe(1);
  await page.clock.fastForward(45_001);
  await expect(
    page.getByRole("button", { name: "Save item", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Item title", { exact: true })).toHaveValue(
    "Private previous account lamp",
  );
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Generation did not finish",
  );
  expect(requests).toBe(1);
  release();
});
