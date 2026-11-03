import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const owner = "11111111-1111-4111-8111-111111111111";
const question = "22222222-2222-4222-8222-222222222222";
const worker = "33333333-3333-4333-8333-333333333333";
const token = "a".repeat(64); // Synthetic test key, never a real credential.
const timestamp = "2026-10-30T12:00:00+00:00";
function session(id = owner) {
  return {
    access_token: "synthetic-access",
    refresh_token: "synthetic-refresh",
    token_type: "bearer",
    expires_at: 4102444800,
    expires_in: 3600,
    user: {
      id,
      aud: "authenticated",
      role: "authenticated",
      email: "seller@example.test",
      app_metadata: {},
      user_metadata: {},
      created_at: timestamp,
    },
  };
}
async function fixture(page: Page) {
  let paused = true,
    revision = 1,
    failEnrollment = false,
    failEnqueue: "before" | "after" | null = null,
    stalePause = false;
  let enqueueDelay: Promise<void> | null = null;
  let releaseEnqueue: (() => void) | null = null;
  const workers: Record<string, unknown>[] = [],
    jobs: Record<string, unknown>[] = [],
    operations: string[] = [],
    queuedIds: string[] = [];
  await page.addInitScript(
    (saved) =>
      localStorage.setItem(
        "sb-reseller-test-auth-token",
        JSON.stringify(saved),
      ),
    session(),
  );
  await page.route("https://reseller-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const respond = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname === "/auth/v1/logout") return respond({});
    if (url.pathname === "/auth/v1/user") return respond(session().user);
    if (url.pathname === "/rest/v1/items") return respond([]);
    if (url.pathname === "/rest/v1/rpc/seller_workspace")
      return respond({
        preferences: {
          revision: "0",
          terms_revision: "0",
          pickup_area: "",
          delivery_notes: "",
          payment_notes: "",
          digest_enabled: false,
          digest_time: "09:00",
          last_reviewed_at: null,
        },
        summary: {
          total: 0,
          open: 0,
          ready: 0,
          needs_review: 0,
          received: 0,
          since: timestamp,
          as_of: timestamp,
        },
      });
    if (
      url.pathname === "/rest/v1/rpc/buyer_workspace" &&
      route.request().postDataJSON().command.op === "get"
    ) {
      const inquiry = {
        id: question,
        item_id: "44444444-4444-4444-8444-444444444444",
        channel: "marketplace",
        surface: "dm",
        buyer_name: "Synthetic buyer",
        message: "Is this available?",
        status: "Open",
        received_at: timestamp,
        updated_at: timestamp,
        revision: "1",
      };
      const context = {
        inquiry_id: question,
        inquiry_revision: "1",
        item_revision: "1",
        channel: "marketplace",
        surface: "dm",
        message: inquiry.message,
        item: {
          id: inquiry.item_id,
          title: "Synthetic lamp",
          description: "Test only",
          price: 900,
          category: "Home & living",
          condition: "Good",
          status: "Listed",
        },
      };
      return respond({
        inquiry,
        context,
        replies: jobs.some((j) => j.status === "completed")
          ? [
              {
                id: "88888888-8888-4888-8888-888888888888",
                inquiry_id: question,
                body: "Synthetic review draft",
                source: "agent",
                review_note: "Confirm availability",
                status: "Draft",
                revision: "1",
                context,
                created_at: timestamp,
                updated_at: timestamp,
                approved_at: null,
              },
            ]
          : [],
      });
    }
    if (url.pathname === "/rest/v1/rpc/buyer_workspace")
      return respond([
        {
          id: question,
          item_id: "44444444-4444-4444-8444-444444444444",
          channel: "marketplace",
          surface: "dm",
          buyer_name: "Synthetic buyer",
          message: "Is this available?",
          status: "Open",
          received_at: timestamp,
          updated_at: timestamp,
          revision: "1",
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          item_id: "44444444-4444-4444-8444-444444444444",
          channel: "groups",
          surface: "group_comment",
          buyer_name: "",
          message: "Public comment",
          status: "Open",
          received_at: timestamp,
          updated_at: timestamp,
          revision: "1",
        },
      ]);
    if (url.pathname !== "/rest/v1/rpc/draft_queue")
      return respond({ message: "Unexpected fixture request" }, 400);
    const c = route.request().postDataJSON().command;
    operations.push(c.op);
    if (c.op === "list")
      return respond({ paused, revision: String(revision), workers, jobs });
    if (c.op === "enroll") {
      const workerId = workers.length
        ? "77777777-7777-4777-8777-777777777777"
        : worker;
      workers.push({
        id: workerId,
        label: c.label,
        expires_at: "2099-01-01T00:00:00+00:00",
        revoked_at: null,
        last_seen_at: null,
      });
      if (failEnrollment)
        return respond(
          { code: "XX000", message: "internal secret should never display" },
          500,
        );
      return respond({
        id: workerId,
        token,
        expires_at: "2099-01-01T00:00:00+00:00",
      });
    }
    if (c.op === "pause") {
      if (stalePause || c.expected_revision !== String(revision)) {
        stalePause = false;
        revision++;
        return respond({ code: "PT409" }, 409);
      }
      paused = c.paused;
      revision++;
      if (paused)
        for (const j of jobs)
          if (["queued", "leased"].includes(String(j.status)))
            j.status = "canceled";
      return respond({ paused, revision: String(revision) });
    }
    if (c.op === "revoke") {
      workers[0].revoked_at = timestamp;
      return respond({ revoked: true });
    }
    if (c.op === "enqueue") {
      queuedIds.push(c.id);
      if (failEnqueue === "before") {
        failEnqueue = null;
        return respond({ code: "XX000" }, 500);
      }
      if (c.inquiry_id !== question) return respond({ code: "P0002" }, 400);
      jobs.push({
        id: c.id,
        inquiry_id: question,
        status: "queued",
        reason: null,
        worker_id: null,
        lease_expires_at: null,
        attempt_started: false,
        reply_id: null,
        created_at: timestamp,
        updated_at: timestamp,
      });
      if (failEnqueue === "after") {
        failEnqueue = null;
        return respond({ code: "XX000" }, 500);
      }
      if (enqueueDelay) await enqueueDelay;
      return respond({ id: c.id, status: "queued" });
    }
    if (c.op === "cancel") {
      jobs[0].status = "canceled";
      return respond({ canceled: true });
    }
    return respond({}, 400);
  });
  await page.goto("/inbox");
  await expect(
    page.getByRole("heading", { name: "Record a buyer question" }),
  ).toBeVisible();
  return {
    operations,
    queuedIds,
    holdEnqueue: () => {
      enqueueDelay = new Promise<void>((resolve) => {
        releaseEnqueue = resolve;
      });
    },
    releaseEnqueue: () => {
      releaseEnqueue?.();
      enqueueDelay = null;
    },
    failEnqueue: (when: "before" | "after") => {
      failEnqueue = when;
    },
    enable: () => {
      paused = false;
    },
    complete: () => {
      jobs[0].status = "completed";
    },
    failEnrollment: () => {
      failEnrollment = true;
    },
    stalePause: () => {
      stalePause = true;
    },
  };
}
test("owner can enroll, hide a key, queue a private question, cancel and revoke", async ({
  page,
}) => {
  const state = await fixture(page);
  await page
    .getByRole("button", { name: "Worker settings", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Draft worker controls" });
  await expect(
    panel.getByText("Drafting is paused.", { exact: true }),
  ).toBeVisible();
  await panel.getByLabel("Worker name").fill("Mac mini draft worker");
  await panel.getByRole("button", { name: "Create worker key" }).click();
  await expect(panel.getByLabel("One-time worker key")).toHaveValue(token);
  await panel.getByRole("button", { name: "Hide worker key" }).click();
  await expect(panel.getByLabel("One-time worker key")).toHaveCount(0);
  await panel.getByRole("button", { name: "Resume drafting" }).click();
  await panel.getByLabel("Private question to draft").selectOption(question);
  await expect(
    panel.getByLabel("Private question to draft").locator("option"),
  ).toHaveCount(2);
  await panel.getByRole("button", { name: "Queue draft" }).click();
  await expect(panel.getByText("queued", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Cancel job", exact: true }).click();
  await expect(panel.getByText("canceled", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Queue draft" }).click();
  await expect(panel.getByText("queued", { exact: true })).toBeVisible();
  await panel
    .getByRole("button", { name: "Pause drafting and cancel jobs" })
    .click();
  await expect(panel.getByText("canceled", { exact: true })).toHaveCount(2);
  await expect(
    panel.getByRole("button", { name: "Queue draft" }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "Resume drafting" }).click();
  await expect(panel.getByText("canceled", { exact: true })).toHaveCount(2);
  await panel
    .getByRole("button", { name: "Revoke Mac mini draft worker" })
    .click();
  await expect(panel.getByText("Revoked", { exact: true })).toBeVisible();
  expect(state.operations.filter((op) => op === "enroll")).toHaveLength(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    token,
  );
});

test("saved question offers a guarded draft request and preserves edits while loading replies", async ({
  page,
}) => {
  const state = await fixture(page);
  await page
    .getByRole("button", {
      name: "Is this available? · Open · Facebook Marketplace",
      exact: true,
    })
    .click();
  const panel = page.getByRole("region", {
    name: "AI draft for this question",
  });
  await expect(
    panel.getByText("Drafting is paused", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Request AI draft", exact: true }),
  ).toBeDisabled();
  state.enable();
  await panel.getByRole("button", { name: "Refresh draft status" }).click();
  await page
    .getByRole("textbox", { name: "Buyer question", exact: true })
    .fill("Keep unrelated unsaved question");
  await panel
    .getByRole("button", { name: "Request AI draft", exact: true })
    .click();
  await expect(
    panel.getByText("Job status: queued", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Request AI draft", exact: true }),
  ).toBeDisabled();
  expect(state.operations.filter((op) => op === "enqueue")).toHaveLength(1);
  state.complete();
  await panel.getByRole("button", { name: "Refresh draft status" }).click();
  await expect(panel.getByText(/Draft saved for your review/)).toBeVisible();
  await page.getByLabel("Write a new reply").fill("Unsaved reply");
  page.once("dialog", (dialog) => dialog.dismiss());
  await panel.getByRole("button", { name: "Load saved replies" }).click();
  await expect(page.getByLabel("Write a new reply")).toHaveValue(
    "Unsaved reply",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await panel.getByRole("button", { name: "Load saved replies" }).click();
  await expect(page.getByLabel("Write a new reply")).toHaveValue("");
  await expect(
    page.getByRole("textbox", { name: "Buyer question", exact: true }),
  ).toHaveValue("Keep unrelated unsaved question");
  await expect(page.getByLabel("Reply text")).toHaveValue(
    "Synthetic review draft",
  );
  await page.getByLabel("Reply text").fill("Unsaved change to saved reply");
  page.once("dialog", (dialog) => dialog.accept());
  await panel.getByRole("button", { name: "Load saved replies" }).click();
  await expect(page.getByLabel("Reply text")).toHaveValue(
    "Synthetic review draft",
  );
  await expect(
    page.getByRole("button", { name: "Copy approved reply" }),
  ).toBeDisabled();
  expect(state.operations.filter((op) => op === "enqueue")).toHaveLength(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("uncertain enrollment requires reload and never leaks server details or loses question text", async ({
  page,
}) => {
  const state = await fixture(page);
  state.failEnrollment();
  await page.getByLabel("Buyer question").fill("Keep my unsaved question");
  await page
    .getByRole("button", { name: "Worker settings", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Draft worker controls" });
  await panel.getByLabel("Worker name").fill("Uncertain worker");
  await panel.getByRole("button", { name: "Create worker key" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "Reload worker settings",
  );
  await expect(
    panel.getByRole("button", { name: "Create worker key" }),
  ).toBeDisabled();
  await expect(
    page.getByText("internal secret should never display"),
  ).toHaveCount(0);
  await panel.getByRole("button", { name: "Reload worker settings" }).click();
  await expect(
    panel.getByRole("button", { name: "Revoke Uncertain worker" }),
  ).toBeVisible();
  await expect(page.getByLabel("Buyer question")).toHaveValue(
    "Keep my unsaved question",
  );
  expect(state.operations.filter((op) => op === "enroll")).toHaveLength(1);
});
test("stale pause fails closed and closing or switching account clears the key", async ({
  page,
}) => {
  const state = await fixture(page);
  await page
    .getByRole("button", { name: "Worker settings", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Draft worker controls" });
  await panel.getByLabel("Worker name").fill("First worker");
  await panel.getByRole("button", { name: "Create worker key" }).click();
  await expect(panel.getByLabel("One-time worker key")).toHaveValue(token);
  await page.getByRole("button", { name: "Close worker settings" }).click();
  await page
    .getByRole("button", { name: "Worker settings", exact: true })
    .click();
  await expect(panel.getByLabel("One-time worker key")).toHaveCount(0);
  state.stalePause();
  await panel.getByRole("button", { name: "Resume drafting" }).click();
  await expect(panel.getByRole("alert")).toContainText("changed");
  await expect(
    panel.getByRole("button", { name: "Resume drafting" }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "Reload worker settings" }).click();
  await panel.getByLabel("Worker name").fill("Second worker");
  await panel.getByRole("button", { name: "Create worker key" }).click();
  await expect(panel.getByLabel("One-time worker key")).toHaveValue(token);
  await page.evaluate((saved) => {
    localStorage.setItem("sb-reseller-test-auth-token", JSON.stringify(saved));
    const channel = new BroadcastChannel("sb-reseller-test-auth-token");
    channel.postMessage({ event: "SIGNED_IN", session: saved });
    channel.close();
  }, session("66666666-6666-4666-8666-666666666666"));
  await expect(page.getByLabel("One-time worker key")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Worker settings", exact: true }),
  ).toBeVisible();
});

test("late enrollment cannot reveal a previous account's key", async ({
  page,
}) => {
  await fixture(page);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const requested = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route("**/rest/v1/rpc/draft_queue", async (route) => {
    if (route.request().postDataJSON().command.op !== "enroll")
      return route.fallback();
    entered();
    await wait;
    await route.fulfill({
      json: { id: worker, token, expires_at: "2099-01-01T00:00:00Z" },
    });
  });
  await page
    .getByRole("button", { name: "Worker settings", exact: true })
    .click();
  await page.getByLabel("Worker name").fill("Slow enrollment");
  await page.getByRole("button", { name: "Create worker key" }).click();
  await requested;
  await page.evaluate((saved) => {
    localStorage.setItem("sb-reseller-test-auth-token", JSON.stringify(saved));
    const channel = new BroadcastChannel("sb-reseller-test-auth-token");
    channel.postMessage({ event: "SIGNED_IN", session: saved });
    channel.close();
  }, session("66666666-6666-4666-8666-666666666666"));
  await expect(
    page.getByRole("button", { name: "Worker settings", exact: true }),
  ).toBeVisible();
  const response = page.waitForResponse("**/rest/v1/rpc/draft_queue");
  release();
  await response;
  await page
    .getByRole("button", { name: "Worker settings", exact: true })
    .click();
  await expect(page.getByText("No workers enrolled.")).toBeVisible();
  await expect(page.getByLabel("One-time worker key")).toHaveCount(0);
});

test("preference edits protect sign-out and late saves cannot enter the next account", async ({
  page,
}) => {
  await fixture(page);
  await page.getByText("Seller terms and reminder", { exact: true }).click();
  await page.getByLabel("General pickup area").fill("Private old account term");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("General pickup area")).toHaveValue(
    "Private old account term",
  );
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>((resolve) => (release = resolve)),
    requested = new Promise<void>((resolve) => (entered = resolve));
  await page.route("**/rest/v1/rpc/seller_workspace", async (route) => {
    const command = route.request().postDataJSON().command;
    if (command.op !== "save") return route.fallback();
    entered();
    await wait;
    await route.fulfill({
      json: {
        preferences: {
          ...command.input,
          revision: "1",
          terms_revision: "1",
          last_reviewed_at: null,
        },
        summary: {
          total: 0,
          open: 0,
          ready: 0,
          needs_review: 0,
          received: 0,
          since: timestamp,
          as_of: timestamp,
        },
      },
    });
  });
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await requested;
  await page.evaluate((saved) => {
    localStorage.setItem("sb-reseller-test-auth-token", JSON.stringify(saved));
    const channel = new BroadcastChannel("sb-reseller-test-auth-token");
    channel.postMessage({ event: "SIGNED_IN", session: saved });
    channel.close();
  }, session("66666666-6666-4666-8666-666666666666"));
  await expect(page.getByLabel("General pickup area")).not.toBeVisible();
  await page.getByText("Seller terms and reminder", { exact: true }).click();
  await expect(page.getByLabel("General pickup area")).toHaveValue("");
  const response = page.waitForResponse("**/rest/v1/rpc/seller_workspace");
  release();
  await response;
  await expect(page.getByLabel("General pickup area")).toHaveValue("");
  await expect(page.getByText(/Preferences saved/)).toHaveCount(0);
});

for (const when of ["before", "after"] as const) {
  test(`uncertain inline enqueue ${when} commit requires refresh and keeps request identity`, async ({
    page,
  }) => {
    const state = await fixture(page);
    state.enable();
    state.failEnqueue(when);
    await page
      .getByRole("button", {
        name: "Is this available? · Open · Facebook Marketplace",
        exact: true,
      })
      .click();
    const panel = page.getByRole("region", {
      name: "AI draft for this question",
    });
    await panel
      .getByRole("button", { name: "Request AI draft", exact: true })
      .click();
    await expect(panel.getByRole("alert")).toContainText(
      "Refresh draft status",
    );
    await expect(
      panel.getByRole("button", { name: "Request AI draft", exact: true }),
    ).toBeDisabled();
    expect(state.queuedIds).toHaveLength(1);
    await panel.getByRole("button", { name: "Refresh draft status" }).click();
    if (when === "before") {
      await panel
        .getByRole("button", { name: "Request AI draft", exact: true })
        .click();
      await expect(
        panel.getByText("Job status: queued", { exact: true }),
      ).toBeVisible();
      expect(state.queuedIds).toEqual([state.queuedIds[0], state.queuedIds[0]]);
    } else {
      await expect(
        panel.getByRole("button", { name: "Request AI draft", exact: true }),
      ).toBeDisabled();
      expect(state.queuedIds).toHaveLength(1);
    }
  });
}

test("late draft status cannot enter the next signed-in workspace", async ({
  page,
}) => {
  await fixture(page);
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (entered = resolve));
  await page.route("**/rest/v1/rpc/draft_queue", async (route) => {
    entered();
    await wait;
    await route.fulfill({
      json: { paused: false, revision: "1", workers: [], jobs: [] },
    });
  });
  await page
    .getByRole("button", {
      name: "Is this available? · Open · Facebook Marketplace",
      exact: true,
    })
    .click();
  await requested;
  await page.evaluate((saved) => {
    localStorage.setItem("sb-reseller-test-auth-token", JSON.stringify(saved));
    const channel = new BroadcastChannel("sb-reseller-test-auth-token");
    channel.postMessage({ event: "SIGNED_IN", session: saved });
    channel.close();
  }, session("66666666-6666-4666-8666-666666666666"));
  await expect(
    page.getByRole("region", { name: "AI draft for this question" }),
  ).toHaveCount(0);
  const response = page.waitForResponse("**/rest/v1/rpc/draft_queue");
  release();
  await response;
  await expect(
    page.getByRole("region", { name: "AI draft for this question" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("No active worker key", { exact: true }),
  ).toHaveCount(0);
});

test("privacy preview is explicit, read-only and clears when the account changes", async ({
  page,
}) => {
  await fixture(page);
  const windows: number[] = [];
  await page.route(
    "**/rest/v1/rpc/workspace_privacy_preview",
    async (route) => {
      const days = route.request().postDataJSON().window_days;
      windows.push(days);
      await route.fulfill({
        json: {
          as_of: timestamp,
          cutoff: "2026-09-30T12:00:00Z",
          window_days: days,
          items: 2,
          photo_references: 8,
          photo_objects: 9,
          questions: 3,
          replies: 1,
          history_candidates: 1,
          history_candidate_replies: 1,
          unlinked_photo_candidates: 1,
        },
      });
    },
  );
  expect(windows).toEqual([]);
  await page
    .getByRole("button", { name: "Privacy and stored data", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Privacy review" });
  await panel.getByLabel("History preview window").selectOption("90");
  expect(windows).toEqual([]);
  await panel.getByRole("button", { name: "Preview stored data" }).click();
  await expect(
    panel.getByText("Possibly unused photos: 1", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(/No automatic deletion is enabled/),
  ).toBeVisible();
  expect(windows).toEqual([90]);
  await expect(panel.getByRole("button", { name: /delete/i })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate((saved) => {
    localStorage.setItem("sb-reseller-test-auth-token", JSON.stringify(saved));
    const channel = new BroadcastChannel("sb-reseller-test-auth-token");
    channel.postMessage({ event: "SIGNED_IN", session: saved });
    channel.close();
  }, session("66666666-6666-4666-8666-666666666666"));
  await expect(panel).toHaveCount(0);
  await page
    .getByRole("button", { name: "Privacy and stored data", exact: true })
    .click();
  await expect(
    page.getByText("Possibly unused photos: 1", { exact: true }),
  ).toHaveCount(0);
});

test("a stalled enqueue releases controls, preserves text and reconciles without duplicate work", async ({
  page,
}) => {
  const state = await fixture(page);
  state.enable();
  state.holdEnqueue();
  await page
    .getByRole("button", {
      name: "Is this available? · Open · Facebook Marketplace",
      exact: true,
    })
    .click();
  const panel = page.getByRole("region", {
    name: "AI draft for this question",
  });
  await expect(
    panel.getByRole("button", { name: "Request AI draft", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Write a new reply")
    .fill("Keep this draft through timeout");
  await page.clock.install();
  await panel
    .getByRole("button", { name: "Request AI draft", exact: true })
    .click();
  await expect.poll(() => state.queuedIds.length).toBe(1);
  await page.clock.fastForward(15_001);
  await expect(panel.getByRole("alert")).toContainText("Could not confirm");
  await expect(
    panel.getByRole("button", { name: "Refresh draft status" }),
  ).toBeEnabled();
  await expect(
    panel.getByRole("button", { name: "Request AI draft", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Write a new reply")).toHaveValue(
    "Keep this draft through timeout",
  );
  state.releaseEnqueue();
  await panel.getByRole("button", { name: "Refresh draft status" }).click();
  await expect(
    panel.getByText("Job status: queued", { exact: true }),
  ).toBeVisible();
  expect(state.queuedIds).toHaveLength(1);
});

test("stale question edits stay visible and protect sign-out", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", {
      name: "Is this available? · Open · Facebook Marketplace",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Edit saved question", exact: true })
    .click();
  await page
    .getByLabel("Saved question text")
    .fill("Keep this corrected private question");
  await page.route("**/rest/v1/rpc/buyer_workspace", async (route) => {
    if (route.request().postDataJSON().command.op !== "saveInquiry")
      return route.fallback();
    await route.fulfill({
      status: 409,
      json: { code: "PT409", message: "private internal conflict" },
    });
  });
  await page
    .getByRole("button", { name: "Save question changes", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "changed",
  );
  await expect(page.getByLabel("Saved question text")).toHaveValue(
    "Keep this corrected private question",
  );
  await expect(page.getByText("private internal conflict")).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Saved question text")).toHaveValue(
    "Keep this corrected private question",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", {
      name: "Public comment · Open · Facebook Groups",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Saved question text")).toHaveValue(
    "Keep this corrected private question",
  );
});

test("late question-save failure cannot affect the next account", async ({
  page,
}) => {
  await fixture(page);
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>((resolve) => (release = resolve)),
    requested = new Promise<void>((resolve) => (entered = resolve));
  await page.route("**/rest/v1/rpc/buyer_workspace", async (route) => {
    if (route.request().postDataJSON().command.op !== "saveInquiry")
      return route.fallback();
    entered();
    await wait;
    await route.fulfill({ status: 409, json: { code: "PT409" } });
  });
  await page
    .getByRole("button", {
      name: "Is this available? · Open · Facebook Marketplace",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Edit saved question", exact: true })
    .click();
  await page
    .getByLabel("Saved question text")
    .fill("Private former account correction");
  await page
    .getByRole("button", { name: "Save question changes", exact: true })
    .click();
  await requested;
  await page.evaluate((saved) => {
    localStorage.setItem("sb-reseller-test-auth-token", JSON.stringify(saved));
    const channel = new BroadcastChannel("sb-reseller-test-auth-token");
    channel.postMessage({ event: "SIGNED_IN", session: saved });
    channel.close();
  }, session("66666666-6666-4666-8666-666666666666"));
  await expect(page.getByLabel("Saved question text")).toHaveCount(0);
  const response = page.waitForResponse("**/rest/v1/rpc/buyer_workspace");
  release();
  await response;
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Private former account correction")).toHaveCount(
    0,
  );
});
