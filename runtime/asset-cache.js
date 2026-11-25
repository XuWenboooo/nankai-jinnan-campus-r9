// Bump this version when a campus asset changes at an existing URL.
const PREFIX='nku-campus-assets-';
const CACHE=PREFIX+'r9-20261121-v1';
const BUDGET=192*1024*1024;
const roots=[
 new URL('../assets/',self.registration.scope).pathname,
 new URL('../../nankai-jinnan-campus-r9-assets/assets/',self.registration.scope).pathname,
];
let mutations=Promise.resolve();

self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const names=await caches.keys();
 await Promise.all(names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name)));
 await self.clients.claim();
})()));

function size(response){
 return Number(response.headers.get('content-length'))||0;
}

async function remember(cache,request,response){
 const length=size(response);
 if(!length||length>BUDGET)return;
 const keys=await cache.keys();
 const lengths=await Promise.all(keys.map(key=>cache.match(key).then(hit=>hit?size(hit):0)));
 let total=lengths.reduce((sum,value)=>sum+value,length);
 for(let i=0;total>BUDGET&&i<keys.length;i++){
  await cache.delete(keys[i]);
  total-=lengths[i];
 }
 await cache.put(request,response);
}

self.addEventListener('fetch',event=>{
 const {request}=event;
 const url=new URL(request.url);
 if(request.method!=='GET'||request.headers.has('range')||url.origin!==self.location.origin||
    !roots.some(root=>url.pathname.startsWith(root))||!/\.(glb|f32|deflate)$/.test(url.pathname))return;
 let persistence=Promise.resolve();
 const response=(async()=>{
  let cache;
  try{
   cache=await caches.open(CACHE);
   const stored=await cache.match(request);
   if(stored)return stored;
  }catch{}
  const fresh=await fetch(request);
  if(cache&&fresh.status===200&&!fresh.redirected&&size(fresh)){
   const copy=fresh.clone();
   persistence=mutations=mutations.then(()=>remember(cache,request,copy)).catch(()=>{});
  }
  return fresh;
 })();
 event.respondWith(response);
 event.waitUntil(response.then(()=>persistence,()=>{}));
});

