import {campusAssetUrl} from './hosted-assets.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {createSceneStreamer} from './scene_stream.js?v=r9-fast-1';
import {finishCommercialPaving} from './commercial_paving.js';
import {createLibraryLighting} from './library_lighting.js?v=r9-fast-2';
import {attachDormPlanting} from './dorm_planting.js';
import {createRoadLighting} from './road_lighting.js';
import {createLandscapeDetail,installTurfMaterial} from './landscape_detail.js';
import {attachSatelliteSite,removeRectangle} from './satellite_site.js';
import {attachCultureValley} from './culture_valley.js';
import {installAxisSurfaces} from './axis_surfaces.js';
import {createAxisPlanting} from './axis_planting.js';
import {shrubGeometry} from './plant_geometry.js';
import {loadFlowerProfiles} from './flower_profiles.js';
import {createWaterRenderer} from './water_render.js';
import {attachWaterfront} from './waterfront.js';
import {createWaterfrontFinish} from './waterfront_finish.js';
import {loadWalkWater} from './walk_water.js';
import {addAcademicEntranceIdentity,attachAcademicThresholds} from './academic_identity.js';
import {correctedPavingHeight,fixPavingMesh} from './paving_grades.js';
import {createMinimap} from './minimap.js';
import {createDuskSky} from './dusk_sky.js?v=r9-fast-2';
import {attachStreamingLOD,readStreamingLOD} from './streaming_lod.js?v=r9-fast-2';
import {restoreScienceCanalBridge} from './source_bridge.js';
import {restoreScience5Hardscape} from './source_passage_hardscape.js';
import {attachReviewGround} from './review_ground.js';

const $=id=>document.getElementById(id);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
$('canvas').append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#c5dce9');
const duskSky=createDuskSky(scene);
// Physically based daylight reflection, generated locally; no remote HDRI.
const reflectionScene=new THREE.Scene();const sky=new Sky();sky.scale.setScalar(10000);
sky.material.uniforms.turbidity.value=4;sky.material.uniforms.rayleigh.value=2;
sky.material.uniforms.mieCoefficient.value=.003;sky.material.uniforms.mieDirectionalG.value=.8;
sky.material.uniforms.sunPosition.value.set(-100,180,90).normalize();reflectionScene.add(sky);
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(reflectionScene,.04).texture;scene.environmentIntensity=.015;pmrem.dispose();sky.geometry.dispose();sky.material.dispose();
// Show the same daylight sky that creates the glazing reflections.
scene.background=scene.environment;
scene.backgroundIntensity=.85;
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.08,6000);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxDistance=4500;controls.minDistance=1;
const world=new THREE.Group();world.name='ENGINEERING_ROOT';scene.add(world);
const hemisphere=new THREE.HemisphereLight('#e5f2ff','#a2a591',1.25);
scene.add(hemisphere);
const sun=new THREE.DirectionalLight('#fff4de',2.5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.04;sun.shadow.bias=-.0002;
sun.shadow.camera.left=-110;sun.shadow.camera.right=110;sun.shadow.camera.top=110;sun.shadow.camera.bottom=-110;sun.shadow.camera.near=1;sun.shadow.camera.far=650;scene.add(sun,sun.target);
const libraryLighting=createLibraryLighting(scene,world,sun,hemisphere,renderer);
const roadLighting=createRoadLighting(world,()=>json('world/road_luminaire_positions.json').catch(error=>{
 failures.push(String(error));console.error(error);return {positions:[]};
}),terrainY,(x,z)=>satelliteSite.campusContains(x,z));
const canvas=renderer.domElement;
canvas.tabIndex=0;
canvas.setAttribute('aria-label','校园三维场景');
const loader=new GLTFLoader();const failures=[];const loadedAssets=new Set();const treeTemplates=new Map();const treeBatches=new Map();
let scale=1,walking=false,yaw=0,pitch=0,lastTime=performance.now(),lastTrees=-1,lastHud=0;
let treeInstances=[],treeForms=[],ground={},heightData,walkWater,colliders=[],views=[],frameSamples=[],walkingFrames=[];
const treeSlots=new Map();
const treeAssetIndex=new Map(),treeTemplatePending=new Set(),treeTemplateFailures=new Set();
let vegetationInitialized=false;
const shrubForms=['clipped','spreading','upright'];
const shrubHeights=[.91,.78,1.02];
const shrubWidths=[1.05,1.15,.89];
const trunkCells=new Map();
const walkSurfaceCells=new Map();
let walkSurfaceCount=0;
let treeColorsLinear=false;
let waterRenderer=null,waterfront=null,waterfrontFinish=null;
const EYE_HEIGHT=1.68, STEP_UP=.45, STEP_DOWN=.33, GRAVITY=12.1, JUMP_SPEED=4.65;
let walkOnGround=true,walkVerticalSpeed=0,jumpRequested=false;
let skyPercent=100;
try {
 const saved=localStorage.getItem('nkuR9SkyPercent');
 if(saved!==null&&Number.isFinite(+saved))skyPercent=THREE.MathUtils.clamp(+saved,20,125);
}catch{}
const surfacePbr=new Map();
const microdetail=new Map();
let dormPlantingTask,updateDormPlanting;
let activeRoute=null;
let hudFrames=[];
let entryAdjustment=null;
let lastTreePosition=null;
let shadowCell='';
const keys=new Set();const dummy=new THREE.Object3D();const point=new THREE.Vector3();
const walkKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight']);
const navigationSpeeds={walk:4.4,walkFast:8.8,orbit:24,orbitFast:54};
const orbitForward=new THREE.Vector3(),orbitOffset=new THREE.Vector3();
let dragLook=false;
let hadPointerLock=false;
const targetRenderFPS=72;
const renderInterval=1000/targetRenderFPS;
let nextFrameAt=0;
const previousFrameRotation=new THREE.Quaternion();
let lastRapidTurn=-Infinity;
let streamer=null;
let satelliteSite=null,landscape=null,cultureValley=null,academicThresholds=null,axisPlanting=null,flowerProfiles=null;
let shengfanApproach;
let datongApproach;
let teachingPassage;
let scienceCanalBridge;
let sourcePassages=[];
const sourceClearancesByOwner=new Map();
let reviewGround;
let reviewPassages=[];
let minimap;
let sceneInitialized=false;
const initialView=new URLSearchParams(location.search).get('view')||'DEFAULT';
const eagerMode=new URLSearchParams(location.search).get('load')==='all';
let treeMatrices;
const treeUpdates={count:0,cpuMs:0,matrixWrites:0,shadowInvalidations:0};
const refinementViews=[
 {id:'R9_DATONG_SCREEN',label:'大通学生中心 · 铝板近景',position:[294.5,3.24,29.8],target:[293,7,21],fov:60},
 {id:'R9_SCIENCE_FENCE_PAVING',label:'理科操场 · 围栏外铺装',position:[-861.8,3.15,494.9],target:[-875,1.65,493.8],fov:66},
 {id:'R9_DORM_5_WEST_PAVING',label:'学 5 宿舍群 · 西侧铺装',position:[-848,3,534],target:[-841.8,1.6,533.3],fov:64},
 {id:'R9_PAVING_WEST_ROAD',label:'校园西侧 · 道路修整',position:[-1017.25,4.15,309.75],target:[-1024.25,.4,301.75],fov:67},
 {id:'R9_PAVING_NORTH_ROAD',label:'校园北侧 · 路面修整',position:[-769.75,5.95,-670.25],target:[-776.75,.93,-678.25],fov:67},
 {id:'R9_DUSK_SKY',label:'图书馆南广场 · 暮色夜空',position:[-117,4.6,467],target:[-79,37,302],fov:64},
 {id:'R9_DATONG_ENTRY',label:'大通学活 · 西南入口',position:[201,3.9,66],target:[210,4.5,46],fov:66},
 {id:'R9_HUMANITIES_COMMERCE',label:'文科商业街 · 外部核对',position:[-974,92,-592],target:[-865,7,-537],fov:69},
 {id:'R9_SCIENCE_COMMERCE',label:'理科商业街 · 外部核对',position:[-852,79,363],target:[-758,8,444],fov:68},
 {id:'R9_SCIENCE_COMMERCE_WALK',label:'理科商业街 · 沿街漫游',position:[-723,3.4,405],target:[-723,3.3,472],fov:66},
 {id:'R9_SCIENCE_COMMERCE_STORES',label:'理科商业街 · 店面近景',position:[-725,3.8,423],target:[-709,3.55,425],fov:61},
 {id:'R9_CORE_AB_WEST_PASSAGE',label:'公共教学楼 A–B · 西侧架空通道',position:[-309,3.5,57.5],target:[-271,3.85,57.5],fov:68},
 {id:'R7_LIBRARY_FRONT',label:'图书馆 · 顶部正立面',position:[-84.5,34,590],target:[-84.5,34,295.5],fov:43},
 {id:'R7_LIBRARY_OBLIQUE',label:'图书馆 · 顶部斜侧面',position:[104,90,471],target:[-84.5,43,295.5],fov:44},
 {id:'R7_LIBRARY_PLAZA',label:'图书馆 · 广场漫游',position:[-98,4,463],target:[-93,12,295.5],fov:65},
 {id:'R7_LIBRARY_ENTRY',label:'图书馆 · 门窗近景',position:[-119,11,380],target:[-79,11,320],fov:65},
 {id:'R7_MUZHAI_WINGS',label:'R7 木斋馆 · 窗列与入口',position:[-1160,22,33],target:[-1081,13,1],fov:53},
 {id:'R7_HISTORIC_FLAT_ROOFS',label:'R7 历史建筑群 · 屋面',position:[-871,104,59],target:[-1014,13,2],fov:54},
 {id:'R7_COMMERCIAL_WALK',label:'R7 文科商业街 · 铺装',position:[-938,2.35,-612],target:[-930,1.55,-583],fov:61},
];

async function json(path){const r=await fetch('../'+path);if(!r.ok)throw Error(path+' HTTP '+r.status);return r.json();}
async function asset(path){const gltf=await loader.loadAsync(campusAssetUrl(path));loadedAssets.add(path);return gltf.scene;}
function terrainY(x,z){
 if(!heightData)return 1;
 const fx=Math.max(0,Math.min(ground.width-1.001,(x-ground.origin_xz[0])/ground.resolution));
 const fz=Math.max(0,Math.min(ground.height-1.001,(z-ground.origin_xz[1])/ground.resolution));
 const ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz;
 const a=heightData[iz*ground.width+ix],b=heightData[iz*ground.width+ix+1],c=heightData[(iz+1)*ground.width+ix],d=heightData[(iz+1)*ground.width+ix+1];
 const height=correctedPavingHeight(x,z,(a*(1-tx)+b*tx)*(1-tz)+(c*(1-tx)+d*tx)*tz);
 return reviewGround?.height(x,z,height)??height;
}
function indexWalkSurfaces(data){
 for(const surface of data.surfaces||[])for(const t of surface.triangles){
  const [a,b,c]=t,den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  if(Math.abs(den)<1e-10)continue;
  const item={id:surface.id,mode:surface.mode||'raise',a,b,c,den};
  const loX=Math.floor(Math.min(a[0],b[0],c[0])/16),hiX=Math.floor(Math.max(a[0],b[0],c[0])/16);
  const loZ=Math.floor(Math.min(a[2],b[2],c[2])/16),hiZ=Math.floor(Math.max(a[2],b[2],c[2])/16);
  for(let x=loX;x<=hiX;x++)for(let z=loZ;z<=hiZ;z++){const key=x+'_'+z;if(!walkSurfaceCells.has(key))walkSurfaceCells.set(key,[]);walkSurfaceCells.get(key).push(item);}
  walkSurfaceCount++;
 }
}
function walkableHeights(x,z,ceiling=Infinity){
 let replacement=-Infinity,raised=-Infinity,exclusive=-Infinity;
 for(const {a,b,c,den,mode} of walkSurfaceCells.get(Math.floor(x/16)+'_'+Math.floor(z/16))||[]){
  const aa=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den;
  const bb=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,cc=1-aa-bb;
  if(aa<-.000001||bb<-.000001||cc<-.000001)continue;
  const h=aa*a[1]+bb*b[1]+cc*c[1];
  if(h>ceiling+.00001)continue;
  if(mode==='exclusive')exclusive=Math.max(exclusive,h);
  else if(mode==='replace')replacement=Math.max(replacement,h);
  else raised=Math.max(raised,h);
 }
 if(exclusive!==-Infinity)return {replacement:exclusive,raised:-Infinity,hit:true};
 return {replacement,raised,hit:replacement!==-Infinity||raised!==-Infinity};
}
function groundY(x,z,ceiling=Infinity){
 if(satelliteSite?.inSport(x,z)&&!scienceCanalBridge?.contains(x,z))return 0.015;
 const {replacement,raised}=walkableHeights(x,z,ceiling);
 return Math.max(replacement!==-Infinity?replacement:terrainY(x,z),raised);
}
function inside(x,z,ring){let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])result=!result;
 }return result;}
