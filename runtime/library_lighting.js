import * as THREE from 'three';

function twilightSky(){
 const width=256,height=128;
 const data=new Uint8Array(width*height*4);
 const horizon=[167,185,192], zenith=[58,94,131], below=[107,122,139];
 for(let y=0;y<height;y++){
  const elevation=y/(height-1)*2-1;
  const target=elevation>=0?zenith:below;
  const blend=Math.min(1,Math.abs(elevation)*1.9)**.67;
  const rgb=horizon.map((channel,index)=>Math.round(channel+(target[index]-channel)*blend));
  for(let x=0;x<width;x++)data.set([...rgb,255],(y*width+x)*4);
 }
 const texture=new THREE.DataTexture(data,width,height);
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.mapping=THREE.EquirectangularReflectionMapping;
 texture.minFilter=texture.magFilter=THREE.LinearFilter;
 texture.needsUpdate=true;
 return texture;
}

// Keep the warm reading band and light the physical wing glazing uniformly.
export function createLibraryLighting(scene, world, sun, hemisphere, renderer) {
 const dayBackground=scene.background;
 const duskBackground=twilightSky();
 const windowLight={value:0};
 const fixtures=new THREE.Group();
 const poles=new THREE.Group();
 poles.name='LIBRARY_PLAZA_MODELED_LAMPS';
 fixtures.name='LIBRARY_PLAZA_LIGHTS';
 fixtures.visible=false;
 poles.visible=false;
 world.add(fixtures,poles);
 let dusk=false;
 let scale=1;

 function addFixtures(metresPerUnit,groundY){
  scale=metresPerUnit;
  const lens=new THREE.MeshBasicMaterial({color:'#ffd59a'});
  const bulb=new THREE.SphereGeometry(.20,8,5);
  for(const x of [-151.5,-124.5,-97.5,-70.5,-43.5,-16.5]){
   const light=new THREE.PointLight('#ffbc70',160,43,2);
   light.position.set(x,17.19,527.24);
   const cover=new THREE.Mesh(bulb,lens);
   cover.position.copy(light.position);
   fixtures.add(light,cover);
  }
  const shaft=new THREE.CylinderGeometry(.12,.18,11.8,10);
  const cap=new THREE.BoxGeometry(1.15,.18,.44);
  const shaftMaterial=new THREE.MeshStandardMaterial({color:'#bbb9ac',roughness:.64});
  for(const [x,z] of [[-145,404],[-24,404],[-148,447],[-21,447]]){
   const base=groundY(x,z);
   const pole=new THREE.Mesh(shaft,shaftMaterial);
   pole.position.set(x,base+5.9,z);
   const arm=new THREE.Mesh(cap,shaftMaterial);
   arm.position.set(x,base+11.8,z);
   pole.castShadow=arm.castShadow=true;
   poles.add(pole,arm);
   const light=new THREE.PointLight('#ffb56a',115,33,2);
   light.position.set(x,base+11.63,z);
   const cover=new THREE.Mesh(bulb,lens);
   cover.position.copy(light.position);
   fixtures.add(light,cover);
  }
 }

 function refreshGlare(material){
  const {libraryDayColor,libraryDuskColor,libraryGrayBlue,libraryConnectGlazing}=material.userData;
  material.envMapIntensity=dusk?(libraryConnectGlazing?.06:.009):(libraryGrayBlue?.065:.13);
  material.color.copy(dusk?libraryDuskColor:libraryDayColor).multiplyScalar(dusk&&!libraryConnectGlazing?.41:1);
 }

 function bindWindow(mesh){
  const kind={Library_Wing_Glass:0,Library_Reading_Glass:1,Library_Entry_Glass:2,Muzhai_Entry_Glass:3,Library_Shelter_Fixture:4}[mesh.material.name];
  const upperConnect=mesh.material.name==='Recessed_Blue_Glass'&&mesh.name.startsWith('buildings_s_-1_2_');
  if(kind===undefined&&!upperConnect)return;
  const material=mesh.material;
  if(material.userData.libraryDayColor)return;
  const daylight=['#747b80','#81868b','#727c83'][kind]||(upperConnect?'#6d747a':null);
  material.userData.libraryGrayBlue=Boolean(daylight);
  material.userData.libraryConnectGlazing=upperConnect;
  material.userData.libraryDuskColor=material.color.clone();
  material.userData.libraryDayColor=daylight?new THREE.Color(daylight):material.color.clone();
  refreshGlare(material);
  mesh.castShadow=false;
  material.onBeforeCompile=shader=>{
   shader.uniforms.nkuWindowLight=windowLight;
   shader.vertexShader=shader.vertexShader
    .replace('#include <common>','#include <common>\nvarying vec3 nkuLibraryPosition;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nnkuLibraryPosition=position;');
   shader.fragmentShader=shader.fragmentShader
    .replace('#include <common>','#include <common>\nuniform float nkuWindowLight;\nvarying vec3 nkuLibraryPosition;')
    .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      vec2 meters=(nkuLibraryPosition.xy+vec2(84.5,-2.0))*${scale.toFixed(8)};
      float glow;
      ${kind===1?'glow=.86;':kind===0?'glow=.39;':kind===2?'glow=mix(.34,.52,1.0-smoothstep(10.0,20.0,abs(meters.x)));':kind===4?'glow=1.10;':upperConnect?'glow=0.;':'glow=.22;'}
      totalEmissiveRadiance+=vec3(1.0,.56,.18)*glow*nkuWindowLight;
    `);
  };
  material.customProgramCacheKey=()=>`nku-library-window-${kind}`;
  material.needsUpdate=true;
 }

 function useDusk(enabled){
  dusk=!!enabled;
  scene.background=dusk?duskBackground:dayBackground;
  hemisphere.color.set(dusk?'#c1dcf8':'#e5f2ff');
  hemisphere.groundColor.set(dusk?'#797f90':'#a2a591');
  hemisphere.intensity=dusk?.55:1.25;
  sun.color.set(dusk?'#ffc99a':'#fff4de');
  sun.intensity=dusk?.28:2.5;
  renderer.toneMappingExposure=dusk?1.06:1;
  windowLight.value=dusk?1:0;
  world.traverse(node=>{if(node.material?.userData?.libraryDayColor)refreshGlare(node.material);});
  if(!dusk)fixtures.visible=false;
  renderer.shadowMap.needsUpdate=true;
 }

 function update(camera){
  const nearby=Math.hypot(camera.position.x/scale+84,camera.position.z/scale-423)<250;
  if(poles.visible!==nearby){
   poles.visible=nearby;
   renderer.shadowMap.needsUpdate=true;
  }
  fixtures.visible=dusk&&nearby;
 }

 return {addFixtures,bindWindow,useDusk,update,state:()=>({dusk,plazaLights:fixtures.visible?fixtures.children.length/2:0})};
}

