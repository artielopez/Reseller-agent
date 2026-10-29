import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function question(page: import("@playwright/test").Page) {
  await page.goto("/inbox");
  await page.getByLabel("Buyer question").fill("How much?");
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review this question" }),
  ).toBeVisible();
}
test("records, reviews, copies and separately marks an inquiry answered", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copied: string }).copied = text;
        },
      },
    });
  });
  await question(page);
  await page.getByRole("button", { name: "Prepare template draft" }).click();
  await expect(page.getByLabel("Reply text")).toHaveValue(/6,500.00/);
  await page.getByRole("button", { name: "Approve saved reply" }).click();
  await page.getByRole("button", { name: "Copy approved reply" }).click();
  await expect(
    page.getByText("Copied. Send it yourself on the original platform."),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { copied: string }).copied),
  ).toContain("6,500.00");
  await expect(
    page.getByText("Question status: Open", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark answered" }).click();
  await expect(
    page.getByText("Question status: Answered", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /How much/ }).click();
  await expect(
    page.getByText("Question status: Answered", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("requires new review after another tab changes item facts and offers clipboard fallback", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await question(page);
  await page.getByRole("button", { name: "Prepare template draft" }).click();
  await page.getByRole("button", { name: "Approve saved reply" }).click();
  const other = await context.newPage();
  await other.goto("/");
  await other
    .getByRole("button", { name: "Edit Sony WH-1000XM4 headphones" })
    .click();
  await other.getByLabel("Price (PHP)").fill("7000");
  await other.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    other.getByRole("heading", { name: "Your inventory" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy approved reply" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /changed|fresh/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reload inbox" }).click();
  await page.getByRole("button", { name: /How much/ }).click();
  await page.getByRole("button", { name: "Prepare template draft" }).click();
  await expect(page.getByLabel("Reply text")).toHaveValue(/7,000.00/);
  await page.getByRole("button", { name: "Approve saved reply" }).click();
  await page.getByRole("button", { name: "Copy approved reply" }).click();
  await expect(page.getByLabel("Approved text to copy manually")).toHaveValue(
    /7,000.00/,
  );
  await expect(
    page.getByText("Question status: Open", { exact: true }),
  ).toBeVisible();
});

test("labels public comments and preserves version-one demo inventory during upgrade", async ({
  page,
}) => {
  await page.goto("/missing-upgrade-fixture");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("reseller-agent-demo", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("inventory");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("inventory", "readwrite");
      tx.objectStore("inventory").put(
        [
          {
            id: "33333333-3333-4333-8333-333333333333",
            title: "Preserved lamp",
            description: "Private delivery instructions must not be public.",
            price: 850,
            condition: "Good",
            category: "Other",
            status: "Listed",
            updatedAt: new Date().toISOString(),
            photos: [],
            listings: ["carousell", "marketplace", "groups"].map((channel) => ({
              channel,
              title: "Lamp",
              description: "",
              status: "Not posted",
              url: "",
            })),
          },
        ],
        "items",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto("/inbox");
  await expect(page.getByLabel("Saved item")).toContainText("Preserved lamp");
  await page
    .getByRole("combobox", { name: "Channel", exact: true })
    .selectOption("groups");
  await page.getByLabel("Question location").selectOption("group_comment");
  await page.getByLabel("Buyer question").fill("Price?");
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await expect(
    page.getByText("Facebook Groups · Public group comment", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Prepare template draft" }).click();
  await expect(page.getByLabel("Reply text")).toHaveValue(
    "The asking price is ₱850.00.",
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Edit Preserved lamp" }),
  ).toBeVisible();
});

test("preserves written drafts during other saves and protects unsaved saved-reply edits", async ({
  page,
}) => {
  await question(page);
  await page.getByRole("button", { name: "Prepare template draft" }).click();
  await page.getByLabel("Write a new reply").fill("Keep my new draft.");
  await page.getByRole("button", { name: "Approve saved reply" }).click();
  await expect(page.getByText(/Reply status: Approved/)).toBeVisible();
  await expect(page.getByLabel("Write a new reply")).toHaveValue(
    "Keep my new draft.",
  );
  await page.getByLabel("Write a new reply").fill("");
  await page.getByLabel("Reply text").fill("Keep my unsaved edit.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Reload inbox" }).click();
  await expect(page.getByLabel("Reply text")).toHaveValue(
    "Keep my unsaved edit.",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: /How much/ }).click();
  await expect(page.getByLabel("Reply text")).toHaveValue(
    "Keep my unsaved edit.",
  );
});
