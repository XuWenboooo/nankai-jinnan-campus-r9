import * as THREE from 'three';
import {seededRandom,shrubGeometry} from './plant_geometry.js';

function polygonContains(x,z,area,inside){
 return inside(x,z,area.rings[0])&&!area.rings.slice(1).some(ring=>inside(x,z,ring));
}
function flatGeometry(triangles,height){
 const positions=[];
 for(const tri of triangles){
  const [a,b,c]=tri;
  const up=(b[1]-a[1])*(c[0]-a[0])-(b[0]-a[0])*(c[1]-a[1]);
  for(const [x,z] of up>0?tri:[a,c,b])positions.push(x,height(x,z),z);
 }
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 g.computeVertexNormals();
 return g;
}

function terrainMaterials(){
 const bank=new THREE.MeshStandardMaterial({name:'R9_Wet_Silt_And_Stone',color:'#6f6552',roughness:.97,side:THREE.DoubleSide});
 const path=new THREE.MeshStandardMaterial({name:'R9_Waterside_Paving',color:'#a7a395',roughness:.92});
 for(const [mat,strength] of [[bank,.23],[path,.14]]){
  mat.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 shoreP;')
    .replace('#include <project_vertex>','#include <project_vertex>\nshoreP=position.xz;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 shoreP;')
    .replace('#include <color_fragment>', `#include <color_fragment>
     vec2 cell=floor(shoreP*39.);
     float grain=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
     float strata=sin(shoreP.x*2.4+sin(shoreP.y*3.7))*.10+sin(shoreP.y*.228+shoreP.x*.51)*.19;
     float weight=1.-smoothstep(.024,.10,length(fwidth(shoreP)));
     diffuseColor.rgb*=(1.+(grain-.5)*${strength}*weight+strata*.28);
    `);
  };
  mat.customProgramCacheKey=()=>'/r9-waterside-grain/'+strength;
 }
 return {bank,path};
}

