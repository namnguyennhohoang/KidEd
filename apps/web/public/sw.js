/* Service worker tối giản (ADR 0005): chỉ lo điều hướng khi mất mạng + cache nội dung học.
   KHÔNG chạm vào RSC payload / _next / API ghi để không phá điều hướng Next.js. */
const CACHE = 'tiny-v2';
const NAV_FALLBACK = ['/', '/learn', '/parent', '/onboarding'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(NAV_FALLBACK)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.search.includes('_rsc') || url.pathname.startsWith('/_next/')) return;

  // Nội dung học đã tải: stale-while-revalidate (xem được khi offline giữa phiên).
  if (url.pathname.startsWith('/api/content/')) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const cached = await c.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) c.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }
  if (url.pathname.startsWith('/api/')) return;

  // CHỈ điều hướng trang (document): network-first, fallback cache khi offline.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/learn')),
      ),
    );
  }
});
