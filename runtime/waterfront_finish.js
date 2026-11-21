import * as THREE from 'three';

export function createWaterfrontFinish(data,scale){
 const plantEdits=new Map(data.shrubs.map(edit=>[edit.id,edit]));
 const anchorEdits=new Map();
 for(const edit of data.groundFlora){
  if(!anchorEdits.has(edit.mesh))anchorEdits.set(edit.mesh,[]);
  anchorEdits.get(edit.mesh).push(edit);
 }
 const appliedShrubs=new Set();
 const adjustedFlora=new Set();
 const dirt=new THREE.Color('#9d9788').toArray().map(v=>v.toFixed(5)).join(',');
 function refineShrub(tree){
  const edit=plantEdits.get(tree.id);
  if(!edit)return;
  if(tree.category!=='shrub'||tree.position.some((v,i)=>Math.abs(v-edit.root[i])>.005)){
   throw Error('Lakeside shrub source position changed: '+tree.id);
  }
  tree.scale=[tree.scale[0]*edit.width,tree.scale[1]*edit.height,tree.scale[2]*edit.width];
  tree.height*=edit.height;
  appliedShrubs.add(tree.id);
 }
 function refineFlora(mesh){
  const edits=anchorEdits.get(mesh.name);
  if(!edits)return;
  const positions=mesh.geometry.getAttribute('position');
  for(const {id,range:[first,end],root:[x,y,z],factor} of edits){
   if(first<0||first>=end||end>positions.count)throw Error('Lakeside flora range changed: '+id);
   for(let i=first;i<end;i++){
    const px=positions.getX(i),py=positions.getY(i),pz=positions.getZ(i);
    if(Math.abs(px-x)>2||Math.abs(pz-z)>2)throw Error('Lakeside flora coordinates changed: '+id);
    positions.setXYZ(i,x+(px-x)*factor,y+(py-y)*factor,z+(pz-z)*factor);
   }
   adjustedFlora.add(id);
  }
  positions.needsUpdate=true;
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
 }
 function finishPaving(mesh){
  const material=mesh.material;
  const palePath=mesh.name===data.originalPalePath.mesh&&material.name==='white_marking';
  if(!palePath&&!['stone_paving','R9_Waterside_Paving'].includes(material.name))return;
  const [x0,z0,x1,z1]=palePath?data.originalPalePath.bounds:data.pavingBounds;
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  const {min,max}=mesh.geometry.boundingBox;
  if(min.x>=x1||max.x<=x0||min.z>=z1||max.z<=z0||material.userData.r9LakesideSlabs)return;
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.userData.r9LakesideSlabs=true;
  material.onBeforeCompile=function(shader,...args){
   previous.call(this,shader,...args);
   shader.vertexShader=shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 lakePavingPoint;\nvarying float lakePavingUp;')
    .replace('#include <project_vertex>', `#include <project_vertex>
     lakePavingPoint=(modelMatrix*vec4(transformed,1.)).xyz/${scale.toFixed(8)};
     lakePavingUp=normalize(mat3(modelMatrix)*objectNormal).y;
    `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 lakePavingPoint;
    varying float lakePavingUp;
    float lakeStoneHash(vec2 p){
     vec3 q=fract(vec3(p.xyx)*.1031);
     q+=dot(q,q.yzx+33.33);
     return fract((q.x+q.y)*q.z);
    }
   `).replace('#include <color_fragment>', `#include <color_fragment>
   {
    vec2 lakeXZ=lakePavingPoint.xz;
    vec2 slabUV=(lakeXZ+vec2(963.,-307.))*${scale.toFixed(8)}/vec2(.60,.37);
    slabUV.x+=mod(floor(slabUV.y),2.)*.50;
    vec2 dd=fwidth(slabUV);
    vec2 edge=min(fract(slabUV),1.-fract(slabUV));
    vec2 band=1.-smoothstep(vec2(.010),vec2(.010)+clamp(dd,vec2(.002),vec2(.30)),edge);
    float joint=max(band.x,band.y)*(1.-smoothstep(.10,.36,max(dd.x,dd.y)));
    float margin=min(min(lakeXZ.x-(${x0.toFixed(1)}),${x1.toFixed(1)}-lakeXZ.x),min(lakeXZ.y-${z0.toFixed(1)},${z1.toFixed(1)}-lakeXZ.y));
    float grains=(lakeStoneHash(floor(lakeXZ*42.))-.5)*(1.-smoothstep(.10,.29,max(dd.x,dd.y)));
    float blockTone=lakeStoneHash(floor(slabUV))-.5;
    vec3 ashlar=vec3(${dirt})*(1.0+blockTone*.11+grains*.10-joint*.23);
    float lakeSlabWeight=smoothstep(0.,2.,margin)*smoothstep(.58,.85,lakePavingUp);
    diffuseColor.rgb=mix(diffuseColor.rgb,ashlar,.69*lakeSlabWeight);
   }
   `);
  };
  material.customProgramCacheKey=()=>key+'/r9-matihu-slab/'+palePath;
  material.needsUpdate=true;
 }
 return {refineShrub,refineFlora,finishPaving,state:()=>({shrubs:[...appliedShrubs],groundFlora:[...adjustedFlora]})};
}

