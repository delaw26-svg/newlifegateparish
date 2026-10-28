self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  // Network-first behavior: the app's shared data API must remain online.
  if (new URL(event.request.url).pathname.includes('/.netlify/functions/')) return;
});
