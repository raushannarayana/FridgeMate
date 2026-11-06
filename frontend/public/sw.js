// App-shell only. API responses (private data) and auth tokens are never cached.
const C = "fridgemate-shell-v1";
self.addEventListener("install", (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(["/offline.html", "/icon.svg"]))));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.pathname.startsWith("/api/") || e.request.method !== "GET") return;
  if (e.request.mode === "navigate") e.respondWith(fetch(e.request).catch(() => caches.match("/offline.html")));
});
