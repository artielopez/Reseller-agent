import { test, expect, backendOrigin } from "./fixtures";
const email = "seller@example.test";
const session = {
  access_token: "synthetic-access",
  refresh_token: "synthetic-refresh",
  token_type: "bearer",
  expires_in: 3600,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-11-16T00:00:00Z",
  },
};
test("email code signs into the same app and survives reopening without visiting a link", async ({
  page,
}) => {
  let sent = 0,
    verified = 0;
  await page.route(`${backendOrigin}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/auth/v1/otp") {
      sent++;
      expect(route.request().postDataJSON()).toMatchObject({
        email,
        create_user: false,
      });
      return route.fulfill({ json: {} });
    }
    if (path === "/auth/v1/verify") {
      verified++;
      expect(route.request().postDataJSON()).toMatchObject({
        email,
        token: "12345678",
        type: "email",
      });
      return route.fulfill({ json: session });
    }
    if (path === "/auth/v1/user") return route.fulfill({ json: session.user });
    if (path === "/rest/v1/items") return route.fulfill({ json: [] });
    return route.fulfill({ status: 400, json: {} });
  });
  await page.goto("/");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Email me a sign-in code", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Enter the code",
  );
  await page.getByLabel("Email sign-in code", { exact: true }).fill("12345678");
  await page
    .getByRole("button", { name: "Verify code and sign in", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add item", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Add item", exact: true }),
  ).toBeVisible();
  expect(sent).toBe(1);
  expect(verified).toBe(1);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "12345678",
  );
});
test("expired codes clear safely and offer a new code without automatic resends", async ({
  page,
}) => {
  let count = 0;
  await page.route(`${backendOrigin}/auth/v1/verify`, (route) => {
    count++;
    return route.fulfill({
      status: 403,
      headers: {
        "x-supabase-api-version": "2024-01-01",
        "access-control-expose-headers": "x-supabase-api-version",
      },
      json: { code: "otp_expired", msg: "private detail" },
    });
  });
  await page.goto("/");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Email sign-in code", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Verify code and sign in", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Request a new code",
  );
  await expect(
    page.getByLabel("Email sign-in code", { exact: true }),
  ).toHaveValue("");
  expect(count).toBe(1);
});
test("a pending code verification is bounded and never repeated automatically", async ({
  page,
}) => {
  let count = 0,
    release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${backendOrigin}/auth/v1/verify`, async (route) => {
    count++;
    await held;
    await route.fulfill({ status: 400, json: {} }).catch(() => {});
  });
  await page.goto("/");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.clock.install();
  await page.getByLabel("Email sign-in code", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Verify code and sign in", exact: true })
    .click();
  await expect.poll(() => count).toBe(1);
  await page.clock.fastForward(16000);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Could not confirm sign-in yet",
  );
  await expect(
    page.getByLabel("Email sign-in code", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Verify code and sign in", exact: true }),
  ).toBeDisabled();
  expect(count).toBe(1);
  release();
});

test("an unresolved code verification keeps its account fixed until the SDK settles", async ({
  page,
}) => {
  let release!: () => void,
    requested = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${backendOrigin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/auth/v1/verify") {
      requested = true;
      await held;
      return route.fulfill({ json: session });
    }
    if (path === "/auth/v1/user") return route.fulfill({ json: session.user });
    if (path === "/rest/v1/items") return route.fulfill({ json: [] });
    return route.fulfill({ status: 400, json: {} });
  });
  await page.goto("/");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.clock.install();
  await page.getByLabel("Email sign-in code", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Verify code and sign in", exact: true })
    .click();
  await expect.poll(() => requested).toBe(true);
  await page.clock.fastForward(16000);
  await expect(
    page.getByLabel("Email address", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Email me a sign-in code", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Refresh",
  );
  release();
  await expect(
    page.getByRole("button", { name: "Add item", exact: true }),
  ).toBeVisible();
});

test("uncertain verification offers a deliberate reload without sending another email or retaining the code", async ({
  page,
}) => {
  let count = 0,
    release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${backendOrigin}/auth/v1/verify`, async (route) => {
    count++;
    await held;
    await route.fulfill({ status: 400, json: {} }).catch(() => {});
  });
  await page.goto("/");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.clock.install();
  await page.getByLabel("Email sign-in code", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Verify code and sign in", exact: true })
    .click();
  await expect.poll(() => count).toBe(1);
  await page.clock.fastForward(16000);
  await page
    .getByRole("button", { name: "Reload to check sign-in", exact: true })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeEnabled();
  await expect(
    page.getByLabel("Email sign-in code", { exact: true }),
  ).toHaveValue("");
  expect(count).toBe(1);
  release();
});