function reviewPassageAllows(owner,x,z,feet,head){
 for(const passage of reviewPassages){
  if(owner!==passage.owner||head>=Math.min(passage.ceiling,passage.floor+2.93)||
    Math.abs(feet-passage.floor)>.48)continue;
  for(const [a,b] of passage.legs){
   const dx=b[0]-a[0],dz=b[1]-a[1];
   const vx=x-a[0],vz=z-a[1];
   const f=Math.max(0,Math.min(1,(vx*dx+vz*dz)/(dx*dx+dz*dz)));
   if(Math.hypot(vx-f*dx,vz-f*dz)<passage.width-.15)return true;
  }
 }
 return false;
}
function sourceClearanceAllows(owner,x,z,feet,head){
 for(const entry of sourceClearancesByOwner.get(owner)||[]){
  const [x0,z0,x1,z1]=entry.bounds;
  if(x<=x0||x>=x1||z<=z0||z>=z1||feet<entry.floor-1.1)continue;
  for(const zone of entry.zones){
   if((zone.min_y!==undefined&&feet<zone.min_y)||head>=zone.ceiling-.06)continue;
   if(inside(x,z,zone.outer)&&!zone.holes.some(ring=>inside(x,z,ring)))return true;
  }
 }
 return false;
}
function blocked(x,z,feet=groundY(x,z)){
 if(satelliteSite&&!satelliteSite.campusContains(x,z))return true;
 const beyondGrid=ground.width&&(x<ground.origin_xz[0]||z<ground.origin_xz[1]||
  x>ground.origin_xz[0]+(ground.width-1)*ground.resolution||z>ground.origin_xz[1]+(ground.height-1)*ground.resolution);
 if(beyondGrid&&!satelliteSite?.supportedInfill(x,z))return true;
 const external=!!satelliteSite?.isWet(x,z);
 const detailed=waterfront?.inEdit(x,z);
 const innerLevel=detailed?waterfront.waterHeight(x,z):null;
 const legacy=!detailed&&walkWater?.contains(x,z)&&!satelliteSite?.reclaimed(x,z)&&!satelliteSite?.inSport(x,z);
 if(external||innerLevel!==null||legacy){
  const {replacement,raised}=walkableHeights(x,z,feet+.055);
  const surface=Math.max(replacement,raised);
  // An indexed, above-water deck is required to cross a wet footprint.
  if(surface<(innerLevel??-.115)+.085||feet<surface-.06)return true;
 }
 const head=feet+EYE_HEIGHT/scale;
 let onDatongTerrace=false;
 if(datongApproach&&x>189&&x<226&&z>30&&z<69){
  const [dx,dz]=[x-datongApproach.anchor_xz[0],z-datongApproach.anchor_xz[1]];
  const [tx,tz]=datongApproach.tangent_xz;
  const along=dx*tx+dz*tz,forward=-dx*tz+dz*tx;
  onDatongTerrace=along>1.65&&along<29.1&&forward>.68&&forward<12.6+.062*(along-2);
 }
 for(const collider of colliders){
  if(x<=collider.bounds[0]-.25||x>=collider.bounds[2]+.25||z<=collider.bounds[1]-.25||z>=collider.bounds[3]+.25)continue;
  if(collider.base!==undefined&&head<=collider.base+.02)continue;
  if(collider.roof!==undefined&&feet>=collider.roof-.02)continue;
  // Native stair risers enter the body margin before the foot centre reaches the tread.
  if(collider.walkable_step&&collider.roof<=feet+.45/scale+.00001)continue;
  // The scoped stair surfaces replace the broad legacy slab. Retain narrow
  // pier footprints and the collision of the facade behind the platform.
  if(onDatongTerrace&&collider.id==='B_01184'&&collider.roof<=2.001&&
     collider.bounds[2]-collider.bounds[0]>5&&collider.bounds[3]-collider.bounds[1]>5)continue;
  if(collider.id===teachingPassage?.owner&&head<teachingPassage.underside_y-.06){
   const [x0,z0,x1,z1]=teachingPassage.bounds_xz;
   if(x>x0-.55&&x<x1+.35&&z>z0&&z<z1)continue;
  }
  if(reviewPassageAllows(collider.id,x,z,feet,head))continue;
  if(sourceClearanceAllows(collider.id,x,z,feet,head))continue;
  if(sourcePassages.some(portal=>{
   if(portal.owner!==collider.id||head>=portal.ceiling-.06)return false;
   const [x0,z0,x1,z1]=portal.xz;
   const along=.75,across=-.18;
   const mx=portal.axis===0?along:across,mz=portal.axis===2?along:across;
   return x>x0-mx&&x<x1+mx&&z>z0-mz&&z<z1+mz;
  }))continue;
  // Allow the exterior portico up to the reconstructed closed glass doors.
  if(collider.id===shengfanApproach?.body&&head<=shengfanApproach.underside_y){
   const [x0,z0,x1,z1]=shengfanApproach.portal_void;
   if(x>x0&&x<x1&&z>z0&&z<z1)continue;
  }
  if(collider.id==='B_01569'&&head<=8.90&&x>-708.35&&x<-704.72&&
     ((z>301.24&&z<309.76)||(z>311.24&&z<318.76)||(z>320.24&&z<327.76)))continue;
  // The inherited entry projections extend over the rebuilt exterior treads.
  if(collider.id==='B_01057'&&academicThresholds?.hasDoorApproach(x,z,feet))continue;
  if(inside(x,z,collider.outer)&&!(collider.holes||[]).some(h=>inside(x,z,h)))return true;
 }
 const cx=Math.floor(x/16),cz=Math.floor(z/16);
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const t of trunkCells.get((cx+dx)+'_'+(cz+dz))||[]){
  if(head<=t.position[1]||feet>=t.position[1]+t.height)continue;
  if(Math.hypot(x-t.position[0],z-t.position[2])<(t.collision_radius||.25)+.18)return true;
 }
 return false;
}
function setView(view){
 hudFrames=[];
 activeRoute=null;
 enterOrbit();
 if(view.id)$('view').value=view.id;
 const hint=$('view-hint');
 if(hint){
  hint.hidden=!view.accessNote;
  $('view-hint-text').textContent=view.accessNote||'';
  const source=$('view-hint-source');
  source.hidden=!view.sourceUrl;
  if(view.sourceUrl)source.href=view.sourceUrl;
 }
 camera.position.fromArray(view.position).multiplyScalar(scale);controls.target.fromArray(view.target).multiplyScalar(scale);
 camera.fov=view.fov||60;camera.far=view.reviewRadius||6000;
 camera.near=Math.max(.08,Math.min(34,camera.position.y*.018));
 camera.updateProjectionMatrix();controls.update();lastTrees=-1;lastTreePosition=null;
 streamer?.refresh();
}
function updateWalkControls(){
 $('walk').setAttribute('aria-pressed',String(walking));
 $('orbit').setAttribute('aria-pressed',String(!walking));
 $('cross').style.display=walking?'block':'none';
 $('instructions').textContent=walking
  ?`W/S 前后 · A/D 左右 · ${document.pointerLockElement===canvas?'移动鼠标转向':'按住左键拖动转向'} · 空格跳跃 · Shift 加速 · Esc 退出`
  :'WASD 平移 · Shift 加速 · 拖动旋转 · 滚轮缩放';
}
function enterOrbit(){
 walking=false;jumpRequested=false;walkVerticalSpeed=0;walkOnGround=true;
 activeRoute=null;
 keys.clear();
 dragLook=false;
 controls.enabled=true;
 if(document.pointerLockElement===canvas)document.exitPointerLock();
 controls.target.copy(camera.position).add(camera.getWorldDirection(point).multiplyScalar(30));
 updateWalkControls();
}
function enterWalk(){
 walking=true;controls.enabled=false;jumpRequested=false;walkVerticalSpeed=0;walkOnGround=true;
 camera.near=.08;camera.updateProjectionMatrix();
 const sx=camera.position.x/scale,sz=camera.position.z/scale;entryAdjustment=null;
 const entryCeiling=camera.position.y/scale;
 if(blocked(sx,sz,groundY(sx,sz,entryCeiling))){
  let found=null;
  for(let radius=1;radius<=180&&!found;radius++)for(let i=0;i<64;i++){const x=sx+radius*Math.cos(i*Math.PI/32),z=sz+radius*Math.sin(i*Math.PI/32);if(!blocked(x,z,groundY(x,z,entryCeiling))){found=[x,z];break;}}
  if(found){camera.position.x=found[0]*scale;camera.position.z=found[1]*scale;entryAdjustment={from:[sx,sz],to:found,reason:'nearest exterior position; orbit camera was inside building projection'};}
 }
 const direction=camera.getWorldDirection(new THREE.Vector3());yaw=Math.atan2(-direction.x,-direction.z);pitch=Math.asin(direction.y);
 camera.position.y=groundY(camera.position.x/scale,camera.position.z/scale,entryCeiling)*scale+EYE_HEIGHT;
 updateWalkControls();
}
function walkCandidate(x,z,feet){
 const rise=walkOnGround?STEP_UP:.023;
 const floor=groundY(x,z,feet+rise/scale);
 if((floor-feet)*scale>rise+.0001)return null;
 const grounded=walkOnGround&&(feet-floor)*scale<=STEP_DOWN;
 const destination=grounded?floor:feet;
 return blocked(x,z,destination)?null:{destination,grounded};
}
function moveWalk(forward,right,dt){
 const speed=(fastNavigation()?navigationSpeeds.walkFast:navigationSpeeds.walk)*dt/Math.max(1,Math.hypot(forward,right));
 const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*right)*speed;
 const dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*right)*speed;
 let x=camera.position.x/scale,z=camera.position.z/scale;
 let feet=(camera.position.y-EYE_HEIGHT)/scale;
 if(jumpRequested&&walkOnGround){
  walkOnGround=false;
  walkVerticalSpeed=JUMP_SPEED;
 }
 jumpRequested=false;
 const slices=Math.max(1,Math.ceil(dt/.028),Math.ceil(Math.hypot(dx,dz)/.13));
 const strideX=dx/(slices*scale),strideZ=dz/(slices*scale),time=dt/slices;
 for(let i=0;i<slices;i++){
  if(!walkOnGround){
   const velocity=walkVerticalSpeed-GRAVITY*time;
   const proposed=feet+(walkVerticalSpeed+velocity)*.5*time/scale;
   if(velocity<=0){
    const floor=groundY(x,z,feet+.025/scale);
    if(proposed<=floor){feet=floor;walkOnGround=true;walkVerticalSpeed=0;}
    else if(!blocked(x,z,proposed)){feet=proposed;walkVerticalSpeed=velocity;}
    else{walkVerticalSpeed=0;}
   }else if(blocked(x,z,proposed)){
    walkVerticalSpeed=0;
   }else{
    feet=proposed;walkVerticalSpeed=velocity;
   }
  }
  if(strideX){
   const target=walkCandidate(x+strideX,z,feet);
   if(target){x+=strideX;feet=target.destination;walkOnGround=target.grounded;}
  }
  if(strideZ){
   const target=walkCandidate(x,z+strideZ,feet);
   if(target){z+=strideZ;feet=target.destination;walkOnGround=target.grounded;}
  }
 }
 camera.position.set(x*scale,feet*scale+EYE_HEIGHT,z*scale);
 camera.rotation.set(pitch,yaw,0,'YXZ');
}
function fastNavigation(){
 return keys.has('ShiftLeft')||keys.has('ShiftRight');
}
function moveOrbit(forward,right,dt){
 if(!forward&&!right)return;
 camera.getWorldDirection(orbitForward);
 orbitForward.y=0;
 if(orbitForward.lengthSq()<1e-6){
  orbitForward.setFromMatrixColumn(camera.matrixWorld,1);
  orbitForward.y=0;
 }
 orbitForward.normalize();
 const speed=(fastNavigation()?navigationSpeeds.orbitFast:navigationSpeeds.orbit)*dt/Math.hypot(forward,right);
 orbitOffset.set(orbitForward.x*forward-orbitForward.z*right,0,orbitForward.z*forward+orbitForward.x*right).multiplyScalar(speed);
 camera.position.add(orbitOffset);
 controls.target.add(orbitOffset);
}
function startRoute(route){
 camera.position.fromArray(route.waypoints[0]).multiplyScalar(scale);
 camera.lookAt(new THREE.Vector3().fromArray(route.waypoints[1]).multiplyScalar(scale));enterWalk();pitch=0;
 activeRoute={id:route.id,points:route.waypoints,index:1,started:performance.now(),distance:0,blockedFrames:0};
 frameSamples=[];
}
function stepRoute(dt){
 if(activeRoute.index>=activeRoute.points.length)return;
 const p=activeRoute.points[activeRoute.index],dx=p[0]*scale-camera.position.x,dz=p[2]*scale-camera.position.z;
 if(Math.hypot(dx,dz)<.65){activeRoute.index++;return;}
 yaw=Math.atan2(-dx,-dz);const before=camera.position.clone();moveWalk(1,0,dt);
 const distance=Math.hypot(camera.position.x-before.x,camera.position.z-before.z);activeRoute.distance+=distance;
 if(distance<.0001)activeRoute.blockedFrames++;
}
function registerShrubTemplates(){
 const source=treeTemplates.get('young_05_0');
 const merged=new THREE.Box3();
 for(const part of source){
  part.geometry.computeBoundingBox();
  merged.union(part.geometry.boundingBox);
 }
 const nativeSize=merged.getSize(new THREE.Vector3());
 const material=new THREE.MeshStandardMaterial({name:'R9_Registered_Shrub',vertexColors:true,side:THREE.DoubleSide,roughness:.85});
 for(let f=0;f<shrubForms.length;f++)for(let lod=0;lod<4;lod++){
  const form=shrubForms[f];
  const geometry=shrubGeometry(form,0,lod===0,lod>=2);
  geometry.computeBoundingBox();
  const {min,max}=geometry.boundingBox;
  const factor=geometry.boundingBox.getSize(new THREE.Vector3());
  geometry.translate(-(min.x+max.x)*.5,-min.y,-(min.z+max.z)*.5);
  geometry.scale(nativeSize.x*shrubWidths[f]/factor.x,nativeSize.y*shrubHeights[f]/factor.y,nativeSize.z*shrubWidths[f]/factor.z);
  treeTemplates.set('r9_shrub_'+form+'_'+lod,[{name:form,geometry,material}]);
 }
}
function makeTreeBatch(key,form,lod,count){
 const group=new THREE.Group();group.name='VEG_'+key;
 const templates=treeTemplates.get(form+'_'+lod);
 const meshes=templates.map(t=>{
  const mesh=new THREE.InstancedMesh(t.geometry,t.material,count);mesh.name=group.name+'_'+t.name;mesh.count=0;
  mesh.castShadow=lod<2;mesh.receiveShadow=lod<2;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);return mesh;
 });world.add(group);const batch={group,meshes,capacity:count,members:[]};treeBatches.set(key,batch);return batch;
}
function treeLod(tree,sx,sy,sz){
 const [x,y,z]=tree.position;
 const dist=Math.hypot(x-sx,z-sz,Math.max(0,sy-y-8));
 const shrub=tree.category==='shrub';
 if(shrub&&dist>220&&!eagerMode)return null;
 const sizeFactor=shrub?Math.max(.10,Math.min(.5,tree.height/9)):1;
 return dist<36*sizeFactor?0:dist<117*sizeFactor?1:dist<275*sizeFactor?2:3;
}

