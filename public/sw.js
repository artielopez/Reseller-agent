/* Offline support intentionally stores no workspace responses or user data. */
const offlineCache = "reseller-offline-v1";
const offlinePath = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(offlinePath, {
        cache: "reload",
        redirect: "error",
      });
      if (
        !response.ok ||
        response.redirected ||
        (response.url && new URL(response.url).pathname !== offlinePath) ||
        !response.headers.get("Content-Type")?.includes("text/html") ||
        !(await response.clone().text()).includes('data-reseller-offline="v1"')
      ) {
        throw new Error("Static offline page unavailable");
      }
      await (await caches.open(offlineCache)).put(offlinePath, response);
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
