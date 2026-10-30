import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("saves seller terms, preserves edited reply text and persists review settings", async ({
  page,
}) => {
  await page.goto("/inbox");
  await page.getByLabel("Buyer question").fill("Pickup options?");
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await page.getByRole("button", { name: "Prepare template draft" }).click();
  await page.getByRole("button", { name: "Approve saved reply" }).click();
  await page.getByLabel("Reply text").fill("Keep my unsaved reply.");
  await page.getByText("Seller terms and reminder", { exact: true }).click();
  await page.getByLabel("General pickup area").fill("Quezon City");
  await page
    .getByLabel("Payment methods and conditions")
    .fill("Cash on pickup");
  await page.getByLabel("Show a daily review reminder in this inbox").check();
  await page.getByLabel("Reminder time (Manila)").fill("00:00");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByText(/Preferences saved/)).toBeVisible();
  await expect(page.getByLabel("Reply text")).toHaveValue(
    "Keep my unsaved reply.",
  );
  await expect(
    page.getByRole("button", { name: "Copy approved reply" }),
  ).toBeDisabled();
  await expect(page.getByText("Your daily inbox review is due.")).toBeVisible();
  await page.getByRole("button", { name: "Mark summary reviewed" }).click();
  await expect(page.getByText("Your daily inbox review is due.")).toHaveCount(
    0,
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page.getByText("Seller terms and reminder", { exact: true }).click();
  await expect(page.getByLabel("General pickup area")).toHaveValue(
    "Quezon City",
  );
  await page.getByRole("button", { name: /Pickup options/ }).click();
  await page.getByRole("button", { name: "Prepare template draft" }).click();
  await expect(page.getByLabel("Reply text")).toHaveValue(/Quezon City/);
  await expect(page.getByLabel("Reply text")).toHaveValue(/Cash on pickup/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("stale preference writes retain typed edits and background inbox refresh does not overwrite them", async ({
  page,
  context,
}) => {
  await page.goto("/inbox");
  await page.getByText("Seller terms and reminder", { exact: true }).click();
  await page.getByLabel("General pickup area").fill("Keep my edit");
  const other = await context.newPage();
  await other.goto("/inbox");
  await other.getByText("Seller terms and reminder", { exact: true }).click();
  await other.getByLabel("General pickup area").fill("Saved elsewhere");
  await other
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(other.getByText(/Preferences saved/)).toBeVisible();
  await page.getByLabel("Buyer question").fill("Another question");
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review this question" }),
  ).toBeVisible();
  await expect(page.getByLabel("General pickup area")).toHaveValue(
    "Keep my edit",
  );
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Preferences changed/ }),
  ).toBeVisible();
  await expect(page.getByLabel("General pickup area")).toHaveValue(
    "Keep my edit",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Refresh summary and settings" })
    .click();
  await expect(page.getByLabel("General pickup area")).toHaveValue(
    "Keep my edit",
  );
});
