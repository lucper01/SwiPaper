const CACHE='swipaper-v8';
const ASSETS=['./','./index.html','./styles.css','./src/app.js','./src/core.mjs','./src/search.mjs','./src/citations.mjs','./src/scholar.mjs','./assets/giraffe-discover.svg','./assets/giraffe-library.svg','./assets/giraffe-citations.svg','./assets/giraffe-success.svg','./assets/giraffe-thinking.svg','./assets/icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
});
