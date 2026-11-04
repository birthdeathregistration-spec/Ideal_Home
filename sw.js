// Ideal Home Service Worker - Offline Shell & CDN Asset Cache
const CACHE_NAME = 'idealhome-shell-v1';

// Static resources to cache on install
const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json'
];

// Install event: Pre-cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('Pre-cache error (non-fatal):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate event: Clean up old cache versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Network-first for HTML, Cache-first for CDN assets, Passthrough for API
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Bypass API calls and POST requests (handled in frontend via localStorage)
  if (req.method !== 'GET' || url.hostname.includes('script.google.com') || url.search.includes('action=')) {
    return;
  }

  // 2. Cache-First for static CDN assets (Fonts, Icons, CDN Scripts)
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('cdn.tailwindcss.com')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.status === 200) {
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch (e) {
          return cached;
        }
      })
    );
    return;
  }

  // 3. Network-First with Cache Fallback for HTML Navigation
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return caches.match('./index.html');
        })
    );
    return;
  }

  // 4. Default: Network with Cache Fallback
  event.respondWith(
    caches.match(req).then(cached => {
      return cached || fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
