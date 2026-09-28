const SHELL = "radar-fiscal-shell-v1";
const STATIC = ["/", "/fiscal-manifest.webmanifest", "/brand/radar-electoral-logo-horizontal-claro.svg", "/icons/radar-app-icon-192x192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(STATIC)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/fiscales")) {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }
  if (STATIC.includes(url.pathname) || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(SHELL).then((cache) => cache.put(request, copy));
      return response;
    })));
  }
});
