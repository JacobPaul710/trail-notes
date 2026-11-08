// Offline: keep a copy of the app on the phone, so it opens with no signal.
// Bump VERSION whenever any app file changes, so phones pick up the update.
const VERSION = "trail-notes-v0.15.1";
const CDN = "trail-notes-cdn"; // the speech library, kept across updates
const SPEECH = "trail-notes-speech"; // the speech model installed with the app, kept across updates
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
  "js/config.js",
  "js/drive.js",
  "privacy.html",
  "terms.html",
  "js/marker.js",
  "js/summary.js",
  "js/app.js",
  "img/marker-topo.webp",
  "img/marker-digits.png",
  "img/marker-topo-tall.webp",
  "img/brand.png",
  "icons/favicon-32.png",
  "icons/favicon-64.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting())
      .then(keepSpeech) // the big speech files: best effort, never blocks the install
  );
});

// If get-model.js was run, vendor/manifest.json lists the speech library + model: keep them on the device.
async function keepSpeech() {
  try {
    const res = await fetch("vendor/manifest.json", { cache: "no-cache" });
    if (!res.ok || /text\/html/.test(res.headers.get("content-type") || "")) return;
    const { files } = await res.json();
    const c = await caches.open(SPEECH);
    for (const f of files) {
      if (await c.match(f)) continue;
      try { await c.add(f); } catch (e) { /* try again next update */ }
    }
  } catch (e) { /* not bundled: the app downloads the model on first use instead */ }
}

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== CDN && k !== SPEECH && k !== "transformers-cache").map((k) => caches.delete(k)))).then(() => self.clients.claim())
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
