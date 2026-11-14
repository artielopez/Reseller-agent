import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("dashboard and editor have no automated WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Edit Oak bedside table" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("keyboard focus follows opening and cancelling a new item", async ({
  page,
}) => {
  await page.goto("/");
  const add = page.getByRole("button", { name: "Add item", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Give it a second life." }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Inventory", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /A little space/ }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(add).toBeFocused();
});

test("keyboard focus returns to the dashboard after saving an item", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Edit Oak bedside table" }).click();
  await page.getByRole("button", { name: "Save item", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /A little space/ }),
  ).toBeFocused();
});
