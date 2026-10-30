import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("simulate a routine reply once, persist it, and keep unknown outcomes frozen", async ({
  page,
  context,
}) => {
  await context.route("**/api/**", (route) => route.abort());
  await page.goto("/buyer-lab");
  await expect(
    page.getByRole("heading", { name: "Buyer reply lab" }),
  ).toBeVisible();
  await expect(page.getByLabel("Demo item")).toBeEnabled();
  await page.getByRole("button", { name: "Resume simulation" }).click();
  await page.getByLabel("Reply mode").selectOption("simulate");
  await page.getByRole("button", { name: "Add sample question" }).click();
  const card = page.getByRole("article").first();
  await expect(card.getByText("ready", { exact: true })).toBeVisible();
  await expect(card.getByLabel("Reply draft")).toHaveValue(/6,500.00/);
  await card
    .getByRole("button", { name: "Simulate delivery", exact: true })
    .click();
  await expect(card.getByText("simulated", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Simulated only — no buyer message was sent."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add sample question" }).click();
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "Simulate uncertain result" })
    .click();
  await expect(
    page.getByRole("article").first().getByText("unknown", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("article")
      .first()
      .getByRole("button", { name: "Simulate delivery", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("article").first().getByText("unknown", { exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("holds commitments for review and respects native reply ownership", async ({
  page,
}) => {
  await page.goto("/buyer-lab");
  await page
    .getByLabel("Sample question")
    .fill("Reserve it and accept 500 pesos");
  await page.getByRole("button", { name: "Add sample question" }).click();
  const card = page.getByRole("article").first();
  await expect(card.getByText("review", { exact: true })).toBeVisible();
  await expect(card.getByLabel("Reply draft")).toHaveValue("");
  await card
    .getByLabel("Reply draft")
    .fill("Let me check and get back to you.");
  await card
    .getByRole("button", { name: "Approve draft for simulation" })
    .click();
  await expect(card.getByText("ready", { exact: true })).toBeVisible();
  await card
    .getByRole("button", { name: "Simulate delivery", exact: true })
    .click();
  await expect(card.getByText("Simulation is paused.")).toBeVisible();
  await page.getByLabel("Facebook Marketplace native replies").click();
  await expect(
    page.getByLabel("Facebook Marketplace native replies"),
  ).toBeChecked();
  await card.getByRole("button", { name: "Process again" }).click();
  await expect(
    card.getByText("Native platform replies are managed outside this app."),
  ).toBeVisible();
});

test("two tabs cannot simulate the same question twice", async ({
  page,
  context,
}) => {
  await page.goto("/buyer-lab");
  await page.getByRole("button", { name: "Resume simulation" }).click();
  await page.getByLabel("Reply mode").selectOption("simulate");
  await page.getByRole("button", { name: "Add sample question" }).click();
  const other = await context.newPage();
  await other.goto("/buyer-lab");
  await expect(
    other.getByRole("article").first().getByText("ready", { exact: true }),
  ).toBeVisible();
  await Promise.all(
    [page, other].map((p) =>
      p.getByRole("button", { name: "Simulate delivery", exact: true }).click(),
    ),
  );
  // Click completion is not transaction completion; await both persisted results.
  await Promise.all(
    [page, other].map((p) =>
      expect(
        p.getByRole("article").getByText("simulated", { exact: true }),
      ).toBeVisible(),
    ),
  );
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    page.getByRole("article").getByText("simulated", { exact: true }),
  ).toBeVisible();
});

test("preserves unrelated draft edits", async ({ page }) => {
  await page.goto("/buyer-lab");
  await page.getByRole("button", { name: "Add sample question" }).click();
  await page
    .getByRole("article")
    .first()
    .getByLabel("Reply draft")
    .fill("First draft to keep");
  await page.getByRole("button", { name: "Add sample question" }).click();
  await expect(
    page.getByRole("article").nth(1).getByLabel("Reply draft"),
  ).toHaveValue("First draft to keep");
  await page
    .getByRole("article")
    .first()
    .getByLabel("Reply draft")
    .fill("Second draft");
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "Approve draft for simulation" })
    .click();
  await expect(
    page.getByRole("article").nth(1).getByLabel("Reply draft"),
  ).toHaveValue("First draft to keep");
});

test("stale tabs must review changed reply text before delivery", async ({
  page,
  context,
}) => {
  await page.goto("/buyer-lab");
  await page.getByRole("button", { name: "Resume simulation" }).click();
  await page.getByLabel("Reply mode").selectOption("simulate");
  await page.getByRole("button", { name: "Add sample question" }).click();
  const other = await context.newPage();
  await other.goto("/buyer-lab");
  await other
    .getByLabel("Reply draft")
    .fill("Please check the listing details.");
  await other
    .getByRole("button", { name: "Approve draft for simulation" })
    .click();
  await expect(other.getByLabel("Reply draft")).toHaveValue(
    "Please check the listing details.",
  );
  await expect(
    other.getByText("You approved this exact text for simulation."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate delivery", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed" }),
  ).toBeVisible();
  await expect(page.getByLabel("Reply draft")).toHaveValue(
    "Please check the listing details.",
  );
  await expect(
    page.getByRole("article").getByText("ready", { exact: true }),
  ).toBeVisible();
});

test("completed outcomes show the actual reply rather than another tab's unsaved edit", async ({
  page,
  context,
}) => {
  await page.goto("/buyer-lab");
  await page.getByRole("button", { name: "Resume simulation" }).click();
  await page.getByLabel("Reply mode").selectOption("simulate");
  await page.getByRole("button", { name: "Add sample question" }).click();
  const other = await context.newPage();
  await other.goto("/buyer-lab");
  await page.getByLabel("Reply draft").fill("Unsaved edit in first tab");
  await other.getByLabel("Reply draft").fill("Actual simulated response");
  await other
    .getByRole("button", { name: "Approve draft for simulation" })
    .click();
  await expect(
    other.getByText("You approved this exact text for simulation."),
  ).toBeVisible();
  await other
    .getByRole("button", { name: "Simulate delivery", exact: true })
    .click();
  await expect(other.getByText("simulated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add sample question" }).click();
  await expect(
    page.getByRole("article").nth(1).getByText("simulated", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article").nth(1).getByLabel("Reply draft"),
  ).toHaveValue("Actual simulated response");
});
