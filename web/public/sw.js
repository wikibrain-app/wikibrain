/* WikiBrain service worker (PWA milestone, P1). Scope: make the app installable and keep the shell usable when the
   network drops. It never caches /api, /mcp or OAuth endpoints (the cloud is the source of truth; the device copy with
   offline editing is the separate Q8 sync milestone).
   - navigations: network first, fall back to the cached shell (last good index.html), then offline.html
   - same-origin hashed assets (/assets/*, /icons/*, fonts): cache first, immutable
   - everything else: network only */
const VERSION = 'wb-v1';
const SHELL = `${VERSION}-shell`, ASSETS = `${VERSION}-assets`;
const NEVER = [/^\/api\//, /^\/mcp/, /^\/authorize/, /^\/token/, /^\/register$/, /^\/revoke/, /^\/\.well-known\//, /^\/healthz/];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.some(re => re.test(url.pathname))) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      if (res.ok && res.headers.get('content-type')?.includes('text/html') && !url.pathname.startsWith('/help')) caches.open(SHELL).then(c => c.put('/__shell', res.clone()));
      return res;
    }).catch(async () => (await caches.match('/__shell')) || (await caches.match('/offline.html')) || Response.error()));
    return;
  }
  if (/^\/(assets|icons)\//.test(url.pathname) || /\.(woff2?|png|svg|ico)$/.test(url.pathname)) {
    e.respondWith(caches.open(ASSETS).then(async c => (await c.match(req)) || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; })));
  }
});
