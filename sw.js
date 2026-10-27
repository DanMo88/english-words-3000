// HTML: network-first · JSON data: network-first · css/js/manifest: stale-while-revalidate
// media (audio/img/fonts/icons): cache-on-demand · cross-origin: never touched
const V = 'ew3000-v6';
const SHELL = ['./', 'index.html', 'style.css?v=6', 'app.js?v=6', 'install.js?v=1', 'manifest.webmanifest', 'data/index.json',
  'fonts/Vazirmatn-Regular.woff2', 'fonts/Vazirmatn-Bold.woff2', 'fonts/Vazirmatn-Black.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'audio/sfx-correct.mp3', 'audio/sfx-wrong.mp3'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== 'ew3000-media').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
async function ranged(req, res) {
  const range = req.headers.get('range'); if (!range || !res || res.status !== 200) return res;
  const buf = await res.arrayBuffer(); const m = /bytes=(\d*)-(\d*)/.exec(range);
  const size = buf.byteLength; const start = m && m[1] ? +m[1] : 0; const end = m && m[2] ? Math.min(+m[2], size - 1) : size - 1;
  return new Response(buf.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers: { 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}
// media (audio/images): cached on demand, per lesson, in a long-lived cache
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/(audio|img|fonts|icons)\//.test(url.pathname)) {
    e.respondWith((async () => {
      const key = url.origin + url.pathname;
      let res = await caches.match(key);
      if (!res) {
        const r = await fetch(key);
        if (r.ok) { const c = await caches.open(/\/(fonts|icons)\//.test(url.pathname) ? V : 'ew3000-media'); await c.put(key, r.clone()); }
        res = r;
      }
      return ranged(req, res);
    })());
  } else if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('.json')) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: url.pathname.endsWith('.json') ? false : true }).then(r => r || caches.match(req, { ignoreSearch: true })).then(r => r || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); } return r; }).catch(() => hit || caches.match(req, { ignoreSearch: true }));
      return hit || net;
    }));
  }
});
