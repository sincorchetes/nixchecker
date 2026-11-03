// Keeps a copy of what the page uses (the page, its scripts and the catalog files it asked for), so it
// opens and validates with no connection after it has been used once. The network always comes first:
// a copy is only what is shown when there is no network, so an update is never hidden by an old copy.
const CACHE = "nixchecker-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        // A partial answer cannot be kept, and a copy that fails to be kept is not a reason to fail.
        if (response.ok && response.status === 200)
          cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch (error) {
        const kept = await cache.match(request);
        if (kept) return kept;
        throw error;
      }
    })(),
  );
});
