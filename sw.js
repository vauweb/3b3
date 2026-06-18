// 3 BASKET 3 — service worker (network-first with offline fallback).
// Relative URLs are resolved against this file's location, so the same SW works
// at any deployment path (e.g. GitHub Pages subfolder). Service workers only
// run over http(s); the app still works from file:// without one.
const CACHE = 'cyberhoops-v1';

const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './phaser.min.js',
    './src/config.js',
    './src/iso.js',
    './src/sprites.js',
    './src/entities.js',
    './src/ai.js',
    './src/ui.js',
    './src/scene.js',
    './src/main.js',
    './assets/favicon.svg',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/icons/icon-maskable-192.png',
    './assets/icons/icon-maskable-512.png',
    './manifest.json',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
            .catch(() => {})
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    // Only intercept same-origin requests; let the network handle the rest.
    if (url.origin !== self.location.origin) return;

    // Network-first: always try to fetch the freshest version and refresh the
    // cache. Only when the network is unavailable (offline / connection lost)
    // do we serve the previously cached copy, falling back to the app shell.
    event.respondWith(
        fetch(req)
            .then((res) => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const copy = res.clone();
                    caches.open(CACHE).then((cache) => cache.put(req, copy));
                }
                return res;
            })
            .catch(() =>
                caches.match(req).then((cached) => cached || caches.match('./index.html'))
            )
    );
});
