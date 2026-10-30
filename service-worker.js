const CACHE_NAME = "mukahtaeain-pwa-v4";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./db.js"
];

// Install: cache the basic app files.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// Activate: remove old versions of this app's cache.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) =>
            key.startsWith("mukahtaeain-pwa-") &&
            key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: use cached app files when offline.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle requests from this PWA's own origin.
  if (url.origin !== self.location.origin) return;

  // A root favicon is not part of this project; respond quietly.
  if (url.pathname === "/favicon.ico") {
    event.respondWith(new Response(null, { status: 204 }));
    return;
  }

  // Only cache GET requests; leave API requests alone.
  if (
    request.method !== "GET" ||
    url.pathname.includes("/api/")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put("./index.html", copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          return (
            await caches.match("./index.html")
          ) || new Response("Offline page unavailable", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          return (
            await caches.match(request)
          ) || new Response("", { status: 404 });
        });
    })
  );
});
