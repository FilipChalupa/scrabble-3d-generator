// Jednoduchý service worker: aplikace běží jen online,
// bez připojení se místo ní zobrazí stránka s omluvou.

const CACHE = 'scrabble3d-offline-v2'
const OFFLINE_URL = 'offline.html'

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL, 'icons/icon.svg'])))
	self.skipWaiting()
})

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	)
})

self.addEventListener('fetch', (event) => {
	if (event.request.mode !== 'navigate') return
	event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)))
})
