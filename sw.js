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
	const { request } = event
	if (request.mode === 'navigate') {
		event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
		return
	}
	// Vlastní soubory vždy ověřit u serveru (stačí 304). Hosting je posílá s dlouhým
	// max-age a tvrdé obnovení stránky se nevztahuje na skripty Web Workeru – po
	// nasazení by se jinak nová stránka potkala se starou geometrií.
	if (request.method === 'GET' && new URL(request.url).origin === self.location.origin) {
		event.respondWith(fetch(request, { cache: 'no-cache' }))
	}
})
