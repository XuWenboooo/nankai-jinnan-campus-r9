import * as THREE from 'three';

const isStructure=item=>item.kind==='building'||item.kind==='surface';
const localRadius={building:145,surface:125,ground_flora:76,aquatic_vegetation:70};

export function createSceneStreamer({camera,world,items,proxies,load,dispose,onChange,scale,moving}){
 const entries=items.map(item=>({
  item,proxy:proxies.get(item.id),box:new THREE.Box3(
   new THREE.Vector3().fromArray(item.bounds[0]).multiplyScalar(scale),
   new THREE.Vector3().fromArray(item.bounds[1]).multiplyScalar(scale)
  ),model:null,task:null,seen:0,visible:false,needed:false,attempts:0,retryAt:0,distance:0
 }));
 const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),closest=new THREE.Vector3();
 const loadedPaths=new Set(),errors=new Map();
 const lastCameraPosition=new THREE.Vector3(Infinity,Infinity,Infinity);
 let priority=[],active=0,peak=0,released=0,revision=0,timer,settled=false;

 function report(){
  const visible=entries.filter(e=>e.visible),full=visible.filter(e=>e.model);
  const covered=visible.filter(e=>e.model||e.proxy);
  const detail=visible.filter(e=>e.needed);
  return {total:entries.length,wanted:detail.length,loadedVisible:detail.filter(e=>e.model).length,
   visible:visible.length,visibleDetailed:full.length,covered:covered.length,
   missingStructural:visible.filter(e=>isStructure(e.item)&&!(e.model?.visible||e.proxy?.visible)).map(e=>e.item.id),
   nearbyMissing:entries.filter(e=>isStructure(e.item)&&e.needed&&!e.model).length,
   proxyCount:proxies.size,visibleProxies:covered.length-full.length,
   resident:entries.filter(e=>e.model).length,peak,released,revision,inFlight:active,requested:loadedPaths.size,
   failures:visible.filter(e=>errors.has(e.item.file)).map(e=>errors.get(e.item.file))};
 }

 function notify(){
  const state=report();
  peak=Math.max(peak,state.resident);
  if(state.nearbyMissing===0)settled=true;
  onChange({...state,peak});
 }

 function release(entry){
  if(entry.proxy)entry.proxy.visible=true;
  dispose(entry.model);
  entry.model=null;
  released++;
  revision++;
 }

 function pump(){
  const duringMotion=settled&&moving();
  for(const entry of priority){
   if(active>=(settled?2:4))break;
   if(duringMotion&&(!isStructure(entry.item)||entry.distance>65*scale))continue;
   if(entry.model||entry.task||entry.attempts>=3||performance.now()<entry.retryAt)continue;
   const controller=new AbortController();
   entry.task=controller;
   active++;
   loadedPaths.add(entry.item.file);
   load(entry.item,controller.signal).then(model=>{
    errors.delete(entry.item.file);
    entry.attempts=0;
    if(controller.signal.aborted){dispose(model);return;}
    entry.model=model;
    world.add(model);
    if(entry.proxy)entry.proxy.visible=false;
    revision++;
   }).catch(error=>{
    if(controller.signal.aborted)return;
    entry.attempts++;
    entry.retryAt=performance.now()+1100*entry.attempts;
    if(entry.attempts===3)errors.set(entry.item.file,String(error));
   }).finally(()=>{
    active--;
    entry.task=null;
    notify();
    // One newly decoded structural model may upload in the next frame.
    requestAnimationFrame(pump);
   });
  }
 }

 function classify(){
  camera.updateMatrixWorld();
  matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(matrix);
  for(const entry of entries)entry.visible=frustum.intersectsBox(entry.box);
 }

 function refresh(force=false){
  classify();
  if(!force&&camera.position.distanceToSquared(lastCameraPosition)<1){
   pump();
   notify();
   return;
  }
  lastCameraPosition.copy(camera.position);
  const now=performance.now(),recent=[];
  priority=[];
  for(const entry of entries){
   const {kind}=entry.item;
   entry.box.clampPoint(camera.position,closest);
   entry.distance=closest.distanceTo(camera.position);
   const radius=localRadius[kind]*scale;
   // Keep full geometry near the viewer regardless of look direction.
   // A resident coarse mesh covers the remainder through any turn.
   entry.needed=!entry.proxy&&isStructure(entry.item)||entry.distance<=radius;
   if(entry.needed){
    entry.seen=now;
    priority.push(entry);
   }else if(entry.model){
    if(now-entry.seen>12000)release(entry);
    else recent.push(entry);
   }
  }
  recent.sort((a,b)=>b.seen-a.seen);
  for(const entry of recent.slice(24))release(entry);
  priority.sort((a,b)=>(a.distance+(isStructure(a.item)?0:70))-
   (b.distance+(isStructure(b.item)?0:70)));
  pump();
  notify();
 }

 return {
  refresh:()=>refresh(true),report(){classify();return report();},
  start(){if(timer)return;refresh(true);timer=setInterval(refresh,240);},
  stop(){clearInterval(timer);timer=null;for(const entry of entries)entry.task?.abort();}
 };
}
