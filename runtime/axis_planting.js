import * as THREE from 'three';
import {seededRandom,shrubGeometry} from './plant_geometry.js';

const MODEL_PREFIX='buildings_s_-1_2_Library_';
const BED_ID=/^LIBRARY_(?:FLOWER_POOL|NORTH_(?:FLOWER_POOL|CENTRE_TIER))/;
const PREVIOUS_LEAF=/^(Shade|Mid|Sun)$/;
const PLANT_BUDGET=330000;
const NEAR=12;
const RANGE=155;
const UP=new THREE.Vector3(0,1,0);

function libraryBed(source,scale,index) {
 const id=source.id, north=id.includes('NORTH'), central=id.includes('CENTRE');
 const [a,b,c,d]=source.bounds;
 const halfX=(c-a)*scale*.5-.56,halfZ=(d-b)*scale*.5-.56;
 const centreX=(a+c)*.5,centreZ=(b+d)*.5,soil=source.roof-.52/scale;
 const outerZ=north?-1:1;
 const rng=seededRandom(7919+index*491);
 const plants=[];
 function point(form,x,z,width,height,light) {
  const pad=width*.92;
  x=THREE.MathUtils.clamp(x,-halfX+pad,halfX-pad);
  z=THREE.MathUtils.clamp(z,-halfZ+pad,halfZ-pad);
  plants.push({form,x:centreX+x/scale,z:centreZ+z/scale,y:soil,width:width/scale,height:height/scale,
   yaw:rng()*Math.PI*2,light,variant:Math.floor(rng()*3)});
 }
 const croppedHeight=central?.67:.73;
 const rows=Math.floor((halfZ*2-.35)/1.03);
 const cols=Math.floor((halfX*2-.35)/1.14);
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const t=(row+.5)/rows, u=(col+.5)/cols;
  const x=(u*2-1)*(halfX-.18)+(rng()-.5)*.19;
  const z=(1-2*t)*(halfZ-.15)*outerZ+(rng()-.5)*.17;
  const form=central||t>.30?'clipped':'spreading';
  const crown=(.65+rng()*.15)*(central?1.07:1);
  const height=croppedHeight*(.65+.54*t+rng()*.29)+(central?.11:0);
  point(form,x,z,crown,height,.99+t*.12+rng()*.16);
  if(row===0&&col%2===0)point('spreading',x+.46,z-.30*outerZ,.48,.41,.97+rng()*.14);
 }
 // A broken low edge masks the roots while leaving some soil visible close to the coping.
 const rowCount=Math.floor(halfX*2/.50);
 for(let i=0;i<rowCount;i++){
  const x=((i+.5)/rowCount*2-1)*(halfX-.24);
  const z=(halfZ-.31-rng()*.21)*outerZ;
  if(rng()>.18)point('groundcover',x,z,.22+rng()*.15,.16+rng()*.11,.99+rng()*.24);
 }
 if(!central){
  for(const side of [-1,1])for(const fraction of [-.35,.08,.55]){
   point('groundcover',(halfX-.37-rng()*.13)*side,halfZ*fraction,.24+rng()*.10,.20+rng()*.11,1+rng()*.17);
  }
 }
 return {id,plants,soil,bounds:[a+.55/scale,b+.55/scale,c-.55/scale,d-.55/scale]};
}

function treeBed(source,index,scale,groundAt){
 const {center:[x,z],angle,width_m,depth_m}=source;
 const rng=seededRandom(4079+index*671);
 const c=Math.cos(angle),s=Math.sin(angle);
 const y=groundAt(x,z,2.9)+.013+.31/scale-.0135;
 const plants=[];
 for(let i=0;i<12;i++){
  const angle=i*Math.PI/6+(rng()-.5)*.22;
  const dx=Math.cos(angle)*(width_m*.31+rng()*.18),dz=Math.sin(angle)*(depth_m*.31+rng()*.12);
  if(i%5===0)continue;
  plants.push({form:'groundcover',x:x+(dx*c+dz*s)/scale,z:z+(-dx*s+dz*c)/scale,y,
   width:(.14+rng()*.13)/scale,height:(.115+rng()*.10)/scale,variant:i%3,yaw:rng()*Math.PI*2,light:.86+rng()*.20});
 }
 return {id:'VALLEY_TREE_BED_'+(index+1),plants};
}

function groundFeatures(groups,scale,groundAt){
 return groups.map(({id,form,roots},j)=>({
  id, plants:roots.map(([x,z,w,h],i)=>({form,x,z,y:groundAt(x,z,5),width:w/scale,height:h/scale,
   light:.92+((i*5+j)%11)*.021,variant:(i+j)%3,yaw:(i+j*19)*2.399963})),
 }));
}

