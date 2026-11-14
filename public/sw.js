/* Offline support intentionally stores no workspace responses or user data. */
const offlineCache = "reseller-offline-v1";
const offlinePath = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(offlinePath, {
        cache: "reload",
        redirect: "follow",
      });
      // Cloudflare static assets canonicalize /offline.html to /offline.
      // A hosting sign-in redirect must never become our cached fallback.
      const finalUrl = response.url ? new URL(response.url) : null;
      if (
        !response.ok ||
        (finalUrl &&
          (finalUrl.origin !== self.location.origin ||
            ![offlinePath, "/offline"].includes(finalUrl.pathname) ||
            finalUrl.search)) ||
        !response.headers.get("Content-Type")?.includes("text/html") ||
        !(await response.clone().text()).includes('data-reseller-offline="v1"')
      ) {
        throw new Error("Static offline page unavailable");
      }
      // A redirected Response cannot satisfy a navigation whose redirect mode
      // is manual. Cache a fresh response containing only our verified HTML.
      const offline = new Response(await response.text(), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
      await (await caches.open(offlineCache)).put(offlinePath, offline);
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter(
            (key) =>
              key.startsWith("reseller-offline-") && key !== offlineCache,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Auth callbacks and all data/API requests always use the browser network.
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    url.origin !== self.location.origin ||
    url.search ||
    !["/", "/inbox", "/buyer-lab"].includes(url.pathname)
  )
    return;
  event.respondWith(
    fetch(request).catch(async () => {
      const fallback = await (
        await caches.open(offlineCache)
      ).match(offlinePath);
      return (
        fallback ||
        new Response("You are offline. Reconnect and reopen Reseller Agent.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );
    }),
  );
});
