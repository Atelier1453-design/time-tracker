const CACHE = "timetrack-shell-v2";

/* 変わらない依存ライブラリ・アイコンだけキャッシュ優先。
   アプリ本体（更新され得るファイル）はネット優先にして、
   更新をすぐ反映しつつ、オフラインでも開けるようキャッシュに落とす。 */
const CACHE_FIRST = [
  "./vendor/preact.mjs",
  "./vendor/hooks.mjs",
  "./vendor/htm.mjs",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
];
const NETWORK_FIRST = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./constants.js",
  "./diary.js",
  "./storage.js",
  "./weather.js",
  "./manifest.json",
];
const CACHE_FIRST_SUFFIXES = CACHE_FIRST.map((p) => p.slice(1)); // "./x" -> "/x"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([...CACHE_FIRST, ...NETWORK_FIRST])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (CACHE_FIRST_SUFFIXES.some((s) => url.pathname.endsWith(s))) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }))
    );
    return;
  }

  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => caches.match(req))
  );
});