async function loadTreeTemplate(item){
 const model=await asset(item.file||item.asset);
 model.updateMatrixWorld(true);
 const parts=[];
 model.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const colors=geometry.attributes.color;
  if(colors&&!treeColorsLinear){
   const color=new THREE.Color();
   for(let i=0;i<colors.count;i++){
    color.fromBufferAttribute(colors,i).convertSRGBToLinear();
    colors.setXYZ(i,color.r,color.g,color.b);
   }
  }
  mesh.material.side=THREE.DoubleSide;
  parts.push({name:mesh.name,geometry,material:mesh.material});
 });
 treeTemplates.set(item.form+'_'+item.lod,parts);
}

function requestTreeTemplate(key){
 if(treeTemplatePending.size>=2||treeTemplatePending.has(key)||treeTemplateFailures.has(key))return;
 const item=treeAssetIndex.get(key);
 if(!item)return;
 treeTemplatePending.add(key);
 loadTreeTemplate(item).catch(error=>{
  treeTemplateFailures.add(key);
  console.error(error);
 }).finally(()=>{
  treeTemplatePending.delete(key);
  lastTreePosition=null;
 });
}

function updateTrees(){
 if(!treeInstances.length)return;
 const sx=camera.position.x/scale,sz=camera.position.z/scale,sy=camera.position.y/scale;
 if(lastTreePosition&&Math.hypot(sx-lastTreePosition[0],sy-lastTreePosition[1],sz-lastTreePosition[2])<8)return;
 const started=performance.now();
 lastTreePosition=[sx,sy,sz];
 const buckets=new Map();
 for(let index=0;index<treeInstances.length;index++){
  const tree=treeInstances[index];
  const p=tree.position;
  let lod=treeLod(tree,sx,sy,sz);
  if(lod===null)continue;
  const form=tree.category==='shrub'?'r9_shrub_'+shrubForms[tree.shrubForm]:tree.variant;
  if(!treeTemplates.has(form+'_'+lod)){
   requestTreeTemplate(form+'_'+lod);
   while(lod<3&&!treeTemplates.has(form+'_'+lod))lod++;
  }
  const span=lod===3?512:128;const key=Math.floor(p[0]/span)+'_'+Math.floor(p[2]/span)+'_'+form+'_'+lod;
  if(!buckets.has(key))buckets.set(key,{form,lod,members:[]});buckets.get(key).members.push(index);
 }
 treeSlots.clear();
 let shadowChanged=false;
 // Retire obsolete LOD/spatial batches instead of retaining every previously
 // visited camera's GPU instance buffers. Prototype geometry stays shared.
 for(const [key,batch] of treeBatches){if(!buckets.has(key)){
  shadowChanged||=batch.meshes.some(mesh=>mesh.castShadow);
  world.remove(batch.group);batch.meshes.forEach(m=>m.dispose());treeBatches.delete(key);
 }}
 for(const [key,bucket] of buckets){
  const {members}=bucket;
  let batch=treeBatches.get(key);
  if(!batch||batch.capacity<members.length){
   if(batch){world.remove(batch.group);batch.meshes.forEach(m=>m.dispose());}
   batch=makeTreeBatch(key,bucket.form,bucket.lod,Math.max(Math.ceil(members.length/64)*64,64));
  }
  if(members.length!==batch.members.length||members.some((index,slot)=>batch.members[slot]!==index)){
   for(const mesh of batch.meshes){
    const {instanceMatrix}=mesh;
    for(let slot=0;slot<members.length;slot++){
     const source=members[slot]*16;
     for(let component=0;component<16;component++){
      instanceMatrix.array[slot*16+component]=treeMatrices[source+component];
     }
    }
    mesh.count=members.length;
    instanceMatrix.addUpdateRange(0,members.length*16);
    instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    treeUpdates.matrixWrites+=members.length;
   }
   batch.members=members;
   shadowChanged||=bucket.lod<2;
  }
  members.forEach((index,slot)=>{
   treeSlots.set(treeInstances[index].id,{node:batch.group.name,index:slot,lod:bucket.lod});
  });
 }
 if(shadowChanged){
  renderer.shadowMap.needsUpdate=true;
  treeUpdates.shadowInvalidations++;
 }
 treeUpdates.count++;
 treeUpdates.cpuMs+=performance.now()-started;
}
async function loadSurfacePbr(){
 const config=await json('world/pbr_surface_materials.json');
 const source=await json(config.source_manifest);
 const pictures=[];
 for(const [materialName,sourceId] of Object.entries(config.bindings)){
  const record=source.materials.find(item=>item.id===sourceId);
  if(!record)throw Error('Missing PBR material source '+sourceId);
  const textures=['albedo','normal_gl','roughness'].map(role=>{
   const texture=new THREE.Texture();
   texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
   texture.repeat.set(config.uv_source_units_per_repeat*scale/record.tile_m[0],config.uv_source_units_per_repeat*scale/record.tile_m[1]);
   texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
   texture.colorSpace=role==='albedo'?THREE.SRGBColorSpace:THREE.NoColorSpace;
   const file=record.maps[role].path;
   pictures.push(new Promise((resolve,reject)=>{
    const image=new Image();
    image.crossOrigin='anonymous';
    image.fetchPriority='low';
    image.onload=()=>{
     texture.image=image;
     texture.needsUpdate=true;
     renderer.shadowMap.needsUpdate=true;
     waterRenderer?.invalidate();
     resolve();
    };
    image.onerror=()=>reject(Error('材质图片读取失败 '+file));
    image.src='../'+file;
   }));
   return texture;
  });
  surfacePbr.set(materialName,{record,textures,uses:0,tint:config.base_tint_srgb||[1,1,1]});
 }
 return {ready:Promise.all(pictures).then(()=>true,error=>{
  failures.push(String(error));
  $('error').textContent=failures.at(-1);
  console.error(error);
  return false;
 })};
}
function bindRebuiltGrass(material,kind){
 const {record,textures}=surfacePbr.get('grass');
 material.color.set(kind==='grove'?'#dce9d4':'#f8faec');
 material.map=textures[0];
 material.normalMap=textures[1];
 material.normalScale.setScalar(record.normal_scale_initial_inferred);
 material.userData.pbrSourceId=record.id;
 installTurfMaterial(material);
}
async function loadMicrodetail(){
 const textureLoader=new THREE.TextureLoader();
 await Promise.all(['clay','mineral'].map(async name=>{
  const maps=await Promise.all(['albedo','normal'].map(async role=>{
   const map=await textureLoader.loadAsync('../assets/materials/r6_microdetail/'+name+'_'+role+'.png');
   map.wrapS=map.wrapT=THREE.RepeatWrapping;
   map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
   map.colorSpace=role==='albedo'?THREE.SRGBColorSpace:THREE.NoColorSpace;
   return map;
  }));
  microdetail.set(name,maps);
 }));
}

