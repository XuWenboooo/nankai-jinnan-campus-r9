import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';

const WATER_LAYER=1;
const PASS_INTERVAL=128;
const reflectedHeightTolerance=.20;
const profileFor=(name)=>name.includes('CANAL')||name.includes('edge_water')?'channel':
 name.includes('pond')?'pond':name.includes('DATONG')?'open':'lake';

export function createWaterRenderer(renderer,scene,camera,assets,atlas,scale){
 const {wave,depth}=assets;
 camera.layers.enable(WATER_LAYER);
 const dims=()=>[Math.min(896,Math.max(384,Math.round(renderer.domElement.width*.54))),
  Math.min(540,Math.max(230,Math.round(renderer.domElement.height*.54)))];
 const [width,height]=dims();
 const probe=new Reflector(new THREE.PlaneGeometry(1,1),{textureWidth:width,textureHeight:height,multisample:0,clipBias:.0007});
 probe.rotation.x=-Math.PI*.5;
 const mirror=probe.getRenderTarget();
 const viewProject=new THREE.Matrix4(),probeFrustum=new THREE.Frustum();
 const edgeBounds=new THREE.Box3();
 const input={
  campusWave:{value:wave},campusDepthMap:{value:depth},campusTime:{value:0},
  campusMirror:{value:mirror.texture},campusMirrorMatrix:{value:probe.material.uniforms.textureMatrix.value},
  campusMirrorHeight:{value:0},campusReflect:{value:0},campusDusk:{value:0},campusSkyLight:{value:1},
 };
 const origin=atlas.origin_xz.map(v=>v*scale);
 const extent=atlas.size.map(v=>v*atlas.step*scale);
 const entries=new Map();
 const counters={reflections:0,retainedFrames:0,passDraws:0,active:null,surfaceMeshes:0,height:null,resolution:[width,height],maxRate:1000/PASS_INTERVAL};
 const previousPosition=new THREE.Vector3(),previousRotation=new THREE.Quaternion(),previousProjection=new THREE.Matrix4();
 let evaluated=false,dirty=true,previousSky,previousDusk;
 let last=-Infinity,active=null;
 const positions=new THREE.Vector3(),vertex=new THREE.Vector3(),meshBounds=new THREE.Box3();
 const previousViewport=[0,0];
 function bind(mesh){
  if(entries.has(mesh)||mesh.geometry.drawRange.count===0||!mesh.geometry.getAttribute('position')?.count)return;
  const material=mesh.material;
  const profile=profileFor(mesh.name);
  const edgeTriangles=[];
  if(mesh.name==='R9_site_edge_water'){
   const p=mesh.geometry.getAttribute('position');
   for(let i=0;i<p.count;i+=3){
    const box=new THREE.Box3();
    for(let c=0;c<3;c++)box.expandByPoint(vertex.fromBufferAttribute(p,i+c));
    edgeTriangles.push(box);
   }
  }
  entries.set(mesh,{profile,edgeTriangles});
  counters.surfaceMeshes=entries.size;
  dirty=true;
  mesh.layers.set(WATER_LAYER);
  mesh.castShadow=false;mesh.receiveShadow=false;
  if(material.userData.campusWater)return;
  material.userData.campusWater=profile;
  const prior=material.onBeforeCompile;
  const cacheKey=material.customProgramCacheKey();
  material.metalness=0;
  material.roughness=.35;
  material.onBeforeCompile=function(shader,...args){
   prior.call(this,shader,...args);
   Object.assign(shader.uniforms,input);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 campusWaterPoint;')
    .replace('#include <project_vertex>','#include <project_vertex>\ncampusWaterPoint=(modelMatrix*vec4(transformed,1.)).xyz;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 campusWaterPoint;
    uniform sampler2D campusWave;
    uniform sampler2D campusDepthMap;
    uniform sampler2D campusMirror;
    uniform mat4 campusMirrorMatrix;
    uniform float campusTime,campusMirrorHeight,campusReflect,campusDusk,campusSkyLight;
   `).replace('#include <opaque_fragment>', `
    vec3 wp=campusWaterPoint;
    vec2 p=wp.xz;
    float time=campusTime;
    vec2 grad=max(abs(dFdx(p)),abs(dFdy(p)));
    float waveAA=1.-smoothstep(.16,.88,max(grad.x,grad.y));
    vec2 curl=texture2D(campusWave,vec2(p.x*.11-p.y*.18,p.y*.13+p.x*.08)+vec2(time*.007,-time*.013)).xy*2.-1.;
    vec2 cap=texture2D(campusWave,vec2(p.x*.43+p.y*.23,p.y*.66-p.x*.27)+vec2(-time*.039,time*.030)).xy*2.-1.;
    vec2 broad=vec2(sin(dot(p,vec2(.81,1.22))+time*1.18),sin(dot(p,vec2(-1.36,1.01))-time*.91));
    vec2 ripples=(curl*.175+cap*.107*waveAA+broad*.013)*${profile==='channel'?'1.02':'1.0'};
    vec3 waterNormal=normalize(vec3(ripples.x,1.,ripples.y));
    vec3 eye=normalize(cameraPosition-wp);
    float elevation=max(0.,dot(eye,waterNormal));
    float fresnel=.13+.48*pow(1.-elevation,4.);
    vec2 shoreUV=(p-vec2(${origin.map(v=>v.toFixed(4)).join(',')}))/vec2(${extent.map(v=>v.toFixed(4)).join(',')});
    float deep=smoothstep(.03,.68,texture2D(campusDepthMap,shoreUV).r);
    vec3 shallow=vec3(.124,.149,.087);
    vec3 basin=vec3(${profile==='channel'?'.037,.073,.054':profile==='pond'?'.044,.079,.067':'.032,.073,.070'});
    vec3 body=mix(shallow,basin,deep)*(1.+curl.x*.075+cap.y*.038*waveAA);
    vec3 reflectedRay=reflect(-eye,waterNormal);
    vec3 sky=mix(vec3(.43,.56,.60),vec3(.15,.34,.50),smoothstep(.0,.81,max(0.,reflectedRay.y)));
    sky=mix(sky,sky*.25+vec3(.018,.018,.016),campusDusk)*campusSkyLight;
    vec4 r=campusMirrorMatrix*vec4(p.x,-p.y,wp.y-campusMirrorHeight,1.);
    vec2 offset=r.xy/max(r.w,.0001);
    offset+=ripples*vec2(.061,.088)*mix(.38,1.,1.-smoothstep(28.,137.,distance(cameraPosition,wp)));
    float safeUV=smoothstep(.0,.024,min(min(offset.x,1.-offset.x),min(offset.y,1.-offset.y)));
    float samePlane=1.-smoothstep(.06,${reflectedHeightTolerance.toFixed(2)},abs(wp.y-campusMirrorHeight));
    vec2 spread=vec2(.0022,.0012)*(1.+2.8*elevation);
    vec3 reflection=texture2D(campusMirror,offset).rgb*.48;
    reflection+=(texture2D(campusMirror,offset+spread).rgb+texture2D(campusMirror,offset-spread).rgb)*.26;
    reflection*=vec3(.69,.79,.78);
    reflection=mix(sky,reflection,safeUV*samePlane*campusReflect*.92*step(.01,r.w));
    vec3 sunDirection=normalize(vec3(-100.,180.,90.));
    float flash=pow(max(0.,dot(reflectedRay,sunDirection)),80.)*(.19+.12*waveAA)*(1.-campusDusk*.88);
    float light=campusSkyLight*(1.-campusDusk*.62);
    float mirrorAmount=min(.74,fresnel+.09*deep)*mix(.56,1.0,deep);
    outgoingLight=mix(body*light,reflection,mirrorAmount)+
                   vec3(.86,.76,.58)*flash*campusSkyLight+
                   (curl.y*.012+cap.x*.017*waveAA)*vec3(.65,.87,.90)*light;
    #include <opaque_fragment>
   `);
  };
  material.customProgramCacheKey=()=>cacheKey+'/r9-campus-water/'+profile;
  material.needsUpdate=true;
 }
 function invalidate(){dirty=true;}
 function unregister(mesh){if(entries.delete(mesh)){counters.surfaceMeshes=entries.size;invalidate();}}
 function update(now,dusk,skyLight=1,rapidTurn=false){
  input.campusTime.value=now*.001;
  input.campusDusk.value=dusk?1:0;
  input.campusSkyLight.value=skyLight;
  // The already-rendered mirror is sampled in world coordinates. Reuse it
  // during a fast turn while the water normals continue moving.
  if(rapidTurn)return;
  const changed=!evaluated||dirty||previousSky!==skyLight||previousDusk!==dusk||
   camera.position.distanceToSquared(previousPosition)>.0025||
   camera.quaternion.angleTo(previousRotation)>.005||
   !camera.projectionMatrix.equals(previousProjection)||
   renderer.domElement.width!==previousViewport[0]||renderer.domElement.height!==previousViewport[1];
  if(!changed){if(active)counters.retainedFrames++;return;}
  if(now-last<PASS_INTERVAL)return;
  last=now;
  evaluated=true;
  dirty=false;
  previousSky=skyLight;previousDusk=dusk;
  previousPosition.copy(camera.position);previousRotation.copy(camera.quaternion);previousProjection.copy(camera.projectionMatrix);
  previousViewport[0]=renderer.domElement.width;previousViewport[1]=renderer.domElement.height;
  camera.updateMatrixWorld();
  const y=camera.position.y;
  if(y>55){active=null;input.campusReflect.value=0;counters.active=null;return;}
  viewProject.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  probeFrustum.setFromProjectionMatrix(viewProject);
  let best=null,score=Infinity;
  for(const [mesh,{profile,edgeTriangles}] of entries){
   if(!mesh.visible||!mesh.parent?.visible)continue;
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
   mesh.updateWorldMatrix(true,false);
   const bounds=meshBounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
   if(!probeFrustum.intersectsBox(bounds))continue;
   if(edgeTriangles.length){
    let nearest=null,bestDistance=110;
    for(const edge of edgeTriangles){
     const test=edgeBounds.copy(edge).applyMatrix4(mesh.matrixWorld);
     if(!probeFrustum.intersectsBox(test))continue;
     const distance=test.distanceToPoint(camera.position);
     if(distance<bestDistance){nearest=edge;bestDistance=distance;}
    }
    if(!nearest)continue;
    bounds.copy(nearest).applyMatrix4(mesh.matrixWorld);
   }
   const distance=bounds.distanceToPoint(camera.position);
   if(distance>110||bounds.min.y>y-.35)continue;
   // A shared plane serves adjoining tiles. Vast perimeter batches get a
   // lower priority unless they really are the nearest visible water.
   const location=bounds.getCenter(positions);
   const centerBias=Math.min(80,Math.hypot(location.x-camera.position.x,location.z-camera.position.z)*.13);
   const candidate=distance+centerBias;
   if(candidate<score){
    best={name:mesh.name,height:bounds.max.y-bounds.min.y<.30?(bounds.min.y+bounds.max.y)*.5:bounds.min.y,profile};
    score=candidate;
   }
  }
  if(!best){active=null;input.campusReflect.value=0;counters.active=null;return;}
  const [rw,rh]=dims();
  if(rw!==mirror.width||rh!==mirror.height){mirror.setSize(rw,rh);counters.resolution=[rw,rh];}
  probe.position.y=best.height;
  probe.updateMatrixWorld(true);
  probe.getReflectionCamera(camera).layers.set(0);
  probe.onBeforeRender(renderer,scene,camera);
  input.campusMirrorHeight.value=best.height;
  input.campusReflect.value=1.;
  active=best;
  counters.active=active.name;counters.height=active.height;
  counters.reflections++;
  counters.passDraws=renderer.info.render.calls;
 }
 return {bind,unregister,invalidate,update,state:()=>({...counters,clock:input.campusTime.value})};
}

