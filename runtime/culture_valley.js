import * as THREE from 'three';
import {seededRandom} from './plant_geometry.js';

const FLOOR_MATERIALS = new Set(['paving','stone_paving','brick_paving','timber_deck']);
const CAMPUS_UNIT_BOX = new THREE.BoxGeometry(1,1,1);
const Y_AXIS = new THREE.Vector3(0,1,0);
const tint = value => new THREE.Color(value).toArray().map(n=>n.toFixed(5)).join(',');

function readSourcePosition(shader,scale){
 shader.vertexShader=shader.vertexShader.replace('#include <common>',
  '#include <common>\nvarying vec3 nkuValleyPoint;\nvarying vec3 nkuValleyNormal;')
  .replace('#include <project_vertex>',`#include <project_vertex>
  nkuValleyPoint=(modelMatrix*vec4(transformed,1.0)).xyz/${scale.toFixed(8)};
  nkuValleyNormal=normalize(mat3(modelMatrix)*objectNormal);`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
  varying vec3 nkuValleyPoint;
  varying vec3 nkuValleyNormal;
  float valleyVariation(vec2 id){return fract(sin(dot(id,vec2(127.1,311.7)))*43758.5453);}
  float valleyTone(vec2 p){
   vec2 id=floor(p),f=smoothstep(vec2(0.0),vec2(1.0),fract(p));
   return mix(mix(valleyVariation(id),valleyVariation(id+vec2(1,0)),f.x),
              mix(valleyVariation(id+vec2(0,1)),valleyVariation(id+vec2(1)),f.x),f.y);
  }
  float valleyJoint(vec2 uv, float edge){
   vec2 d=min(fract(uv),1.0-fract(uv));
   vec2 w=clamp(fwidth(uv),vec2(0.002),vec2(0.35));
   vec2 line=1.0-smoothstep(vec2(edge)-w,vec2(edge)+w,d);
   return max(line.x,line.y)*(1.0-smoothstep(.12,.37,max(w.x,w.y)));
  }
 `);
}

function finishFragment(kind,scale,data){
 const [minX,minZ,maxX,maxZ]=data.bounds;
 const inCourt=`p.x>${minX}.0&&p.x<${maxX}.0&&p.z>${minZ}.0&&p.z<${maxZ}.0`;
 if(kind==='lawn'){
  const lawns=data.mown_lawns.map(([x0,z0,x1,z1])=>
   `(p.x>${x0.toFixed(2)}&&p.x<${x1.toFixed(2)}&&p.z>${z0.toFixed(2)}&&p.z<${z1.toFixed(2)})`).join('||');
  return `
   if(p.y<1.72&&p.x>-107.&&p.x<-62.&&p.z>-47.&&p.z<87.){
    vec2 meters=p.xz*${scale};
    float broad=valleyTone(meters*.26);
    float moss=valleyTone(meters*2.7);
    float cut=sin(meters.y*3.24+valleyTone(meters*.13)*.56);
    vec3 field=vec3(${tint('#566e32')})*(.82+broad*.29+moss*.14+cut*.022);
    float edge=smoothstep(0.0,2.3,min(min(p.x+107.,-62.-p.x),min(p.z+47.,87.-p.z)));
    float strength=(${lawns})?.59:.43;
    diffuseColor.rgb=mix(diffuseColor.rgb,field,strength*edge);
   }`;
 }
 if(kind==='rail')return `
  if(p.x>-110.10&&p.x<-58.9&&p.y>4.96&&p.y<6.1){
   float mid=9.5-(p.x+110.0)*23.0/51.0;
   float width=mix(2.5,3.0,smoothstep(0.,4.,min(p.x+110.0,-59.0-p.x)));
   bool onSkew=abs(abs(p.z-mid)-width)<.33;
   bool onStraight=(abs(p.z-40.5)<.33||abs(p.z-44.5)<.33||abs(p.z+48.5)<.33||abs(p.z+44.5)<.33);
   if(onSkew||onStraight)diffuseColor.rgb=mix(diffuseColor.rgb,vec3(${tint('#a6aaa8')}),0.83);
  }
 `;
 if(kind==='wall')return `
  if(${inCourt}&&p.y>0.55&&p.y<6.02&&abs(nkuValleyNormal.y)<.19){
   vec2 b=vec2(abs(nkuValleyNormal.x)>.5?p.z:p.x,p.y)*${scale};
   vec2 tile=b/vec2(.273,.078);
   tile.x+=.5*mod(floor(tile.y),2.);
   float f=valleyVariation(floor(tile));
   vec3 brick=vec3(${tint('#824735')})*(.78+f*.39);
   vec3 mortar=vec3(${tint('#a77a63')});
   diffuseColor.rgb=mix(diffuseColor.rgb,mix(brick,mortar,valleyJoint(tile,.022)*.61),.89);
  }
 `;
 return `
  if(${inCourt}&&p.y>.72&&p.y<2.2&&nkuValleyNormal.y>.52){
   vec2 metric=p.xz*${scale};
   vec2 tile=(metric+vec2(50.0,9.0))/vec2(.61,.46);
   float batch=valleyVariation(floor(tile));
   float aggregate=valleyTone(metric*17.0);
   float weather=valleyTone(metric*.64);
   vec3 warmStone=vec3(${tint('#c8beab')})*(.82+batch*.12+aggregate*.14+weather*.12);
   vec3 charcoal=vec3(${tint('#7c7770')});
   vec3 finish=mix(warmStone,charcoal,valleyJoint(tile,.011)*.58);
   float darkBorder=min(abs(p.x+106.0),abs(p.x+62.25));
   finish=mix(finish,charcoal,(1.-smoothstep(.08,.17,darkBorder))*.84);
   float offset=p.z+6.20+.42*(p.x+84.5);
   float width=1.-smoothstep(2.05,2.16,abs(offset));
   float along=dot(metric,normalize(vec2(1.,-.42)));
   float across=dot(metric,normalize(vec2(.42,1.)));
   vec2 plank=vec2(along/2.1,across/.145);
   plank.x+=fract(floor(plank.y)*.618);
   float strip=valleyVariation(floor(plank));
   float grain=valleyTone(vec2(along*4.2,across*140.))-.5;
   float footfall=valleyTone(vec2(along*.6,across*1.5))-.5;
   vec3 brown=vec3(${tint('#746458')})*(.84+strip*.23+grain*.145+footfall*.12);
   float ends=valleyJoint(plank,.022)*.41;
   float edgeBoard=1.0-smoothstep(.06,.16,abs(abs(offset)-1.94));
   finish=mix(finish,brown*(1.-ends-edgeBoard*.09),width);
   diffuseColor.rgb=mix(diffuseColor.rgb,finish,.84);
  }
 `;
}

function installFinish(material,kind,scale,data,duskUniform){
 if(material.userData.nkuValleyFinish)return;
 material.userData.nkuValleyFinish=kind;
 const prior=material.onBeforeCompile,cache=material.customProgramCacheKey();
 material.onBeforeCompile=function(shader,...args){
  prior.call(this,shader,...args);
  readSourcePosition(shader,scale);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   {vec3 p=nkuValleyPoint;${finishFragment(kind,scale,data)}}`);
  if(kind==='paving'){
   shader.uniforms.nkuValleyDusk=duskUniform;
   const pools=data.bollards.map(([x,z])=>`
    max(1.0-length(p-vec2(${x.toFixed(2)},${z.toFixed(2)}))/2.8,0.0)`).join('+');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
    '#include <common>\nuniform float nkuValleyDusk;')
    .replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
     if(nkuValleyDusk>.0&&nkuValleyNormal.y>.5&&nkuValleyPoint.y<1.85){
      vec2 p=nkuValleyPoint.xz;
      float pool=${pools};
      reflectedLight.indirectDiffuse+=diffuseColor.rgb*vec3(1.0,.69,.38)*pow(pool,2.)*nkuValleyDusk*.32;
     }
    `);
  }
 };
 material.customProgramCacheKey=()=>cache+'/nku-valley/'+kind;
 material.needsUpdate=true;
}

function walnutGrain(){
 const width=256,height=64,rgba=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const streak=Math.sin(y*.44+Math.sin(x*.10)*.36)*4+Math.cos(y*1.95+x*.008)*3;
  const speck=((x*53+y*47)%13)/13*6;
  const k=(y*width+x)*4;
  rgba.set([155+streak+speck,135+streak+speck,118+streak+speck,255],k);
 }
 const map=new THREE.DataTexture(rgba,width,height);
 map.colorSpace=THREE.SRGBColorSpace;
 map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;
 map.needsUpdate=true;
 return map;
}

function treeBedMulch(){
 const canvas=document.createElement('canvas');
 canvas.width=256;canvas.height=256;
 const ctx=canvas.getContext('2d'),rng=seededRandom(87253);
 ctx.fillStyle='#493b2b';ctx.fillRect(0,0,256,256);
 for(let i=0;i<1460;i++){
  const x=rng()*256,y=rng()*256,length=2+rng()*9,width=.7+rng()*length*.30;
  const tone=49+Math.floor(rng()*55);
  ctx.save();ctx.translate(x,y);ctx.rotate(rng()*Math.PI*2);
  ctx.fillStyle='rgb('+tone+','+Math.floor(tone*.79)+','+Math.floor(tone*.54)+')';
  ctx.beginPath();ctx.moveTo(-length*.45,-width*.38);ctx.lineTo(length*.39,-width*.5);
  ctx.lineTo(length*.5,width*.16);ctx.lineTo(-length*.33,width*.54);ctx.closePath();ctx.fill();
  ctx.restore();
 }
 const map=new THREE.CanvasTexture(canvas);
 map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
 return map;
}

export function attachCultureValley(world,data,scale,groundAt){
 const group=new THREE.Group();
 group.name='R9_CULTURE_VALLEY';
 world.add(group);
 const duskUniform={value:0};
 const stats={replacedColumnTriangles:0,groomedFloraVertices:0,pillars:data.pillars.length,seats:data.seats.length,
  planters:data.planters.length,bollards:data.bollards.length};
 const occupancies=[],treeHeights=new Map(),batches=new Map();
 const timber=new THREE.MeshStandardMaterial({color:'#89735c',map:walnutGrain(),roughness:.79});
 const paintedSteel=new THREE.MeshStandardMaterial({color:'#393531',roughness:.57,metalness:.22});
 const white=new THREE.MeshStandardMaterial({color:'#d4d0bf',roughness:.75});
 const granite=new THREE.MeshStandardMaterial({color:'#5d5a54',roughness:.85});
 const soil=new THREE.MeshStandardMaterial({map:treeBedMulch(),roughness:.98});
 const glass=new THREE.MeshStandardMaterial({color:'#e6ddbf',emissive:'#ffcb80',emissiveIntensity:0,roughness:.38});
 const cylinder=new THREE.CylinderGeometry(1,1,1,24);
 const angledLeg=new THREE.Shape();
 angledLeg.moveTo(-.5,-.5);angledLeg.lineTo(.5,-.5);angledLeg.lineTo(.24,.5);
 angledLeg.lineTo(-.19,.5);angledLeg.closePath();
 const legGeometry=new THREE.ExtrudeGeometry(angledLeg,{depth:1,bevelEnabled:false}).translate(0,0,-.5);
 const dummy=new THREE.Object3D();

 function enqueue(material,geo,x,y,z,sx,sy,sz,angle=0){
  if(!batches.has(material))batches.set(material,new Map());
  const bucket=batches.get(material);
  const items=bucket.get(geo)||[];
  dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);
  dummy.quaternion.setFromAxisAngle(Y_AXIS,angle);
  dummy.updateMatrix();
  items.push(dummy.matrix.clone());
  bucket.set(geo,items);
 }

 function placeFrame(center,angle){
  const [x,z]=center, c=Math.cos(angle), s=Math.sin(angle);
  const base=groundAt(x,z,2.9)+.013;
  const transform=(a,b)=>[x+a*c+b*s,z-a*s+b*c];
  function box(material,a,h,b,w,t,d,shape=CAMPUS_UNIT_BOX){
   const [px,pz]=transform(a,b);
   enqueue(material,shape,px,base+h,pz,w,t,d,angle);
  }
  function occupancy(width,depth,height){
   const polygon=[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]]
    .map(([a,b])=>transform(a,b));
   const xx=polygon.map(x=>x[0]),zz=polygon.map(x=>x[1]);
   occupancies.push({id:'R9_CULTURE_VALLEY_FURNITURE',outer:polygon,holes:[],
    bounds:[Math.min(...xx),Math.min(...zz),Math.max(...xx),Math.max(...zz)],base,roof:base+height});
  }
  return {base,box,occupancy};
 }

 for(const [x,z] of data.pillars){
  enqueue(white,cylinder,x,2.46,z,.455,3.08,.455);
  enqueue(granite,cylinder,x,1.06,z,.52,.176,.52);
  enqueue(white,cylinder,x,3.96,z,.47,.13,.47);
 }
 for(const {center,angle,length_m} of data.seats){
  const {box,occupancy}=placeFrame(center,angle);
  const w=length_m/scale,depth=.55/scale,h=.45/scale;
  box(paintedSteel,0,h-.075,0,w*.91,.092,depth*.77);
  for(const x of [-w*.33,w*.33]){
   box(paintedSteel,x,h*.27,0,.41,h*.55,depth*.76,legGeometry);
   box(timber,x,h*.43,0,.45,h*.84,depth*.86,legGeometry);
   box(paintedSteel,x,.029,0,.46,.065,depth*.90);
  }
  for(let i=0;i<5;i++)box(timber,0,h-.05,depth*((i+.5)/5-.5),w,.104,depth/5-.018);
  occupancy(w,depth,h);
 }
 for(const {tree,center,angle,width_m,depth_m} of data.planters){
  const {base,box,occupancy}=placeFrame(center,angle);
  const w=width_m/scale, depth=depth_m/scale, h=.31/scale;
  box(paintedSteel,0,.095,0,w-.03,.20,depth-.03);
  box(soil,0,h-.055,0,w-.30,.083,depth-.30);
  const panel=.16;
  for(const side of [-1,1]){
   for(let i=0;i<Math.ceil(w/panel);i++){
    const u=(i+.5)/Math.ceil(w/panel);
    box(timber,w*(u-.5),h/2,side*(depth/2-.064),w/Math.ceil(w/panel)-.012,h,.128);
   }
   for(let i=0;i<Math.ceil(depth/panel);i++){
    const u=(i+.5)/Math.ceil(depth/panel);
    box(timber,side*(w/2-.066),h/2,depth*(u-.5),.13,h,depth/Math.ceil(depth/panel)-.012);
   }
   box(timber,0,h,side*(depth/2-.079),w,.068,.19);
   box(timber,side*(w/2-.079),h,0,.19,.068,depth-.34);
  }
  occupancy(w,depth,h+.035);
  treeHeights.set(tree,base+h-.019);
 }
 for(const center of data.bollards){
  const {box,occupancy}=placeFrame(center,0);
  const h=1.47/scale;
  box(paintedSteel,0,h/2,0,.142,h,.135);
  box(paintedSteel,0,.05,0,.23,.10,.219);
  for(const sign of [-1,1])box(glass,0,h*.72,sign*.068,.059,h*.43,.009);
  occupancy(.142,.135,h);
 }
 for(const [material,shapes] of batches){
  for(const [shape,matrices] of shapes){
   const mesh=new THREE.InstancedMesh(shape,material,matrices.length);
   mesh.name='R9_CULTURE_VALLEY_FIXTURES';
   matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
   mesh.computeBoundingSphere();
   mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
 }

 function removeSquarePiers(mesh){
  const pos=mesh.geometry.attributes.position, index=mesh.geometry.index;
  if(!index)return;
  const remaining=[];
  let removed=0;
  for(let k=0;k<index.count;k+=3){
   const a=index.getX(k),b=index.getX(k+1),c=index.getX(k+2), ids=[a,b,c];
   const ys=ids.map(i=>pos.getY(i));
   const limits=Math.min(...ys)>=.999&&Math.max(...ys)<=4.001&&Math.max(...ys)-Math.min(...ys)>2.9;
   const old=limits&&data.pillars.some(([x,z])=>ids.every(i=>
    Math.abs(pos.getX(i)-x)<.502&&Math.abs(pos.getZ(i)-z)<.502));
   if(old)removed++;else remaining.push(a,b,c);
  }
  if(removed!==data.pillars.length*8)throw Error('Culture valley support geometry changed. Found '+removed+' legacy side triangles.');
  mesh.geometry.setIndex(remaining);
  stats.replacedColumnTriangles=removed;
 }

 function groomLawn(mesh){
  const sector=mesh.name.slice('GROUND_FLORA_'.length);
  const roots=data.lawn_flowers?.[sector]?.roots;
  if(!roots?.length)return;
  const pos=mesh.geometry.attributes.position;
  for(const {id,vertex_range:[first,end],root:[x,y,z],factor} of roots){
   if(first<0||end>pos.count||first>=end)throw Error('Culture valley flower range changed: '+id);
   for(let i=first;i<end;i++){
    pos.setXYZ(i,x+(pos.getX(i)-x)*factor,y+(pos.getY(i)-y)*factor,z+(pos.getZ(i)-z)*factor);
   }
   stats.groomedFloraVertices+=end-first;
  }
  pos.needsUpdate=true;
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
 }
  function finish(mesh,kind){
  const name=mesh.material.name;
  if(kind==='ground_flora'&&/^GROUND_FLORA_s_-1_(?:-1|0)/.test(mesh.name))groomLawn(mesh);
  if(kind==='surface'&&(FLOOR_MATERIALS.has(name)||name==='grass')){
   mesh.geometry.computeBoundingBox();
   const {min,max}=mesh.geometry.boundingBox,[x0,z0,x1,z1]=data.bounds;
   if(min.x<x1&&max.x>x0&&min.z<z1&&max.z>z0)
    installFinish(mesh.material,name==='grass'?'lawn':'paving',scale,data,duskUniform);
  }
  if(kind!=='building'||!mesh.name.startsWith('buildings_s_-1_-1_'))return;
  if(mesh.name===data.replacement_node)removeSquarePiers(mesh);
  if(name==='Dark_Metal')installFinish(mesh.material,'rail',scale,data,duskUniform);
  if(name==='Courtyard_Source_Muted_Pink_Stone')installFinish(mesh.material,'wall',scale,data,duskUniform);
 }
 return {finish,occupancies,treeHeights,setDusk:enabled=>{duskUniform.value=enabled?1:0;glass.emissiveIntensity=enabled?.85:0;},
  state:()=>({...stats,draws:group.children.length})};
}

