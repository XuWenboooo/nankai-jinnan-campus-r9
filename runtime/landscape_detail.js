import * as THREE from 'three';
import {seededRandom,shrubGeometry} from './plant_geometry.js';

const TILE=16;
const BUDGET=385000;
const COLORS=['#516b31','#6c7c3c','#748344','#8d8945','#465d32','#7d8c43'];

// All LODs use the same placement field. Its wavelength exceeds the tile margin.
function turfVariation(x,z){
 return .52+.22*Math.sin(x*.79+Math.sin(z*.28)*.85)+.17*Math.cos(z*.57+Math.sin(x*.19))+.08*Math.sin((x-z)*1.27);
}

function habitatColor(kind){return [0,0,2,4,1][kind];}

function blades(style,detail){
 const rng=seededRandom(style*903+17);
 const segments=detail?4:2, count=detail?11:4;
 const positions=[],colors=[];
 const height=[0,.126,.245,.165,.285][style];
 const spread=[0,.34,.41,.41,.49][style];
 for(let blade=0;blade<count;blade++){
  const a=rng()*Math.PI*2;
  const radius=spread*(.13+.47*Math.pow(rng(),.81)), azimuth=rng()*Math.PI*2;
  const x=Math.cos(azimuth)*radius,z=Math.sin(azimuth)*radius;
  const h=height*(.47+rng()*.80), w=(style===3?.022:.010)*(.73+rng()*.76);
  const bend=h*(style===1?.37:.78)*(.73+rng()*.42);
  const side=[Math.cos(a),Math.sin(a)], lean=[side[1],-side[0]];
  function bladePoint(t,across){
   const width=w*(.53+.47*Math.sin(Math.PI*t))*(1-t*.98);
   const point=[x+lean[0]*bend*t*t+side[0]*across*width,
    -.015+h*t+Math.abs(across)*w*t*.25,z+lean[1]*bend*t*t+side[1]*across*width];
   return [point,.53+t*.43];
  }
  function tri(...vertices){for(const [p,t] of vertices){positions.push(...p);colors.push(t,t*.99,t*.91);}}
  for(let s=0;s<segments;s++){
   const l=s/segments,j=(s+1)/segments;
   if(detail){
    for(const [u,v] of [[-1,0],[0,1]]){
     tri(bladePoint(l,u),bladePoint(l,v),bladePoint(j,u));
     tri(bladePoint(j,u),bladePoint(l,v),bladePoint(j,v));
    }
   }else{
    tri(bladePoint(l,-1),bladePoint(l,1),bladePoint(j,-1));
    tri(bladePoint(j,-1),bladePoint(l,1),bladePoint(j,1));
   }
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.computeVertexNormals();
 return geometry;
}

export function installTurfMaterial(material){
 material.roughnessMap=null;
 material.roughness=.96;
 material.normalScale.multiplyScalar(.46);
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 lawnXZ;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nlawnXZ=position.xz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying vec2 lawnXZ;
   float lawnHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float lawnNoise(vec2 p){
    vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(lawnHash(i),lawnHash(i+vec2(1,0)),f.x),mix(lawnHash(i+vec2(0,1)),lawnHash(i+1.0),f.x),f.y);
   }`)
   .replace('#include <map_fragment>',`#include <map_fragment>
    float broad=lawnNoise(lawnXZ*.085);
    float clump=lawnNoise(lawnXZ*.8);
    float fine=lawnNoise(lawnXZ*12.0);
    float coverage=1.0-smoothstep(.03,.17,length(fwidth(lawnXZ)));
    float rootMat=lawnNoise(lawnXZ*vec2(5.0,1.7));
    vec3 green=(vec3(.77,.85,.78)+vec3(.24,.22,.14)*broad+.14*clump);
    diffuseColor.rgb*=green+coverage*(.12*fine+.08*rootMat);
   `);
 };
 material.customProgramCacheKey=()=> 'r9-turf-meadow-20261119';
 material.needsUpdate=true;
}

export function createLandscapeDetail(world,terrainY,loadMask,excluded,extraHabitat,mownLawns=[]){
 const root=new THREE.Group();
 root.name='R9_CAMPUS_LANDSCAPE_DETAIL';
 world.add(root);
 const maxDistance=46, detailDistance=14;
 const templates=[[],[],[]];
 const material=new THREE.MeshStandardMaterial({name:'R9_Grass_Blade',roughness:.96,side:THREE.DoubleSide,vertexColors:true});
 const shrubMaterial=new THREE.MeshStandardMaterial({name:'R9_Campus_Shrub_Foliage',roughness:.87,side:THREE.DoubleSide,vertexColors:true});
 const placement=new THREE.Object3D();
 const palette=COLORS.map(hex=>new THREE.Color(hex));
 const patches=new Map();
 const frustum=new THREE.Frustum(), matrix=new THREE.Matrix4();
 const stat={residentPatches:0,visiblePatches:0,lodNear:0,lodMid:0,grassClumps:0,shrubs:0,triangles:0,budget:BUDGET};
 let map=null, task=null, previous=-Infinity;
 function geometry(kind,detail){
  if(kind>=5)return templates[detail?1:2][kind]??=shrubGeometry(kind===5?'spreading':'upright',kind,detail);
  return templates[detail?1:2][kind]??=(blades(kind,detail));
 }
 function sample(x,z){
  const xx=Math.floor((x-map.origin_xz[0])/map.resolution_u),zz=Math.floor((z-map.origin_xz[1])/map.resolution_u);
  if(xx<0||zz<0||xx>=map.width||zz>=map.height)return 0;
  return map.data[zz*map.width+xx]||extraHabitat(x,z);
 }
 function clearOfEdge(x,z,r){
  return [[r,0],[-r,0],[0,r],[0,-r]].every(([dx,dz])=>sample(x+dx,z+dz)&&!excluded(x+dx,z+dz));
 }
 function create(ix,iz,detail){
  const rng=seededRandom(ix*16180339^iz*32452843), points=[[],[],[],[],[],[],[]];
  // Draw the same sequence at both LODs so the large tufts keep their position.
  for(let j=0;j<29;j++)for(let i=0;i<29;i++){
   const x=ix*TILE+(i+.04+.92*rng())*TILE/29, z=iz*TILE+(j+.04+.92*rng())*TILE/29;
   const ratio=rng(), yaw=rng()*Math.PI*2, size=.65+rng()*.56;
   const color=Math.floor(rng()*palette.length);
   if(ratio>(detail?.64:.21)||excluded(x,z))continue;
   const habitat=sample(x,z);
   if(!habitat)continue;
   const patch=turfVariation(x,z);
   const mown=mownLawns.some(([x0,z0,x1,z1])=>x>=x0&&x<=x1&&z>=z0&&z<=z1);
   const enoughRoom=clearOfEdge(x,z,.32);
   const shrub=!mown&&habitat===4&&ratio<.013&&patch>.48&&clearOfEdge(x,z,.98);
   if(!shrub&&ratio>(detail?.33+.30*patch:.08+.125*patch))continue;
   const mixed=habitat===3&&patch>.44?3:enoughRoom&&habitat===4&&patch>.57?4:enoughRoom&&habitat===2&&patch>.62?2:1;
   const kind=shrub?5+((ix+iz+i+j)&1):mixed;
   points[kind].push([x,z,yaw,size,color,patch,mown]);
  }
  const group=new THREE.Group();
  group.name=`R9_landscape_${ix}_${iz}_${detail?'near':'mid'}`;
  let grass=0,shrubs=0,triangles=0;
  for(let kind=1;kind<points.length;kind++){
   const list=points[kind];
   if(!list.length)continue;
   const g=geometry(kind,detail);
   const mesh=new THREE.InstancedMesh(g,kind>=5?shrubMaterial:material,list.length);
   mesh.name=kind>=5?`R9_Low_Shrub_Form_${kind-4}`:`R9_Grass_Form_${kind}`;
   list.forEach(([x,z,yaw,size,color,patch,mown],i)=>{
    const height=terrainY(x,z);
    placement.position.set(x,height-.018,z);
    placement.rotation.set(0,yaw,0);
    const width=size*(kind>=5?.43+.31*patch:.78+.31*patch);
    const heightScale=kind>=5?size*(.44+.29*patch):(.68+size*.24)*(.77+.34*patch)*(mown?.45:1);
    placement.scale.set(width,heightScale,width*(.88+patch*.22));
    placement.updateMatrix();
    mesh.setMatrixAt(i,placement.matrix);
    if(kind<5){
     const tint=palette[color].clone().lerp(palette[habitatColor(kind)],.48).multiplyScalar(.82+patch*.29);
     mesh.setColorAt(i,tint);
    }else{
     const light=.82+patch*.25;
     mesh.setColorAt(i,new THREE.Color().setRGB(light,light+.03,light-.03));
    }
   });
   mesh.receiveShadow=true;
   mesh.computeBoundingSphere();
   group.add(mesh);
   triangles+=g.attributes.position.count/3*list.length;
   if(kind>=5)shrubs+=list.length;else grass+=list.length;
  }
  root.add(group);
  return {group,grass,shrubs,triangles,detail,seen:0};
 }
 function update(camera,scale,time){
  if(time-previous<140)return;
  previous=time;
  const p=camera.position;
  root.visible=p.y<50*scale;
  if(!root.visible){
   for(const [key,val] of patches){
    val.group.traverse(node=>{if(node.isInstancedMesh)node.dispose();});
    root.remove(val.group);patches.delete(key);
   }
   Object.assign(stat,{residentPatches:0,visiblePatches:0,lodNear:0,lodMid:0,grassClumps:0,shrubs:0,triangles:0});
   return;
  }
  if(!task)task=loadMask().then(result=>{map=result;}).catch(error=>console.error(error));
  if(!map)return;
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const x=p.x/scale,z=p.z/scale;
  const candidates=[];
  for(let i=Math.floor((x-maxDistance/scale)/TILE);i<=Math.floor((x+maxDistance/scale)/TILE);i++){
   for(let j=Math.floor((z-maxDistance/scale)/TILE);j<=Math.floor((z+maxDistance/scale)/TILE);j++){
    const bx=i*TILE,bz=j*TILE;
    const bx2=bx+TILE,bz2=bz+TILE;
    const distance=Math.hypot(x-Math.min(bx2,Math.max(bx,x)),z-Math.min(bz2,Math.max(bz,z)))*scale;
    if(distance>maxDistance)continue;
    const y=terrainY(bx+TILE/2,bz+TILE/2);
    const volume=new THREE.Box3(new THREE.Vector3(bx,y-4,bz).multiplyScalar(scale),new THREE.Vector3(bx2,y+6,bz2).multiplyScalar(scale));
    if(!frustum.intersectsBox(volume))continue;
    candidates.push({i,j,distance});
   }
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  Object.assign(stat,{visiblePatches:0,lodNear:0,lodMid:0,grassClumps:0,shrubs:0,triangles:0});
  for(const p of patches.values())p.group.visible=false;
  let built=0;
  for(const {i,j,distance} of candidates){
   const detail=distance<detailDistance&&stat.triangles<BUDGET*.76;
   const key=`${i}_${j}_${detail}`;
   let patch=patches.get(key);
   if(!patch&&built<5){
    patches.set(key,patch=create(i,j,detail));built++;
   }
   if(!patch||stat.triangles+patch.triangles>BUDGET)continue;
   patch.group.visible=true;patch.seen=time;
   stat.triangles+=patch.triangles;
   stat.grassClumps+=patch.grass;
   stat.shrubs+=patch.shrubs;
   if(patch.grass||patch.shrubs){
    stat.visiblePatches++;stat[detail?'lodNear':'lodMid']++;
   }
  }
  for(const [key,patch] of patches){
   if(!patch.group.visible&&(time-patch.seen>1800||patches.size>130)){
    patch.group.traverse(node=>{if(node.isInstancedMesh)node.dispose();});
    root.remove(patch.group);patches.delete(key);
   }
  }
  stat.residentPatches=patches.size;
 }
 return {update,state:()=>({...stat,ready:!!map})};
}
