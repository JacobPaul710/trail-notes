// Offline: keep a copy of the app on the phone, so it opens with no signal.
// Bump VERSION whenever any app file changes, so phones pick up the update.
const VERSION = "trail-notes-v0.9.2";
const CDN = "trail-notes-cdn"; // the speech library, kept across updates
const FILES = [
  "./",
  "index.html",
  "styles.css",
  "topo-mask.css",
  "manifest.webmanifest",
  "js/theme-early.js",
  "js/parse.js",
  "js/criteria.js",
  "js/db.js",
  "js/stt.js",
  "js/stt-worker.js",
  "privacy.html",
  "terms.html",
  "js/marker.js",
  "js/summary.js",
  "js/app.js",
  "img/marker-topo.webp",
  "img/marker-digits.png",
  "img/marker-topo-tall.webp",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== CDN && k !== "transformers-cache").map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// The app's own files come from the phone first (fast and offline), then the network.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // The speech library (and its engine files) from the CDN: keep a copy so it works offline.
  if (url.hostname === "cdn.jsdelivr.net") {
    e.respondWith(
      caches.open(CDN).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }))
      )
    );
    return;
  }
  if (url.origin !== self.location.origin) return; // the model files are kept by the speech library itself
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => (req.mode === "navigate" ? caches.match("index.html") : Response.error()))
    )
  );
});
