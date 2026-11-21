import {Vector3} from 'three';

export function createMinimap(config){
 const panel=document.getElementById('campus-minimap');
 const map=document.getElementById('campus-map-panel');
 const marker=document.getElementById('campus-map-marker');
 const coordinates=document.getElementById('campus-map-position');
 const toggle=document.getElementById('campus-map-toggle');
 const copy=document.getElementById('campus-map-copy');
 const [minX,minZ,maxX,maxZ]=config.bounds_xz;
 const direction=new Vector3();
 let latest=null,lastTick=-Infinity,noticeTimer;
 panel.hidden=false;
 toggle.addEventListener('click',()=>{
  map.hidden=!map.hidden;
  toggle.setAttribute('aria-expanded',String(!map.hidden));
  toggle.textContent=map.hidden?'展开':'收起';
 });
 copy.addEventListener('click',async()=>{
  if(!latest)return;
  try{
   await navigator.clipboard.writeText(JSON.stringify(latest));
   copy.textContent='已复制';
  }catch{
   copy.textContent='复制失败';
  }
  clearTimeout(noticeTimer);
  noticeTimer=setTimeout(()=>{copy.textContent='复制机位';},1600);
 });
 return {
  update(camera,scale,now){
   if(now-lastTick<125)return;
   lastTick=now;
   const x=camera.position.x/scale,y=camera.position.y/scale,z=camera.position.z/scale;
   camera.getWorldDirection(direction);
   const [dx,dy,dz]=direction.toArray();
   const xPct=(x-minX)*100/(maxX-minX),zPct=(z-minZ)*100/(maxZ-minZ);
   marker.hidden=xPct<0||xPct>100||zPct<0||zPct>100;
   if(!marker.hidden){
    marker.style.left=xPct.toFixed(3)+'%';
    marker.style.top=zPct.toFixed(3)+'%';
    marker.style.transform='translate(-50%,-50%) rotate('+Math.atan2(dx,-dz)+'rad)';
   }
   const position=[x,y,z].map(value=>Number(value.toFixed(2)));
   const target=[x+dx*20,y+dy*20,z+dz*20].map(value=>Number(value.toFixed(2)));
   const label='X '+x.toFixed(1)+'  Z '+z.toFixed(1)+'  Y '+y.toFixed(1);
   if(coordinates.textContent!==label)coordinates.textContent=label;
   latest={frame:'source_native_y_up',position,target,fov:camera.fov};
  }
 };
}
