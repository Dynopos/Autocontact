/* Dynopro Auto Contact — Service Worker
   Membolehkan app dipasang ke skrin utama dan berfungsi tanpa internet. */

const CACHE = 'dynopro-auto-contact-v23';
const SHELL = [
  './',
  './index.html',
  './simpan.html',
  './buang-kontak-pendua.html',
  './kemas.html',
  './tukar-nama.html',
  './jual.html',
  './crm.html',
  './kemas-engine.js',
  './ocr.js',
  './simpan-fail.js',
  './crm-store.js',
  './config.js',
  './awan.js',
  './wa-klasifikasi.js',
  './klasifikasi.html',
  './integrasi.html',
  './kongsi.html',
  './manifest-crm.webmanifest',
  './pasang.js',
  './lesen.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/logo-mark.png',
  './icons/logo-mini-crm.webp',
  './icons/crm-192.png',
  './icons/crm-512.png',
  './icons/crm-maskable-512.png',
  './icons/crm-apple-touch.png',
  './icons/crm-favicon-32.png',
  './seo.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll gagal keseluruhan jika satu fail tersasar — guna
      // permintaan individu supaya pemasangan tetap berjaya.
      .then((c) => Promise.all(
        SHELL.map((u) => c.add(u).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Data awan (Supabase API, log masuk, Edge Function) TIDAK PERNAH dicache:
  // ia mesti sentiasa terkini dan peribadi. Hanya fail app sendiri dan
  // pustaka Supabase dari CDN (versi tetap) disimpan untuk luar talian.
  const url = new URL(req.url);
  const cdn = url.origin === 'https://cdn.jsdelivr.net' && url.pathname.startsWith('/npm/@supabase/supabase-js@');
  if (url.origin !== self.location.origin && !cdn) return;

  // config.js: rangkaian dahulu, supaya tetapan baharu sampai tanpa tukar versi cache
  if (url.origin === self.location.origin && url.pathname.endsWith('/config.js')) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Rangkaian dahulu untuk dokumen (supaya kemas kini sampai segera),
  // jatuh balik ke cache bila luar talian.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./simpan.html')))
    );
    return;
  }

  // Cache dahulu untuk aset lain.
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