function reedGeometry(variant) {
 const rng=seededRandom(9281+variant*933);
 const vertices=[],colors=[];
 const tones=['#8e8b4b','#60733b','#9b9255','#6e7840'].map(h=>new THREE.Color(h));
 const tri=(a,b,c,tone)=>{
  vertices.push(...a,...b,...c);
  for(const p of [a,b,c])colors.push(tone.r*(.67+.31*p[1]),tone.g*(.71+.29*p[1]),tone.b*(.65+.32*p[1]));
 };
 for(let i=0;i<21;i++){
  const a=rng()*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
  const radius=Math.sqrt(rng())*.34,h=.34+rng()*.60;
  const bend=.03+rng()*.41,wide=.008+rng()*.018;
  const px=c*radius,pz=s*radius;
  const tone=tones[i%tones.length];
  const v=(t,side)=>{
   const w=wide*(.50+Math.sin(t*Math.PI))*(1-t*.93);
   return [px+c*bend*t*t-s*w*side,h*t,pz+s*bend*t*t+c*w*side];
  };
  for(let n=0;n<3;n++){
   const j=n/3,k=(n+1)/3;
   tri(v(j,-1),v(j,1),v(k,-1),tone);
   tri(v(k,-1),v(j,1),v(k,1),tone);
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.computeVertexNormals();
 return geometry;
}

export function attachWaterfront(world,data,scale,groundAt,inside,bindWater){
 const root=new THREE.Group();
 root.name='R9_WATERFRONT';
 world.add(root);
 const {bank,path}=terrainMaterials();
 const wet=new THREE.MeshStandardMaterial({name:'R9_Lake_Water',color:'#596f65',roughness:.28});
 const reed=new THREE.MeshStandardMaterial({name:'R9_Shore_Sedge',vertexColors:true,side:THREE.DoubleSide,roughness:.9});
 const windTime={value:0};
 reed.onBeforeCompile=shader=>{
  shader.uniforms.riparianWindTime=windTime;
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
uniform float riparianWindTime;`)
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    #ifdef USE_INSTANCING
     vec2 root=instanceMatrix[3].xz;
     float phase=dot(root,vec2(.247,.143));
     float wind=sin(riparianWindTime*1.6+phase)*.045+sin(riparianWindTime*2.8-phase)*.014;
     float height=max(0.,position.y);
     transformed.x+=height*height*wind;
     transformed.z+=height*height*wind*.62;
    #endif
   `);
 };
 reed.customProgramCacheKey=()=>'/r9-shore-sedge-wind';
 const plants=[];
 const sources=data.bodies.map(body=>({...body,bounds:body.bounds.map(Number)}));
 const surfaces=[];
 const dummy=new THREE.Object3D();
 const shallowBed=new THREE.Mesh(flatGeometry(data.outer_seam.flatMap(s=>s.triangles),()=>-.53),bank);
 shallowBed.name='R9_PERIMETER_CONTINUOUS_RIVERBED';
 root.add(shallowBed);
 const oppositeBank=new THREE.Mesh(flatGeometry(data.outer_bank.flatMap(s=>s.triangles),()=>-.055),
  new THREE.MeshStandardMaterial({name:'R9_River_Backshore',color:'#5e7047',roughness:.97}));
 oppositeBank.name='R9_PERIMETER_OPPOSITE_BANK';
 oppositeBank.receiveShadow=true;
 root.add(oppositeBank);
 const pathParts=data.paths.flatMap(path=>path.parts).map(part=>{
  const xx=part.rings[0].map(p=>p[0]),zz=part.rings[0].map(p=>p[1]);
  return {...part,bounds:[Math.min(...xx),Math.min(...zz),Math.max(...xx),Math.max(...zz)]};
 });
 const boundsIntersect=([a,b,c,d],lo,hi)=>lo.x<=c&&hi.x>=a&&lo.z<=d&&hi.z>=b;
 function pathContains(x,z){
  return pathParts.some(p=>x>=p.bounds[0]&&x<=p.bounds[2]&&z>=p.bounds[1]&&z<=p.bounds[3]&&polygonContains(x,z,p,inside));
 }
 function clearPathFlora(mesh){
  const g=mesh.geometry;
  if(!g.boundingBox)g.computeBoundingBox();
  const {min,max}=g.boundingBox;
  if(!pathParts.some(p=>boundsIntersect(p.bounds,min,max)))return;
  const p=g.getAttribute('position'),index=g.index;
  if(!index)return;
  const kept=[];
  for(let k=0;k<index.count;k+=3){
   const tri=[index.getX(k),index.getX(k+1),index.getX(k+2)];
   const x=(p.getX(tri[0])+p.getX(tri[1])+p.getX(tri[2]))/3;
   const z=(p.getZ(tri[0])+p.getZ(tri[1])+p.getZ(tri[2]))/3;
   if(!pathContains(x,z))kept.push(...tri);
  }
  g.setIndex(kept);
 }
 function makeBank(body){
  const positions=[];
  for(const area of body.parts)for(const ring of area.rings){
   for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    if(len<.18||len>28)continue;
    const mid=[(a[0]+b[0])*.5,(a[1]+b[1])*.5];
    const [loX,loZ,hiX,hiZ]=body.bounds;
    if(mid[0]-loX<.9||hiX-mid[0]<.9||mid[1]-loZ<.9||hiZ-mid[1]<.9)continue;
    let nx=dz/len,nz=-dx/len;
    if(polygonContains(mid[0]+nx*.25,mid[1]+nz*.25,area,inside)){nx=-nx;nz=-nz;}
    const skirt=.59;
    const A=[a[0]+nx*skirt,a[1]+nz*skirt],B=[b[0]+nx*skirt,b[1]+nz*skirt];
    const yA=Math.max(body.height+.12,Math.min(body.height+.86,groundAt(A[0],A[1])+0.025));
    const yB=Math.max(body.height+.12,Math.min(body.height+.86,groundAt(B[0],B[1])+0.025));
    const vA=[A[0],yA,A[1]],vB=[B[0],yB,B[1]];
    const lowA=[a[0]-nx*.10,body.height-.018,a[1]-nz*.10],lowB=[b[0]-nx*.10,body.height-.018,b[1]-nz*.10];
    positions.push(...vA,...vB,...lowA,...lowA,...vB,...lowB);
   }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.computeVertexNormals();
  const m=new THREE.Mesh(g,bank);
  m.name='R9_BANK_'+body.id;m.receiveShadow=true;root.add(m);
 }
 for(const [index,body] of sources.entries()){
  const mesh=new THREE.Mesh(flatGeometry(body.parts.flatMap(part=>part.triangles),()=>body.height),wet.clone());
  mesh.name='R9_WATER_'+body.id;root.add(mesh);bindWater(mesh);
  makeBank(body);
  for(let v=0;v<3;v++){
   const list=body.bank.filter((_,i)=>i%3===v);
   const rng=seededRandom(3513+index*117+v*63);
   const m=new THREE.InstancedMesh(reedGeometry(v),reed,list.length);
   m.name='R9_RIPARIAN_'+body.id+'_'+v;
   for(let i=0;i<list.length;i++){
    const [x,z,amount]=list[i];
    dummy.position.set(x,body.height-.065,z);dummy.rotation.set(0,rng()*Math.PI*2,0);
    const size=amount*(.59+.25*rng());
    dummy.scale.setScalar(size/scale);dummy.scale.y*=.8+rng()*.42;
    dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);
   }
   m.computeBoundingSphere();
   m.receiveShadow=true;root.add(m);plants.push(m);
  }
 }
 const coverMaterial=new THREE.MeshStandardMaterial({name:'R9_Datong_Bank_Shrub',vertexColors:true,roughness:.90,side:THREE.DoubleSide});
 for(let variant=0;variant<3;variant++){
  const list=data.shore_cover.filter((_,i)=>i%3===variant);
  const m=new THREE.InstancedMesh(shrubGeometry('spreading',variant,false),coverMaterial,list.length);
  m.name='R9_DATONG_DRY_BANK_'+variant;
  list.forEach(([x,z,w],i)=>{
   dummy.position.set(x,groundAt(x,z),z);dummy.rotation.set(0,i*2.39996,0);
   dummy.scale.set(w/scale,w*.53/scale,w/scale);
   dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);
  });
  m.computeBoundingSphere();m.receiveShadow=true;
  plants.push(m);root.add(m);
 }
 for(const item of data.paths){
  const source=item.parts.flatMap(part=>part.triangles);
  const height=(x,z)=>groundAt(x,z)+.045;
  const mesh=new THREE.Mesh(flatGeometry(source,height),path);
  mesh.name='R9_WATERSIDE_'+item.id;mesh.receiveShadow=true;root.add(mesh);
  surfaces.push({id:mesh.name,mode:'raise',triangles:source.map(tri=>tri.map(([x,z])=>[x,height(x,z),z]))});
 }
 function inEdit(x,z){
  return sources.find(({bounds:[x0,z0,x1,z1]})=>x>=x0&&x<=x1&&z>=z0&&z<=z1);
 }
 function waterHeight(x,z){
  const body=inEdit(x,z);
  if(body?.parts.some(area=>polygonContains(x,z,area,inside)))return body.height;
  return null;
 }
 function update(camera,now){
  windTime.value=now*.001;
  for(const p of plants){
   p.updateWorldMatrix(true,false);
   const sphere=p.boundingSphere.clone().applyMatrix4(p.matrixWorld);
   p.visible=camera.position.distanceTo(sphere.center)<sphere.radius+115;
  }
 }
 function addPavementTieIn(triangles){
  const p=[];
  for(const tri of triangles){
   const [a,b,c]=tri;
   const normal=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
   p.push(...(normal>0?[a,b,c]:[a,c,b]).flat());
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();
  const m=new THREE.Mesh(g,path);m.name='R9_MATIHU_CROSSING_PAVEMENT_TIE_IN';m.receiveShadow=true;root.add(m);
 }
 return {surfaces,inEdit,waterHeight,pathContains,clearPathFlora,update,addPavementTieIn,
  state:()=>({bodies:sources.map(({id,area,bank})=>({id,area,reeds:bank.length})),paths:surfaces.map(s=>s.id),shoreCover:data.shore_cover.length})};
}

