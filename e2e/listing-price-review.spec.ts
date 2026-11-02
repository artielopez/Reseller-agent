import { expect, test } from "@playwright/test";

test("warns about old prices after reload without replacing edited channel copy", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item title").fill("Price review lamp");
  await page.getByLabel("Price (PHP)").fill("850");
  await page.getByRole("button", { name: "Generate listing copy" }).click();
  await expect(page.getByLabel("Carousell description")).toHaveValue(/₱850/);
  await page
    .getByLabel("Carousell description")
    .fill("My edited copy. Price: ₱850.00");
  await page.getByLabel("Price (PHP)").fill("900");
  const review = page.getByRole("status", { name: "Listing price review" });
  await expect(review).toContainText("Current asking price: ₱900.00");
  await expect(review).toContainText("Check the amounts in this copy");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your inventory" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Edit Price review lamp", exact: true })
    .click();
  await expect(review).toContainText("Check the amounts in this copy");
  await expect(page.getByLabel("Carousell description")).toHaveValue(
    "My edited copy. Price: ₱850.00",
  );
  await page
    .getByLabel("Carousell description")
    .fill("My edited copy. Price: ₱900.00");
  await expect(review).not.toContainText("Check the amounts in this copy");
  for (const channel of ["Marketplace", "Groups"]) {
    await page.getByRole("tab", { name: channel, exact: true }).click();
    await expect(review).toContainText("Check the amounts in this copy");
  }
});
