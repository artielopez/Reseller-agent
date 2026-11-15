import { test, expect } from "../e2e-cloud/fixtures";
test("offers install metadata and correctly sized phone icons", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "crossorigin",
    "use-credentials",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/icons/icon-180.png",
  );
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    display: "standalone",
    start_url: "/",
    scope: "/",
  });
  for (const size of [180, 192, 512]) {
    const dimensions = await page.evaluate(async (size) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`/icons/icon-${size}.png`)).blob(),
      );
      return [bitmap.width, bitmap.height];
    }, size);
    expect(dimensions).toEqual([size, size]);
  }
  await page.getByText("Install on your phone", { exact: true }).click();
  await expect(
    page.getByText(/On iPhone, open this site in Safari/),
  ).toBeVisible();
});
test("offline reload recovers online and caches no private routes or responses", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("Keep this screen open");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "You’re offline." }),
  ).toBeVisible();
  const entries = await page.evaluate(async () => {
    const names = await caches.keys();
    return (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (request) => new URL(request.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  expect(entries).toEqual(["/offline.html"]);
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(
    page.getByRole("button", { name: "Email me a sign-in code" }),
  ).toBeVisible();
});