function prepareModel(model,kind){
 if(kind==='building')addAcademicEntranceIdentity(model);
 model.traverse(mesh=>{
 if(!mesh.isMesh)return;mesh.castShadow=kind==='building'||kind==='ground_flora';mesh.receiveShadow=true;
 const uv=mesh.geometry.attributes.uv;
 if(kind==='surface'&&uv&&mesh.name.includes('__top_gap_completion')){
  // The direct append writer stores metric V. Match the existing terrain
  // GLB exporter, which stores V with its top-left origin.
  const p=mesh.geometry.attributes.position;
  for(let i=0;i<uv.count;i++)uv.setXY(i,p.getX(i)*.25,1-p.getZ(i)*.25);
  uv.needsUpdate=true;
 }
 if(!mesh.material.userData.sourceColorConverted){mesh.material.color.convertSRGBToLinear();mesh.material.userData.sourceColorConverted=true;}
 if(mesh.material.map){mesh.material.map.anisotropy=renderer.capabilities.getMaxAnisotropy();}
 // Explicit environment binding gives glazing a readable daylight reflection;
 // setting only envMapIntensity while using scene.environment is not a
 // per-material override in this renderer version.
 if(/Glass/i.test(mesh.material.name)){mesh.material.envMap=scene.environment;mesh.material.envMapIntensity=.06;}
 if(/^R8_Window_Glass/.test(mesh.material.name))mesh.material.envMapIntensity=.094;
 if(/^R9_(TAS|Optics)_Glass/.test(mesh.material.name))mesh.material.envMapIntensity=.22;
 if(mesh.material.name==='R9_Shengfan_Entry_Glass')mesh.material.envMapIntensity=.16;
 if(mesh.material.name==='R9_Computer_Glass')mesh.material.envMapIntensity=.145;
 if(mesh.material.name==='R9_Datong_Entry_Glass')mesh.material.envMapIntensity=.14;
 if(mesh.material.name==='R9_Science_Shop_Glass')mesh.material.envMapIntensity=.15;
 if(/^R9_Core_.*Glass/.test(mesh.material.name))mesh.material.envMapIntensity=.11;
 libraryLighting.bindWindow(mesh);
 if(kind==='surface'&&surfacePbr.has(mesh.material.name)){
  const {record,textures,tint}=surfacePbr.get(mesh.material.name);
  mesh.material.color.fromArray(tint).convertSRGBToLinear();
  mesh.material.map=textures[0];
  mesh.material.normalMap=textures[1];
  mesh.material.roughnessMap=textures[2];
  mesh.material.normalScale.setScalar(record.normal_scale_initial_inferred);
  mesh.material.roughness=record.roughness_multiplier_initial;
  mesh.material.metalness=record.metalness;
  mesh.material.userData.pbrSourceId=record.id;
  if(mesh.material.name==='grass')installTurfMaterial(mesh.material);
  surfacePbr.get(mesh.material.name).uses++;
  mesh.material.needsUpdate=true;
 }
 const name=mesh.material.name;
 const clay=kind==='building'&&/^Muzhai_Photo_Red_/.test(name);
 const mineral=(kind==='surface'&&/^(paving|stone_paving|brick_paving|timber_deck|tennis_blue|tennis_lime)$/.test(name))||
  (kind==='building'&&/^(Photographed_Light_Gray_Stone|Warm_Limestone|Historic_Pale_Roof_Deck|Historic_Roof_Stone_Coping|Zhou_Statue_Gray_Granite|R9_Warm_Gray_Balcony_Mineral)$/.test(name));
 if(mesh.geometry.attributes.uv&&!mesh.material.map&&(clay||mineral)){
  const [albedo,normal]=microdetail.get(clay?'clay':'mineral');
  mesh.material.map=albedo;
  mesh.material.normalMap=normal;
  mesh.material.normalScale.setScalar(clay?.65:.4);
 }
 if(kind==='surface')finishCommercialPaving(mesh,model.name,scale);
 if(kind==='ground_flora'){flowerProfiles?.refine(mesh);waterfrontFinish.refineFlora(mesh);waterfront?.clearPathFlora(mesh);}
 satelliteSite?.clipMaterial(mesh,kind);
 if(kind==='surface'&&shengfanApproach.sectors.includes(model.name))removeRectangle(mesh,shengfanApproach.bounds_xz);
 if(kind==='surface')fixPavingMesh(mesh,model.name);
 if(kind==='surface')reviewGround?.grade(mesh,model.name);
 if(kind==='surface')roadLighting.bindSurface(mesh.material);
 if(kind==='surface'&&mesh.material.name==='water')waterRenderer.bind(mesh);
 cultureValley?.finish(mesh,kind);
 installAxisSurfaces(mesh,kind,scale);
 if(kind==='surface')waterfrontFinish.finishPaving(mesh);
 if(kind==='building')axisPlanting?.replaceOldFoliage(mesh);
 });}

