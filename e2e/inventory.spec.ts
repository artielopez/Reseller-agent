import { test, expect } from "@playwright/test";
test("demo generation works without a backend or paid API", async ({
  page,
}) => {
  let apiRequests = 0;
  await page.route("**/api/**", async (route) => {
    apiRequests++;
    await route.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item title").fill("Offline demo lamp");
  await page.getByLabel("Price (PHP)").fill("850");
  await page.getByLabel("Description & known flaws").fill("Scratch on base.");
  await page.getByRole("button", { name: "Generate listing copy" }).click();
  await expect(page.getByLabel("Carousell description")).toHaveValue(
    /Scratch on base/,
  );
  await expect(
    page.getByText(/Template drafts are ready — no AI was used/),
  ).toBeVisible();
  expect(apiRequests).toBe(0);
});
test("create, draft channel copy, track publication, and keep inventory after reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Demo mode", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item title").fill("Reading lamp");
  await page.getByLabel("Price (PHP)").fill("850");
  await page
    .getByRole("combobox", { name: "Condition", exact: true })
    .selectOption("Good");
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Home & living");
  await page
    .getByLabel("Description & known flaws")
    .fill("Brass lamp. Small mark on the base.");
  await page.getByLabel("Upload photos").setInputFiles(
    [1, 2].map((index) => ({
      name: `lamp-${index}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    })),
  );
  await expect(page.getByRole("img", { name: "Item photo 1" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Item photo 2" })).toBeVisible();
  await page.getByRole("button", { name: "Generate listing copy" }).click();
  await expect(page.getByLabel("Carousell description")).toHaveValue(
    /Small mark on the base\./,
  );
  await page
    .getByLabel("Carousell description")
    .fill("Reading lamp — brass, with a small mark on the base. ₱850.");
  await page.getByLabel("Inventory status").selectOption("Listed");
  await page
    .getByLabel("Carousell listing URL")
    .fill("https://www.carousell.ph/p/reading-lamp-123/");
  await page
    .getByLabel("Carousell publication status")
    .selectOption("Published");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your inventory" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Edit Reading lamp/ }).click();
  await expect(page.getByLabel("Inventory status")).toHaveValue("Listed");
  await expect(page.getByLabel("Carousell description")).toHaveValue(
    "Reading lamp — brass, with a small mark on the base. ₱850.",
  );
  await expect(page.getByRole("img", { name: "Item photo 1" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Item photo 2" })).toBeVisible();
  await page.getByLabel("Inventory status").selectOption("Sold");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await page.getByRole("button", { name: "Sold", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Edit Reading lamp/ }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
});
test("invalid prices cannot be saved and search has an empty state", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("searchbox", { name: "Search inventory" })
    .fill("no-such-item");
  await expect(page.getByText("No matching items")).toBeVisible();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item title").fill("Invalid item");
  await page.getByLabel("Price (PHP)").fill("-20");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByLabel("Price (PHP)")).toBeVisible();
});

test("copies edited channel text and keeps publication tracking independent", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "Edit Everyday canvas tote" }).click();
  await page.getByRole("tab", { name: "Carousell", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Marketplace", exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Facebook Marketplace title", { exact: true })
    .fill("Canvas tote, gently used");
  await page
    .getByRole("textbox", {
      name: "Facebook Marketplace description",
      exact: true,
    })
    .fill("No stains. PHP 450.");
  await page.getByRole("button", { name: "Copy post", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Canvas tote, gently used\n\nNo stains. PHP 450.",
  );
  await expect(
    page.getByRole("combobox", {
      name: "Facebook Marketplace publication status",
      exact: true,
    }),
  ).toHaveValue("Not posted");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await page.getByRole("button", { name: "Edit Everyday canvas tote" }).click();
  await expect(page.getByLabel("Carousell title", { exact: true })).toHaveValue(
    "Everyday canvas tote",
  );
  await page.getByRole("tab", { name: "Marketplace", exact: true }).click();
  await expect(
    page.getByLabel("Facebook Marketplace title", { exact: true }),
  ).toHaveValue("Canvas tote, gently used");
});

test("removing photos persists and unsaved changes require confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Edit Oak bedside table" }).click();
  await page.getByRole("button", { name: "Remove photo 1" }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(page.getByLabel("Item title")).toBeVisible();
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your inventory" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit Oak bedside table" }).click();
  await expect(page.getByRole("img", { name: "Item photo 1" })).toHaveCount(0);
});

test("inventory navigation preserves edits until discard is confirmed", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Edit Oak bedside table" }).click();
  await page.getByLabel("Item title").fill("Unsaved title");
  await expect(
    page.getByRole("link", { name: "Try buyer replies" }),
  ).toHaveCount(0);
  const back = isMobile
    ? page.getByRole("button", { name: "Inventory", exact: true })
    : page.getByRole("link", { name: /^Inventory/ });
  page.once("dialog", (dialog) => dialog.dismiss());
  await back.click();
  await expect(page.getByLabel("Item title")).toHaveValue("Unsaved title");
  page.removeAllListeners("dialog");
  page.once("dialog", (dialog) => dialog.accept());
  await back.click();
  await expect(
    page.getByRole("heading", { name: "Your inventory" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Oak bedside table" }),
  ).toBeVisible();
});
