const CACHE_NAME = "daymark-shell-v4";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/icon.svg",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await Promise.all(SHELL.map(async (path) => {
      const response = await fetch(path);
      if (!response.ok || response.redirected) throw new Error("Could not cache the app shell.");
      await cache.put(path, response);
    }));
    await self.skipWaiting();
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith("daymark-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

function storeResponse({ event, key, response }) {
  if (!response.ok || response.redirected) return;
  const copy = response.clone();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(key, copy)).catch(() => undefined));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isIconFont = url.origin === "https://fonts.gstatic.com" && request.destination === "font";
  if (request.method !== "GET" || (!sameOrigin && !isIconFont) || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.headers.get("content-type")?.includes("text/html")) storeResponse({ event, key: "/", response });
      return response;
    }).catch(async () => (await (await caches.open(CACHE_NAME)).match("/")) ?? new Response("You are offline.", { status: 503 })));
    return;
  }
  // Fetch responses such as RSC data must stay outside the asset cache.
  if (!["script", "style", "font", "image", "manifest"].includes(request.destination)) return;
  event.respondWith(caches.open(CACHE_NAME).then((cache) => cache.match(request)).then((cached) => cached || fetch(request).then((response) => {
    storeResponse({ event, key: request, response });
    return response;
  })));
});
