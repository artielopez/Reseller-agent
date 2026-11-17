import { test, expect, type Page } from "@playwright/test";
async function openItem(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Edit Everyday canvas tote" }).click();
  await page
    .getByLabel("Carousell title", { exact: true })
    .fill("Reviewed tote title");
  await page
    .getByRole("textbox", { name: "Carousell description", exact: true })
    .fill("Reviewed description. PHP 450.");
}
test("a stalled listing clipboard offers one selectable full post and withdraws it after editing", async ({
  page,
}) => {
  await openItem(page);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => new Promise(() => {}) },
    }),
  );
  await page.clock.install();
  await page.getByRole("button", { name: "Copy post", exact: true }).click();
  await page.clock.fastForward(3001);
  const manual = page.getByRole("textbox", { name: "Copy listing manually", exact: true });
  await expect(manual).toHaveValue(
    "Reviewed tote title\n\nReviewed description. PHP 450.",
  );
  await manual.focus();
  expect(
    await manual.evaluate(
      (el) =>
        (el as HTMLTextAreaElement).selectionEnd -
        (el as HTMLTextAreaElement).selectionStart,
    ),
  ).toBe("Reviewed tote title\n\nReviewed description. PHP 450.".length);
  await page
    .getByRole("textbox", { name: "Carousell description", exact: true })
    .fill("Changed description");
  await expect(manual).toHaveCount(0);
});
for (const change of ["edit", "channel"] as const) {
  test(`a late listing clipboard completion cannot claim success after ${change}`, async ({
    page,
  }) => {
    await openItem(page);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: () =>
            new Promise<void>((resolve) => {
              (window as unknown as { releaseCopy: () => void }).releaseCopy =
                resolve;
            }),
        },
      });
    });
    await page.getByRole("button", { name: "Copy post", exact: true }).click();
    if (change === "edit")
      await page
        .getByLabel("Carousell title", { exact: true })
        .fill("New title not copied");
    else
      await page.getByRole("tab", { name: "Marketplace", exact: true }).click();
    await page.evaluate(() =>
      (window as unknown as { releaseCopy: () => void }).releaseCopy(),
    );
    await expect(
      page.getByText(
        "Copied. Paste into your listing, then save its URL here after posting.",
        { exact: true },
      ),
    ).toHaveCount(0);
  });
}
