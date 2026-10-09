// Service worker do SM Financial: instalação (PWA), abertura rápida e notificações de lembrete.
// Nunca guarda em cache chamadas de API, do Supabase ou de pagamento: dados financeiros não ficam em cache.
const VERSION = 'sm-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/interno')) return;
  // rede primeiro; se estiver offline, usa a cópia guardada do aplicativo
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && (req.mode === 'navigate' || /\.(png|webmanifest)$/.test(url.pathname))) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req.mode === 'navigate' ? '/' : req, copy)); }
    return res;
  }).catch(() => caches.match(req.mode === 'navigate' ? '/' : req)));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('/');
  }));
});
