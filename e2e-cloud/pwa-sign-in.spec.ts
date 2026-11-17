import { test, expect, backendOrigin } from "./fixtures";
const token = "a".repeat(64);
const link = `${backendOrigin}/auth/v1/verify?token=${token}&type=magiclink&redirect_to=https://ignored.example.test`;
const session = {
  access_token: "synthetic-access",
  refresh_token: "synthetic-refresh",
  token_type: "bearer",
  expires_in: 3600,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "seller@example.test",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-11-15T00:00:00Z",
  },
};
test("an unused email link establishes a session in the current browser without visiting its redirect", async ({
  page,
}) => {
  let verifications = 0;
  await page.route(`${backendOrigin}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/auth/v1/verify") {
      verifications++;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toMatchObject({
        token_hash: token,
        type: "email",
      });
      return route.fulfill({ json: session });
    }
    if (path === "/auth/v1/user") return route.fulfill({ json: session.user });
    if (path === "/rest/v1/items") return route.fulfill({ json: [] });
    return route.fulfill({ status: 400, json: {} });
  });
  await page.goto("/");
  await page.getByText("Sign in inside this app", { exact: true }).click();
  await page.getByLabel("Unused sign-in link").fill(link);
  await page.getByRole("button", { name: "Sign in here", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add item", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Add item", exact: true }),
  ).toBeVisible();
  expect(verifications).toBe(1);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    token,
  );
});
test("unrelated links are rejected locally and expired links are cleared with recovery instructions", async ({
  page,
}) => {
  let verifications = 0;
  await page.route(`${backendOrigin}/auth/v1/verify`, (route) => {
    verifications++;
    return route.fulfill({
      status: 403,
      headers: {
        "x-supabase-api-version": "2024-01-01",
        "access-control-expose-headers": "x-supabase-api-version",
      },
      json: { code: "otp_expired", msg: "Private provider detail" },
    });
  });
  await page.goto("/");
  await page.getByText("Sign in inside this app", { exact: true }).click();
  const input = page.getByLabel("Unused sign-in link");
  await input.fill(
    link.replace(new URL(backendOrigin).hostname, "unrelated.example.test"),
  );
  await page.getByRole("button", { name: "Sign in here", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Copy the unused",
  );
  expect(verifications).toBe(0);
  await input.fill(link);
  await page.getByRole("button", { name: "Sign in here", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "expired or was already used",
  );
  await expect(input).toHaveValue("");
  expect(verifications).toBe(1);
  await expect(page.getByRole("main").getByRole("alert")).not.toContainText(
    "Private provider detail",
  );
});
test("a lost verification response releases the screen without a duplicate request", async ({
  page,
}) => {
  let requests = 0,
    release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${backendOrigin}/auth/v1/verify`, async (route) => {
    requests++;
    await held;
    await route.fulfill({ status: 503, json: {} }).catch(() => {});
  });
  await page.goto("/");
  await page.getByText("Sign in inside this app", { exact: true }).click();
  await page.clock.install();
  await page.getByLabel("Unused sign-in link").fill(link);
  await page.getByRole("button", { name: "Sign in here", exact: true }).click();
  await expect.poll(() => requests).toBe(1);
  await page.clock.fastForward(16_000);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Could not confirm sign-in yet",
  );
  await expect(
    page.getByRole("button", { name: "Sign in here", exact: true }),
  ).toBeDisabled();
  expect(requests).toBe(1);
  await expect(page.getByLabel("Unused sign-in link")).toHaveValue("");
  release();
});