export function createAxisPlanting(world,scale,forecourt,valley,config,groundAt){
 const root=new THREE.Group();
 root.name='R9_AXIS_PLANTING';
 world.add(root);
 const beds=forecourt.colliders.filter(record=>BED_ID.test(record.id)).map((row,i)=>libraryBed(row,scale,i));
 const features=[...beds,...valley.planters.map((row,i)=>treeBed(row,i,scale,groundAt)),...groundFeatures(config.ground_groups,scale,groundAt)];
 const materials=new Map();
 const forms=new Map();
 const dummy=new THREE.Object3D(),tint=new THREE.Color();
 const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4();
 const states=new Map();
 const summary={visibleFeatures:[],nearBeds:0,instances:0,triangles:0,budget:PLANT_BUDGET,featureCount:features.length,roots:features.reduce((n,f)=>n+f.plants.length,0)};
 let last=-Infinity;
 for(const f of features){
  f.box=new THREE.Box3();
  for(const p of f.plants){
   f.box.expandByPoint(new THREE.Vector3(p.x-p.width,p.y,p.z-p.width).multiplyScalar(scale));
   f.box.expandByPoint(new THREE.Vector3(p.x+p.width,p.y+p.height*1.3,p.z+p.width).multiplyScalar(scale));
  }
 }
 function geometry(form,variant,detail){
  const key=[form,variant,detail].join('/');
  if(!forms.has(key))forms.set(key,shrubGeometry(form,variant,detail));
  return forms.get(key);
 }
 function material(form){
  if(!materials.has(form)){
   const ground=form==='groundcover';
   const m=new THREE.MeshStandardMaterial({name:'R9_Axis_'+form,color:ground?'#eaf3e2':'#f1f4e7',roughness:ground?.89:.81,
    vertexColors:true,side:THREE.DoubleSide});
   materials.set(form,m);
  }
  return materials.get(form);
 }
 function build(feature,detail){
  const group=new THREE.Group();
  group.name='R9_PLANTING_'+feature.id+'_'+(detail?'near':'mid');
  const rows=new Map();
  for(const p of feature.plants){
   const key=p.form+'/'+(detail?p.variant:0);
   if(!rows.has(key))rows.set(key,[]);
   rows.get(key).push(p);
  }
  let triangles=0;
  for(const list of rows.values()){
   const {form,variant}=list[0];
   const mesh=new THREE.InstancedMesh(geometry(form,detail?variant:0,detail),material(form),list.length);
   mesh.name='R9_AXIS_'+form;
   for(let i=0;i<list.length;i++){
    const {x,y,z,yaw,width,height,light}=list[i];
    dummy.position.set(x,y,z);
    dummy.quaternion.setFromAxisAngle(UP,yaw);
    dummy.scale.set(width,height,width);
    dummy.updateMatrix();
    mesh.setMatrixAt(i,dummy.matrix);
    tint.setRGB(light*1.035,light,light*.965);
    mesh.setColorAt(i,tint);
   }
   mesh.castShadow=form!=='groundcover';
   mesh.receiveShadow=true;
   mesh.computeBoundingSphere();
   triangles+=list.length*mesh.geometry.getAttribute('position').count/3;
   group.add(mesh);
  }
  root.add(group);
  return {group,triangles,detail};
 }
 function release(patch){
  for(const mesh of patch.group.children)mesh.dispose();
  patch.group.removeFromParent();
 }
 function update(camera,now){
  if(now-last<120)return false;
  last=now;
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const wanted=features.map(feature=>({feature,distance:feature.box.distanceToPoint(camera.position)}))
   .filter(({feature,distance})=>distance<RANGE&&frustum.intersectsBox(feature.box))
   .sort((a,b)=>a.distance-b.distance);
  let changed=false,nearBeds=0,triangles=0,instances=0;
  const visibleFeatures=[];
  const active=new Set();
  for(const {feature,distance} of wanted){
   let state=states.get(feature.id);
   const detail=distance<(state?.detail?NEAR+2:NEAR)&&triangles<PLANT_BUDGET*.65;
   if(!state||state.detail!==detail){
    if(state)release(state);
    state=build(feature,detail);
    states.set(feature.id,state);
    changed=true;
   }
   const visible=triangles+state.triangles<=PLANT_BUDGET;
   if(state.group.visible!==visible)changed=true;
   state.group.visible=visible;
   active.add(feature.id);
   if(!visible)continue;
   triangles+=state.triangles;
   instances+=feature.plants.length;
   nearBeds+=detail&&BED_ID.test(feature.id)?1:0;
   visibleFeatures.push(feature.id);
  }
  for(const [id,state] of states){
   if(!active.has(id)){release(state);states.delete(id);changed=true;}
  }
  Object.assign(summary,{visibleFeatures,nearBeds,triangles,instances});
  return changed;
 }
 function replaceOldFoliage(mesh){
  if(!mesh.name.startsWith(MODEL_PREFIX))return;
  const suffix=mesh.name.slice(MODEL_PREFIX.length);
  if(suffix.startsWith('Leaf_')&&PREVIOUS_LEAF.test(suffix.slice(5))){mesh.visible=false;return;}
  if(suffix!=='Planter_Soil')return;
  const g=mesh.geometry, p=g.getAttribute('position'), i=g.index;
  const kept=[];
  for(let k=0;k<i.count;k+=3){
   const tri=[i.getX(k),i.getX(k+1),i.getX(k+2)];
   const legacyStem=beds.some(({bounds:[x0,z0,x1,z1],soil})=>
    tri.every(j=>p.getX(j)>=x0&&p.getX(j)<=x1&&p.getZ(j)>=z0&&p.getZ(j)<=z1&&p.getY(j)>=soil-.008)&&
    tri.some(j=>p.getY(j)>soil+.014));
   if(!legacyStem)kept.push(...tri);
  }
  g.setIndex(kept);
 }
 return {update,replaceOldFoliage,state:()=>({...summary})};
}

