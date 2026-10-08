self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.delete("magazyn-cache-v1").then(() => self.clients.claim())
  );
});
