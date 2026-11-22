// Service Worker for Indoor Orienteering Route Analysis PWA.
//
// Generated into public/sw.js by scripts/generate-sw.mjs at build time, which
// stamps the placeholder below with the current build id. That substitution
// is what makes update detection work: browsers compare the *bytes* of
// sw.js against the installed copy, so a worker whose version is computed at
// runtime never looks changed and never triggers an update.
//
// Update flow (see lib/use-service-worker-update.ts):
//   1. A new sw.js is found -> it installs and then WAITS (no skipWaiting on
//      install), so the running page keeps its matching assets.
//   2. The page notices registration.waiting and shows the update banner.
//   3. The user accepts -> the page posts SKIP_WAITING -> this worker
//      activates, takes over, and the page reloads on 'controllerchange'.
const BUILD_VERSION = '__BUILD_VERSION__';
const CACHE_NAME = `indoor-o-${BUILD_VERSION}`;
const urlsToCache = [
  '/',
  '/manifest.json',
];

// Install event - cache important resources. Deliberately does NOT call
// skipWaiting(): the new worker waits until the user accepts the update.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

// Activate event - clean up old caches (removes old versions)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Messages from the page: activate on demand, and report the build version.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'GET_VERSION') {
    const port = event.ports && event.ports[0];
    if (port) port.postMessage({ type: 'VERSION', version: BUILD_VERSION });
  }
});

// Fetch event - network first, fallback to cache
// This ensures latest content is always served if available
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests (e.g. Google Fonts) — let the browser handle
  // them directly. Service worker fetches fall under connect-src CSP, so
  // attempting to proxy external URLs would violate a strict connect-src policy.
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        // Fall back to cache if network fails
        return caches.match(event.request);
      })
  );
});
