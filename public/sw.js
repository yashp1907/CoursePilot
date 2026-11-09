/* CoursePilot service worker.
   - Precaches the offline page + icons.
   - Cache-first for immutable build assets (/_next/static) and icons, so the app shell loads instantly.
   - Navigations go to the network; if offline, show the offline page.
   - Never caches pages, API responses or anything authenticated, so no account data is stored on the device by the worker. */
const VERSION = "cp-v2";
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

/* Cache the offline page AND the build assets it needs, so it renders (and hydrates) with no network. */
async function cacheOfflinePage() {
  const cache = await caches.open(STATIC);
  const res = await fetch(OFFLINE_URL, { cache: "reload" });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put(OFFLINE_URL, res);
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s\\)]+/g) || [])];
  await Promise.all(assets.map((a) => cache.add(a).catch(() => {})));
}
let lastRefresh = 0;

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([caches.open(STATIC).then((c) => c.addAll(PRECACHE.filter((u) => u !== OFFLINE_URL))), cacheOfflinePage()]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        // Keep the offline page in step with new deployments (at most once an hour).
        if (Date.now() - lastRefresh > 3_600_000) { lastRefresh = Date.now(); event.waitUntil(cacheOfflinePage().catch(() => {})); }
        return res;
      }).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(STATIC).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
