// Service worker: makes the page work offline. Network first, so a new deploy shows up on the next load;
// the cache is only the fallback. Google Fonts are served stale-while-revalidate.
// Compiled as a classic script (sw/tsconfig.json), so it must not import or export anything.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = 'caiet-v2';
const SHELL = ['./', 'index.html', 'css/style.css', 'dist/ui.js', 'dist/interp.js', 'dist/explain.js', 'dist/intro.js', 'dist/probleme.js', 'probleme/probleme.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/favicon-32.png'];
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

sw.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => sw.skipWaiting()));
});
sw.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => sw.clients.claim()));
});
sw.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (FONTS.test(req.url)) { e.respondWith(staleWhileRevalidate(req)); return }
  if (new URL(req.url).origin === sw.location.origin) e.respondWith(networkFirst(req));
});

async function networkFirst(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./') : undefined);
    if (hit) return hit;
    throw err;
  }
}
async function staleWhileRevalidate(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE), hit = await cache.match(req);
  const fresh = fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res });
  if (hit) { fresh.catch(() => undefined); return hit }
  return fresh;
}
