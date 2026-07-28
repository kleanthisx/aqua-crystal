/* Aqua Crystal — service worker: cache-first app shell so everything works offline. */
const CACHE = "aqua-crystal-v4";
const ASSETS = [
  "./",
  "index.html",
  "css/styles.css?v=4",
  "js/data.js?v=4",
  "js/store.js?v=4",
  "js/reader.js?v=4",
  "js/dosing.js?v=4",
  "js/app.js?v=4",
  "manifest.webmanifest",
  "icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network-first with cache fallback: users always get the newest version when
   online, and the last cached version when offline. */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // never intercept the AI API call
  if (e.request.url.includes("generativelanguage.googleapis.com")) return;
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp.ok && new URL(e.request.url).origin === location.origin) {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(() => caches.match(e.request))
  );
});