function indexTreeTransforms(){
 treeMatrices=new Float32Array(treeInstances.length*16);
 treeInstances.forEach((tree,index)=>{
  if(tree.category==='shrub'){
   const seed=Math.imul(Number(tree.id.slice(1)),0x9e3779b1)>>>0;
   tree.shrubForm=seed%shrubForms.length;
  }
  dummy.position.fromArray(tree.position);
  dummy.rotation.set(0,tree.rotation_y,0);
  dummy.scale.fromArray(tree.scale);
  dummy.updateMatrix();
  treeMatrices.set(dummy.matrix.elements,index*16);
 });
}

async function loadSceneItem(item, signal){
 const assetUrl=campusAssetUrl(item.file);
 const response=await fetch(assetUrl,{signal});
 if(!response.ok)throw Error(item.file+' HTTP '+response.status);
 const bytes=await response.arrayBuffer();
 signal?.throwIfAborted();

 const model=(await loader.parseAsync(bytes,new URL('.',assetUrl).href)).scene;
 model.name=item.id;
 prepareModel(model,item.kind);
 loadedAssets.add(item.file);
 return model;
}

function disposeSceneItem(model){
 world.remove(model);
 const textures=new Set(),geometry=new Set(),materials=new Set();
 const sharedTextures=new Set([scene.environment]);
 for(const {textures:maps} of surfacePbr.values())for(const texture of maps)sharedTextures.add(texture);
 for(const maps of microdetail.values())for(const texture of maps)sharedTextures.add(texture);
 model.traverse(node=>{
  if(!node.isMesh)return;
  waterRenderer?.unregister(node);
  geometry.add(node.geometry);
  for(const material of Array.isArray(node.material)?node.material:[node.material]){
   materials.add(material);
   for(const value of Object.values(material))
    if(value?.isTexture&&!sharedTextures.has(value))textures.add(value);
  }
 });
 for(const item of geometry)item.dispose();
 for(const item of materials)item.dispose();
 const bitmaps=new Set();
 for(const item of textures){
  item.dispose();
  if(typeof ImageBitmap!=='undefined'&&item.image instanceof ImageBitmap)bitmaps.add(item.image);
 }
 for(const bitmap of bitmaps)bitmap.close();
 renderer.shadowMap.needsUpdate=true;
 waterRenderer?.invalidate();
}
async function parallelLoad(items,callback,workers=5){let next=0,done=0;await Promise.all(Array.from({length:workers},async()=>{
 while(next<items.length){const item=items[next++];try{await callback(item)}catch(e){failures.push(String(e));$('error').textContent=failures.at(-1)}
 if(eagerMode){done++;$('status').textContent='正在加载连续校园 '+done+' / '+items.length;}
 }}));}
