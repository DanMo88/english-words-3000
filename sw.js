const V='ew3000-v2';
const ASSETS=["./", "index.html", "style.css?v=2", "app.js?v=2", "words.json", "manifest.webmanifest", "img/day.webp", "img/eat.webp", "img/food.webp", "img/friend.webp", "img/go.webp", "img/good.webp", "img/house.webp", "img/people.webp", "img/time.webp", "img/water.webp", "audio/day-ex.mp3", "audio/day.mp3", "audio/eat-ex.mp3", "audio/eat.mp3", "audio/food-ex.mp3", "audio/food.mp3", "audio/friend-ex.mp3", "audio/friend.mp3", "audio/go-ex.mp3", "audio/go.mp3", "audio/good-ex.mp3", "audio/good.mp3", "audio/house-ex.mp3", "audio/house.mp3", "audio/people-ex.mp3", "audio/people.mp3", "audio/sfx-correct.mp3", "audio/sfx-wrong.mp3", "audio/time-ex.mp3", "audio/time.mp3", "audio/water-ex.mp3", "audio/water.mp3", "fonts/Vazirmatn-Black.woff2", "fonts/Vazirmatn-Bold.woff2", "fonts/Vazirmatn-Regular.woff2", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
async function ranged(req,res){
  const range=req.headers.get('range'); if(!range||!res) return res;
  const buf=await res.arrayBuffer(); const m=/bytes=(\d*)-(\d*)/.exec(range); if(!m) return new Response(buf,{headers:res.headers});
  const size=buf.byteLength; const start=m[1]?+m[1]:0; const end=m[2]?Math.min(+m[2],size-1):size-1;
  return new Response(buf.slice(start,end+1),{status:206,statusText:'Partial Content',headers:{'Content-Type':res.headers.get('Content-Type')||'audio/mpeg','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
}
self.addEventListener('fetch',e=>{
  const req=e.request; const url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin) return;
  const media=/\/(audio|img|fonts|icons)\//.test(url.pathname);
  if(media){
    e.respondWith((async()=>{
      const c=await caches.open(V);
      let res=await c.match(url.pathname.replace(/^.*?\/(audio|img|fonts|icons)\//,'$1/'),{ignoreSearch:true})||await c.match(req,{ignoreSearch:true,ignoreVary:true});
      if(!res){ const r=await fetch(new Request(req.url)); if(r.ok) c.put(req.url,r.clone()); res=r; }
      return ranged(req,res);
    })());
  } else {
    e.respondWith(fetch(req).then(r=>{ if(r.ok){const cp=r.clone(); caches.open(V).then(c=>c.put(req,cp));} return r; })
      .catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))));
  }
});
