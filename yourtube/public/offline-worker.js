const CACHE = "yourtube-offline-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch("/downloads", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return;
      await cache.put("/downloads", response.clone());
      const html = await response.text();
      const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^\"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
      await Promise.allSettled([...new Set(assets)].map((asset) => cache.add(asset)));
    } catch {}
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter((name) => name.startsWith("yourtube-offline-shell-") && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  if (url.pathname === "/downloads" && event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(async (response) => {
      if (response.ok) (await caches.open(CACHE)).put("/downloads", response.clone());
      return response;
    }).catch(async () => (await caches.open(CACHE)).match("/downloads") || Response.error()));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then(async (response) => {
      if (response.ok) (await caches.open(CACHE)).put(event.request, response.clone());
      return response;
    })));
  }
});