async function prewarmSurroundings(){
 const target=new THREE.WebGLRenderTarget(144,90);
 const warmCamera=camera.clone();
 warmCamera.fov=104;
 warmCamera.updateProjectionMatrix();
 const origin=warmCamera.position.clone();
 const direction=new THREE.Vector3();
 try{
  await renderer.compileAsync(scene,camera);
  for(let i=0;i<4;i++){
   await new Promise(requestAnimationFrame);
   const angle=i*Math.PI*.5;
   direction.set(Math.sin(angle),-.11,Math.cos(angle)).add(origin);
   warmCamera.lookAt(direction);
   renderer.setRenderTarget(target);
   renderer.render(scene,warmCamera);
   renderer.setRenderTarget(null);
  }
 }finally{
  renderer.setRenderTarget(null);
  target.dispose();
  renderer.shadowMap.needsUpdate=true;
 }
}
async function boot(){
 const files=[
  'world/coordinate_frames.json','world/runtime_asset_manifest.json','world/cameras.json',
  'world/r8_review_cameras.json','world/r9_review_cameras.json','runtime/maps/jinnan_overview.json',
  'world/vegetation_registry.json','assets/vegetation/tree_assets.json','assets/surfaces/ground_height.json',
  'world/r9_campus_perimeter.json','world/r9_science_satellite.json','world/r9_science_fixture_ranges.json',
  'world/r9_library_forecourt.json','world/r9_culture_valley.json','world/r9_axis_planting.json',
  'world/r9_waterfront.json','world/r9_waterfront_finish.json','world/r9_shengfan_entrance.json',
  'world/r9_review_ground.json','world/r9_datong_entrance.json','world/r9_teaching_passage.json',
  'world/r9_native_passages.json','world/r9_review_passages.json',
 ];
 const data=new Map(files.map(file=>[file,json(file)]));
 const read=file=>data.get(file);
 const framesTask=read(files[0]).then(frames=>{
  scale=frames.source_to_engineering.uniform_scale;
  world.scale.setScalar(scale);
  return loadSurfacePbr();
 });
 const heightTask=read('assets/surfaces/ground_height.json').then(async terrain=>{
  const response=await fetch('../'+terrain.file);
  if(!response.ok)throw Error(terrain.file+' HTTP '+response.status);
  return new Float32Array(await response.arrayBuffer());
 });
 const walksTask=read('world/runtime_asset_manifest.json').then(manifest=>
  manifest.walkable_surface_file?json(manifest.walkable_surface_file):null);
 const treesTask=read('world/vegetation_registry.json').then(registry=>json(registry.instance_file));
 const textureLoader=new THREE.TextureLoader();
 const waterTask=read('world/r9_waterfront.json').then(config=>Promise.all(
  ['assets/materials/water_ripple_normal.png',config.atlas.file].map(file=>textureLoader.loadAsync('../'+file))
 ));
 const [worldData,elevation,walks,trees,water,wetPaths,flowers,streamIndex,lodData,surfaceDetails]=await Promise.all([
  Promise.all(data.values()),heightTask,walksTask,treesTask,waterTask,loadWalkWater(),
  loadFlowerProfiles(),eagerMode?null:json('world/streaming_assets.json'),eagerMode?null:readStreamingLOD(),
  framesTask,loadMicrodetail(),
 ]);
 const [,manifest,cameras,earlierCameras,facadeCameras,map,,treeAssets,terrain,
  perimeter,sport,fixtureRanges,forecourt,valley,axisPlantingConfig,
  waterConfig,waterFinishConfig,entry,groundPlan,datongPlan,teachingPlan,nativePassages,passagePlan]=worldData;
 views=[...cameras.views,...facadeCameras.views,...refinementViews,...earlierCameras.views];
 ground=terrain;
 heightData=elevation;
 walkWater=wetPaths;
 flowerProfiles=flowers;
 minimap=createMinimap(map);
 if(new URLSearchParams(location.search).get('dusk')==='1')setDusk(true);
 shengfanApproach=entry;
 waterfrontFinish=createWaterfrontFinish(waterFinishConfig,scale);
 const [wave,depth]=water;
 wave.wrapS=wave.wrapT=THREE.RepeatWrapping;
 wave.anisotropy=4;
 depth.generateMipmaps=false;
 depth.minFilter=THREE.LinearFilter;
 waterRenderer=createWaterRenderer(renderer,scene,camera,{wave,depth},waterConfig.atlas,scale);
 const forecourtBounds=[forecourt.planting_exclusion,forecourt.north_planting_exclusion].filter(Boolean);
 satelliteSite=attachSatelliteSite({world,terrainY,inside,perimeter,sport,fixtureRanges,
    forecourtBounds,northForecourt:forecourt.north_planting_exclusion,bindSurface:roadLighting.bindSurface,bindGrass:bindRebuiltGrass,
    bindWater:waterRenderer.bind,waterEdits:waterConfig.bodies.map(body=>body.bounds)});
 const inForecourt=(x,z)=>forecourtBounds.some(([x0,z0,x1,z1])=>x>=x0&&x<=x1&&z>=z0&&z<=z1);
 const plantGround=(x,z)=>satelliteSite.inSport(x,z)?.015:terrainY(x,z);
 landscape=createLandscapeDetail(world,plantGround,async()=>{
  const [metadata,response]=await Promise.all([json('world/r9_landscape_mask.json'),fetch('../world/r9_landscape_mask.deflate')]);
  if(!response.ok)throw Error('植被数据 HTTP '+response.status);
  const stream=response.body.pipeThrough(new DecompressionStream('deflate'));
  const data=new Uint8Array(await new Response(stream).arrayBuffer());
  if(data.length!==metadata.byte_length)throw Error('植被栅格长度不符');
  return {...metadata,data};
 },(x,z)=>inForecourt(x,z)||satelliteSite.blockPlant(x,z)||waterfront?.pathContains(x,z)||(x>-558&&x<-491&&z>-681&&z<-657),satelliteSite.extraHabitat,valley.mown_lawns);
 libraryLighting.addFixtures(scale,terrainY);
 reviewGround=attachReviewGround(world,groundPlan,inside,surfacePbr);
 indexWalkSurfaces(reviewGround);
 if(walks)indexWalkSurfaces(walks);
 indexWalkSurfaces(walkWater);
 scienceCanalBridge=restoreScienceCanalBridge(world);
 indexWalkSurfaces(scienceCanalBridge);
 indexWalkSurfaces(forecourt);
 waterfront=attachWaterfront(world,waterConfig,scale,(x,z)=>groundY(x,z,3),inside,waterRenderer.bind);
 indexWalkSurfaces(waterfront);
 waterfront.addPavementTieIn(walkWater.pavementTieIn);
 waterfrontFinish.finishPaving(world.getObjectByName('R9_WATERSIDE_MATIHU_SOUTH'));
 academicThresholds=attachAcademicThresholds(world);
 indexWalkSurfaces(academicThresholds);
 datongApproach=datongPlan;
 teachingPassage=teachingPlan;
 sourcePassages=nativePassages.openings;
 for(const entry of nativePassages.reconstructed||[]){
  const x=[],z=[];
  for(const zone of entry.zones)for(const p of zone.outer){
   x.push(p[0]);z.push(p[1]);
  }
  if(!x.length)continue;
  const placed={...entry,bounds:[Math.min(...x),Math.min(...z),Math.max(...x),Math.max(...z)]};
  if(!sourceClearancesByOwner.has(entry.owner))sourceClearancesByOwner.set(entry.owner,[]);
  sourceClearancesByOwner.get(entry.owner).push(placed);
  if(entry.floor_patch?.length)indexWalkSurfaces({surfaces:[{id:entry.id,mode:'raise',triangles:entry.floor_patch}]});
  const [start,end]=entry.walk,eye=entry.floor+EYE_HEIGHT/scale;
  views.push({id:entry.id,label:entry.label,position:[start[0],eye,start[1]],
   target:[end[0],eye,end[1]],fov:72,accessNote:entry.access_note,sourceUrl:entry.source_url});
 }
 reviewPassages=passagePlan.paths.map(p=>({
  ...p,legs:p.walk.slice(1).map((b,i)=>[p.walk[i],b]),
 }));
 for(const passage of reviewPassages){
  const [a,b]=passage.walk,y=passage.floor+EYE_HEIGHT/scale;
  const label=passage.id+' · '+passage.title+(passage.source_scope==='covered_entry_only'?' · 门前':'');
  views.push({id:'R9_REVIEW_'+passage.id,label,
   position:[a[0],y,a[1]],target:[b[0],y,b[1]],fov:69});
 }
 const passageHardscape=sourcePassages.some(portal=>portal.id==='R9_SCIENCE5_LINK')
  ?restoreScience5Hardscape(world,microdetail.get('mineral')):{surfaces:[],colliders:[]};
 indexWalkSurfaces(passageHardscape);
 for(const portal of sourcePassages){
  const [start,end]=portal.walk;
  const eye=portal.floor+EYE_HEIGHT/scale;
  views.push({id:portal.id,label:portal.label,position:[start[0],eye,start[1]],
   target:[end[0],eye,end[1]],fov:69});
 }
 indexWalkSurfaces(datongApproach);
 const [,entryZ0,,entryZ1]=entry.bounds_xz;
 indexWalkSurfaces({surfaces:entry.treads.map(([a,b,y],i)=>({
  id:'R9_SHENGFAN_TREAD_'+i,mode:'replace',
  triangles:[[[a,y,entryZ0],[a,y,entryZ1],[b,y,entryZ1]],[[a,y,entryZ0],[b,y,entryZ1],[b,y,entryZ0]]]
 }))});
 cultureValley=attachCultureValley(world,valley,scale,groundY);
 cultureValley.setDusk(libraryLighting.state().dusk);
 axisPlanting=createAxisPlanting(world,scale,forecourt,valley,axisPlantingConfig,groundY);
 colliders=[...(manifest.colliders||[]).filter(item=>item.id!==forecourt.building),...forecourt.colliders,
  ...cultureValley.occupancies,...passageHardscape.colliders];
 treeInstances=trees.instances;treeForms=treeAssets.forms;treeColorsLinear=treeAssets.vertex_colors_linear===true;
 treeInstances=treeInstances.filter(tree=>satelliteSite.campusContains(tree.position[0],tree.position[2])&&!satelliteSite.inSport(tree.position[0],tree.position[2])&&!inForecourt(tree.position[0],tree.position[2]));
 const groveVariants=treeForms.map(f=>f.id).filter(id=>/^spreading_/.test(id));
 for(const [x,z,variant,size,yaw] of perimeter.trees){
  if(!groveVariants.length)break;
  treeInstances.push({id:`SATELLITE_GROVE_${x}_${z}`,category:'tree',position:[x,terrainY(x,z),z],
    rotation_y:yaw,scale:[size*.70,size*.78,size*.70],variant:groveVariants[variant%groveVariants.length],
    height:6.2*size,collision_radius:.15});
 }
 for(const tree of treeInstances){
  waterfrontFinish.refineShrub(tree);
  const root=cultureValley.treeHeights.get(tree.id);
  if(root!==undefined)tree.position[1]=root;
  const [x,y,z]=tree.position;
  if(x>=-894&&x<=-867&&((z>=-20&&z<=-12.75)||(z>=13.5&&z<=21.5)))
   tree.position[1]=reviewGround.height(x,z,y);
 }
 indexTreeTransforms();
 for(const tree of treeInstances){if(tree.category!=='tree')continue;const key=Math.floor(tree.position[0]/16)+'_'+Math.floor(tree.position[2]/16);if(!trunkCells.has(key))trunkCells.set(key,[]);trunkCells.get(key).push(tree);}
 const passageOptions=document.createElement('optgroup');
 passageOptions.label='按像素南开重建的通道';
 for(const view of views){
  const option=document.createElement('option');
  option.textContent=view.label;
  option.value=view.id;
  (view.id.startsWith('R9_SOURCE_SCAN_')?passageOptions:$('view')).append(option);
 }
 if(passageOptions.childElementCount)$('view').append(passageOptions);
 setView(views.find(v=>v.id===initialView)||views[0]);
 if(new URLSearchParams(location.search).get('walk')==='1'){enterWalk();canvas.focus({preventScroll:true});}
 const showScene=()=>{
  renderer.render(scene,camera);
  $('boot-poster').hidden=true;
  performance.mark('campus:first-scene');
 };
 let treesReady=false,surfaceTexturesReady=false;
 surfaceDetails.ready.then(complete=>{
  surfaceTexturesReady=complete;
  streamer?.refresh();
 });
 const loadItems=eagerMode?manifest.assets.map(a=>({...a,type:'scene'})):[];
 for(const form of treeForms)for(const item of form.assets)
  treeAssetIndex.set(form.id+'_'+item.lod,{...item,form:form.id,type:'tree'});
 if(eagerMode)loadItems.push(...treeAssetIndex.values());
 else{
  const [sx,sy,sz]=camera.position.toArray().map(value=>value/scale);
  const needed=new Set(['young_05_0']);
  for(const item of treeAssetIndex.values())if(item.lod===3)needed.add(item.form+'_3');
  for(const tree of treeInstances)if(tree.category==='tree')
   needed.add(tree.variant+'_'+treeLod(tree,sx,sy,sz));
  for(const key of needed){
   const template=treeAssetIndex.get(key);
   if(!template)throw Error('植被资源索引缺失 '+key);
   loadItems.push(template);
  }
 }
 const loadTemplates=()=>parallelLoad(loadItems,async item=>{
  if(item.type==='tree')await loadTreeTemplate(item);
  else{
   const model=await asset(item.file||item.asset);
   model.name=item.id;
   prepareModel(model,item.kind);
   world.add(model);
  }
 });
 function placeTrees(){
  for(const item of loadItems)if(item.type==='tree'&&!treeTemplates.has(item.form+'_'+item.lod))
   throw Error('植被资源读取失败 '+item.form+'_'+item.lod);
  registerShrubTemplates();
  updateTrees();
  vegetationInitialized=true;
  treesReady=true;
 }
 if(eagerMode){
  await Promise.all([loadTemplates(),surfaceDetails.ready]);
  placeTrees();
  sceneInitialized=true;
  await renderer.compileAsync(scene,camera);
  showScene();
  $('status').textContent=failures.length?'加载存在问题':'连续校园已就绪';
  window.campus.ready=failures.length===0;
 }else{
  const files=new Map(manifest.assets.map(item=>[item.id,item.file]));
  if(streamIndex.assets.length!==files.size||new Set(streamIndex.assets.map(item=>item.id)).size!==files.size||
     streamIndex.assets.some(item=>files.get(item.id)!==item.file))throw Error('分区索引与场景清单不符');
  let geometryRevision=0,priming=null,warmed=false;
  const visibleFootprints=streamIndex.assets.filter(item=>!['surface','ground_flora'].includes(item.kind)||
   satelliteSite.footprintInCampus(...item.bounds));
  const proxies=attachStreamingLOD(lodData,visibleFootprints,world,satelliteSite,terrainY,libraryLighting.outlineMaterial);
  const missing=visibleFootprints.filter(item=>['building','surface'].includes(item.kind)&&!proxies.has(item.id));
  if(missing.length)throw Error('轮廓资源缺失 '+missing.map(item=>item.id).join(', '));
  streamer=createSceneStreamer({camera,world,items:visibleFootprints,proxies,scale,load:loadSceneItem,dispose:disposeSceneItem,
   moving:()=>keys.size>0||performance.now()-lastRapidTurn<170,onChange(state){
   if(state.revision!==geometryRevision){
    renderer.shadowMap.needsUpdate=true;
    waterRenderer.invalidate();
   }
   geometryRevision=state.revision;
   const ready=treesReady&&surfaceTexturesReady&&state.missingStructural.length===0&&state.nearbyMissing===0&&state.failures.length===0&&failures.length===0;
   if(ready&&!priming)priming=prewarmSurroundings().then(()=>{warmed=true;}).catch(error=>{
    failures.push(String(error));console.error(error);
   });
   window.campus.ready=ready&&warmed;
   $('status').textContent=state.failures.length?'部分分区细节读取失败':
    `高精度分区 ${state.loadedVisible} / ${state.wanted} · 已显示轮廓分区 ${state.visibleProxies}`+(warmed?'':' · 正在准备周边画面');
   $('error').textContent=state.failures.at(-1)||failures.at(-1)||'';
  }});
  sceneInitialized=true;
  showScene();
  streamer.start();
  addEventListener('pagehide',()=>streamer.stop());
  addEventListener('pageshow',event=>{if(event.persisted)streamer.start();});
  await loadTemplates();
  placeTrees();
  streamer.refresh();
 }
 $('detail').textContent=treeInstances.length.toLocaleString()+' 株树木与灌丛 · '+(manifest.ground_flora_source_units||0)+' 低植被单元（含 '+(manifest.ground_flora_low_shrub_patches||0)+' 矮灌丛） · '+(manifest.aquatic_instances||0)+' 片水生叶 / '+(manifest.aquatic_flowers||0)+' 株水生花 · '+(manifest.moss_ground_cover_source_groups||0)+' 苔藓源组地被 · '+manifest.assets.length+' 个场景资源 · 工程尺度 '+scale.toFixed(6)+' m/u（暂定）';
}
$('view').onchange=()=>{
 setView(views.find(v=>v.id===$('view').value));
 canvas.focus({preventScroll:true});
};
$('walk').onclick=()=>{
 if(!sceneInitialized)return;
 if(!walking)enterWalk();
 canvas.focus({preventScroll:true});
 try{canvas.requestPointerLock?.()?.catch(()=>updateWalkControls());}catch{updateWalkControls();}
};
$('orbit').onclick=()=>{
 enterOrbit();
 canvas.focus({preventScroll:true});
};
function applySkyBrightness(){
 const sky=skyPercent/100;
 const dusk=libraryLighting.state().dusk;
 scene.backgroundIntensity=(dusk?.78:.85)*sky;
 duskSky.setMode(dusk,sky);
 hemisphere.intensity=(dusk?.42:1.25)*(.60+.40*sky);
 $('sky-brightness').value=String(skyPercent);
 $('sky-value').value=skyPercent+'%';
}
$('sky-brightness').addEventListener('input',event=>{
 skyPercent=Number(event.currentTarget.value);
 try{localStorage.setItem('nkuR9SkyPercent',String(skyPercent));}catch{}
 applySkyBrightness();
});
applySkyBrightness();
function setDusk(enabled){
 cultureValley?.setDusk(enabled);
 libraryLighting.useDusk(enabled);
 applySkyBrightness();
 $('dusk').setAttribute('aria-pressed',String(enabled));
 $('light').disabled=enabled;
 $('light').textContent='诊断日光';
}
$('dusk').onclick=()=>setDusk(!libraryLighting.state().dusk);
$('light').onclick=()=>{const diagnostic=$('light').textContent==='诊断日光';$('light').textContent=diagnostic?'展示日光':'诊断日光';sun.intensity=diagnostic?2.4:3.;renderer.toneMappingExposure=diagnostic?1.05:1.12;};
$('source').onclick=()=>window.open('https://voxelnku.net/#jinnan:-836:0:-275:667:0:0:0:0:perspective','_blank','noopener,noreferrer');
$('sport').onclick=()=>{
 const view=views.find(view=>view.id==='R9_SCIENCE_SATELLITE');
 if(!view)return;
 setView(view);
 canvas.focus({preventScroll:true});
};
const libraryDoorLink=$('enter-library');
function nearbyLibraryDoor(){
 if(!sceneInitialized||!walking||!walkOnGround)return null;
 const x=camera.position.x/scale,z=camera.position.z/scale;
 if(Math.abs(x+84.5)>7.2||Math.abs((camera.position.y-EYE_HEIGHT)/scale-(2+5.1/scale))>.6)return null;
 if(z>=295.5+24.4/scale+.30&&z<=295.5+24.4/scale+4.6)return 'southDoor';
 if(z<=295.5-23.9/scale-.30&&z>=295.5-23.9/scale-4.6)return 'northDoor';
 return null;
}
addEventListener('keydown',e=>{
 if(e.code==='Escape'&&walking){enterOrbit();return;}
 if(!sceneInitialized)return;
 if(e.ctrlKey||e.metaKey||e.altKey||e.target.matches?.('select,input,textarea,[contenteditable]'))return;
 if(e.code==='KeyE'&&!e.repeat){
  const door=nearbyLibraryDoor();
  if(door){location.assign('./library/?view='+door);return;}
 }
 if(e.code==='Space'&&walking&&!e.target.matches?.('button')){
  e.preventDefault();
  if(!e.repeat&&walkOnGround)jumpRequested=true;
  return;
 }
 if(!walkKeys.has(e.code))return;
 e.preventDefault();
 keys.add(e.code);
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{keys.clear();dragLook=false;jumpRequested=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();});
document.addEventListener('pointerlockchange',()=>{
 const locked=document.pointerLockElement===canvas;
 if(walking&&hadPointerLock&&!locked)enterOrbit();
 hadPointerLock=locked;
 updateWalkControls();
});
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0)return;
 canvas.focus({preventScroll:true});
 if(walking&&document.pointerLockElement!==canvas)dragLook=true;
});
addEventListener('pointerup',()=>{dragLook=false;});
addEventListener('pointercancel',()=>{dragLook=false;});
addEventListener('mousemove',e=>{
 if(!walking||!(document.pointerLockElement===canvas||dragLook))return;
 yaw-=e.movementX*.002;
 pitch=Math.max(-1.35,Math.min(1.35,pitch-e.movementY*.002));
});
addEventListener('resize',()=>{
 camera.aspect=innerWidth/innerHeight;
 camera.updateProjectionMatrix();
 renderer.setSize(innerWidth,innerHeight);
 streamer?.refresh();
});
window.campus={ready:false,setView,enterWalk,moveWalk,groundY,walkGroundY:(x,z)=>groundY(x,z,(camera.position.y-EYE_HEIGHT+STEP_UP)/scale),terrainY,blocked,renderer,scene,camera,world,controls,scale:()=>scale,streamReport:()=>streamer?.report()??null,landscapeState:()=>landscape?.state(),axisPlantingState:()=>axisPlanting?.state(),flowerProfileState:()=>flowerProfiles?.state(),waterState:()=>({...waterRenderer?.state(),shore:waterfront?.state(),finish:waterfrontFinish?.state()}),navigationState:()=>({walking,grounded:walkOnGround,verticalSpeed:walkVerticalSpeed,wetMaskResolution:walkWater?.resolution}),satelliteState:()=>satelliteSite?.state(),cultureValleyState:()=>cultureValley?.state(),treeUpdateReport:()=>({...treeUpdates}),lightingState:()=>({...libraryLighting.state(),roadLights:roadLighting.state(),skyPercent,skyIntensity:scene.backgroundIntensity,nightSky:duskSky.state()}),
 report:()=>({version:'NKU-NONVOXEL-R9-DORMITORY-AND-NAVIGATION',surfacePbr:[...surfacePbr].map(([material,value])=>({material,source:value.record.id,tile_m:value.record.tile_m,normal_strength:value.record.normal_scale_initial_inferred,mesh_uses:value.uses,textures:value.textures.map(t=>({dimensions:[t.image?.width??0,t.image?.height??0],colorSpace:t.colorSpace,repeat:t.repeat.toArray()}))})),targetRenderFPS,walkSurfaceTriangles:walkSurfaceCount,ready:window.campus.ready,assets:[...loadedAssets],failures,trees:treeInstances.length,placedTreeInstances:treeSlots.size,nodes:world.children.filter(n=>!n.name.startsWith('VEG_')).map(n=>n.name),position:camera.position.toArray(),target:controls.target.toArray(),fov:camera.fov,cameraMatrix:camera.matrixWorld.toArray(),projectionMatrix:camera.projectionMatrix.toArray(),scale,rootMatrix:world.matrixWorld.toArray(),lighting:{sunIntensity:sun.intensity,hemisphereIntensity:hemisphere.intensity,environmentIntensity:scene.environmentIntensity,exposure:renderer.toneMappingExposure,shadows:renderer.shadowMap.enabled,shadowSize:2048,fog:false},draw:renderer.info.render,memory:renderer.info.memory,frames:frameSamples.slice(-15000),route:activeRoute?{id:activeRoute.id,index:activeRoute.index,distance:activeRoute.distance,blockedFrames:activeRoute.blockedFrames,elapsed:(performance.now()-activeRoute.started)/1000}:null}),
 setShadows:enabled=>{renderer.shadowMap.enabled=!!enabled;sun.castShadow=!!enabled;world.traverse(n=>{if(n.material)for(const m of (Array.isArray(n.material)?n.material:[n.material]))m.needsUpdate=true;});renderer.shadowMap.needsUpdate=true;},
 startRoute,stopRoute:()=>{activeRoute=null;},
 instanceNodes:()=>Object.fromEntries(treeSlots),
 sceneNodeNames:()=>{const names=[];world.traverse(n=>{if(n.name)names.push(n.name)});return names;},
 resetMetrics:()=>{frameSamples=[]},treeUpdate:()=>{updateTrees()},setWalkPose:(p,target)=>{camera.position.fromArray(p).multiplyScalar(scale);camera.lookAt(new THREE.Vector3().fromArray(target).multiplyScalar(scale));enterWalk();},
};
function animate(now){
 // Carry the deadline across refreshes so a 60/120/144 Hz panel does not
 // drop to half rate when a request arrives a fraction of a millisecond early.
 if(now+1.1<nextFrameAt){requestAnimationFrame(animate);return;}
 nextFrameAt=nextFrameAt===0||now-nextFrameAt>renderInterval?now+renderInterval:nextFrameAt+renderInterval;
 const elapsed=now-lastTime;const dt=Math.min(.10,elapsed/1000);lastTime=now;
 const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
 const right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
 if(activeRoute)stepRoute(Math.min(.05,dt));
 else if(walking)moveWalk(forward,right,dt);
 else{controls.update();moveOrbit(forward,right,dt);}
 const libraryDoor=nearbyLibraryDoor();
 if(libraryDoor)libraryDoorLink.href='./library/?view='+libraryDoor;
 libraryDoorLink.hidden=!libraryDoor;
 if(camera.quaternion.angleTo(previousFrameRotation)>.018)lastRapidTurn=now;
 previousFrameRotation.copy(camera.quaternion);
 minimap?.update(camera,scale,now);
 duskSky.update(now);
 if(!walking){
  const near=Math.max(.08,Math.min(34,camera.position.y*.018));
  if(Math.abs(near-camera.near)>Math.max(.02,camera.near*.16)){
   camera.near=near;camera.updateProjectionMatrix();
  }
 }
 libraryLighting.update(camera);
 if(satelliteSite)roadLighting.update(camera,scale,libraryLighting.state().dusk);
 if(sceneInitialized){
  landscape?.update(camera,scale,now);
  if(axisPlanting?.update(camera,now))renderer.shadowMap.needsUpdate=true;
 }
 if(heightData&&!dormPlantingTask&&camera.position.y<100*scale&&
    Math.hypot(camera.position.x+524.5*scale,camera.position.z+669.25*scale)<100*scale){
  dormPlantingTask=json('world/r9_dorm_planting.json').then(data=>{
   updateDormPlanting=attachDormPlanting(THREE,world,terrainY,data);
  }).catch(error=>{failures.push(String(error));console.error(error);});
 }
 if(updateDormPlanting?.(camera,scale))renderer.shadowMap.needsUpdate=true;
 if(now-lastTrees>230&&vegetationInitialized){updateTrees();lastTrees=now;}
 const cx=Math.round(camera.position.x/16)*16,cz=Math.round(camera.position.z/16)*16,newShadowCell=cx+'_'+cz;
 if(newShadowCell!==shadowCell){shadowCell=newShadowCell;sun.target.position.set(cx,0,cz);sun.position.copy(sun.target.position).add(new THREE.Vector3(-100,180,90));renderer.shadowMap.needsUpdate=true;}
 if(sceneInitialized){
  waterfront?.update(camera,now);
  if(renderer.shadowMap.needsUpdate)waterRenderer.invalidate();
  waterRenderer.update(now,libraryLighting.state().dusk,skyPercent/100,now-lastRapidTurn<170);
 }
 renderer.render(scene,camera);if(sceneInitialized){frameSamples.push(elapsed);if(frameSamples.length>16000)frameSamples.splice(0,1000);hudFrames.push(elapsed);if(hudFrames.length>90)hudFrames.shift();}
 if(now-lastHud>500){const average=hudFrames.length?hudFrames.reduce((a,b)=>a+b,0)/hudFrames.length:elapsed;$('hud').textContent=(1000/Math.max(average,1)).toFixed(0)+' FPS · '+renderer.info.render.triangles.toLocaleString()+' 三角形 · '+renderer.info.render.calls+' 绘制批次';lastHud=now;}
 requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
boot().catch(e=>{failures.push(String(e));$('error').textContent=String(e);$('status').textContent='工程资源读取失败';console.error(e)});
