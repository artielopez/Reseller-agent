import AxeBuilder from "@axe-core/playwright";
import { test, expect, backendOrigin } from "./fixtures";

test("email-code sign-in and its recovery guidance have no automated WCAG A/AA violations", async ({
  page,
}) => {
  await page.route(`${backendOrigin}/auth/v1/verify`, (route) =>
    route.fulfill({
      status: 403,
      headers: {
        "x-supabase-api-version": "2024-01-01",
        "access-control-expose-headers": "x-supabase-api-version",
      },
      json: { code: "otp_expired" },
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("seller@example.test");
  await expect(
    page.getByLabel("Email sign-in code", { exact: true }),
  ).toHaveAttribute("autocomplete", "one-time-code");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByLabel("Email sign-in code", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Verify code and sign in", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Request a new code",
  );
  await page.getByText("Sign in inside this app", { exact: true }).click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
