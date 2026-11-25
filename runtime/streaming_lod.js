import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export async function readStreamingLOD(){
 const meta=await fetch('../assets/streaming/campus_lod.json').then(response=>{
  if(!response.ok)throw Error('校园轮廓索引 HTTP '+response.status);
  return response.json();
 });
 const [decoded,atlas]=await Promise.all([
  fetch('../'+meta.file).then(response=>{
   if(!response.ok)throw Error('校园轮廓资源 HTTP '+response.status);
   return new Response(response.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
  }),
  new THREE.TextureLoader().loadAsync('../'+meta.terrain.file),
 ]);
 if(decoded.byteLength!==meta.decoded_bytes)throw Error('校园轮廓资源长度不匹配');
 return {meta,decoded,atlas};
}

export function attachStreamingLOD({meta,decoded,atlas},items,world,satelliteSite,terrainY,outlineMaterial){
 const models=new Map();
 atlas.colorSpace=THREE.SRGBColorSpace;
 atlas.flipY=false;
 atlas.anisotropy=4;
 const buildingMaterial=new THREE.MeshLambertMaterial({vertexColors:true});
 const terrainMaterial=new THREE.MeshLambertMaterial({map:atlas});
 terrainMaterial.name='paving';
 satelliteSite.bindPerimeterMask(terrainMaterial,'surface');
 const [ox,oz]=meta.terrain.origin_xz,[wx,wz]=meta.terrain.extent_xz;
 const color=new THREE.Color();
 for(const item of items){
  if(item.kind==='surface'){
   const [,sx,sz]=item.id.match(/^s_(-?\d+)_(-?\d+)$/)||[];
   if(sx===undefined)throw Error('地面分区索引无效 '+item.id);
   const x0=128*Number(sx),z0=128*Number(sz),steps=128/meta.terrain.grid_step;
   const geometry=new THREE.PlaneGeometry(128,128,steps,steps);
   geometry.rotateX(-Math.PI/2);
   const position=geometry.attributes.position,uv=geometry.attributes.uv;
   for(let i=0;i<position.count;i++){
    const x=x0+64+position.getX(i),z=z0+64+position.getZ(i);
    position.setXYZ(i,x,terrainY(x,z)-.075,z);
    uv.setXY(i,(x-ox)/wx,(z-oz)/wz);
   }
   geometry.computeVertexNormals();
   geometry.computeBoundingSphere();
   const mesh=new THREE.Mesh(geometry,terrainMaterial);
   mesh.name='LOD_'+item.id;
   mesh.userData.sourceAsset=item.file;
   world.add(mesh);
   models.set(item.id,mesh);
   continue;
  }
  const entry=meta.entries[item.id];
  if(!entry?.parts.length)continue;
  const group=new THREE.Group();
  group.name='LOD_'+item.id;
  group.userData.sourceAsset=item.file;
  const parts=[];
  for(const part of entry.parts){
   const points=new Uint16Array(decoded,...part.points);
   const indices=new Uint32Array(decoded,...part.indices);
   if(points.length%3||indices.length%3||indices.some(index=>index>=points.length/3))
    throw Error('轮廓网格索引越界 '+item.id+' / '+part.material);
   const p=new Float32Array(points.length),rgb=new Uint8Array(points.length);
   color.fromArray(part.color).convertSRGBToLinear();
   const colors=color.toArray().map(x=>Math.round(255*x));
   for(let i=0;i<points.length;i++){
    p[i]=(points[i]+part.origin[i%3])*meta.scale_native_units;
    rgb[i]=colors[i%3];
   }
   const geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.BufferAttribute(p,3));
   geometry.setAttribute('color',new THREE.BufferAttribute(rgb,3,true));
   geometry.setIndex(new THREE.BufferAttribute(indices.slice(),1));
   geometry.computeVertexNormals();
   const litWindow=outlineMaterial(part.material);
   if(litWindow){
    geometry.computeBoundingSphere();
    group.add(new THREE.Mesh(geometry,litWindow));
   }else parts.push(geometry);
  }
  if(parts.length){
   const geometry=parts.length===1?parts[0]:mergeGeometries(parts);
   if(parts.length>1)parts.forEach(part=>part.dispose());
   if(geometry?.index?.count){
    geometry.computeBoundingSphere();
    group.add(new THREE.Mesh(geometry,buildingMaterial));
   }
  }
  if(!group.children.length)continue;
  world.add(group);
  models.set(item.id,group);
 }
 return models;
}
