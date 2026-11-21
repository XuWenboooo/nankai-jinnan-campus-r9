import * as THREE from 'three';

const NATURAL_TURF=new Set(['grove','old_frame_turf','outer_infill','bank_foundation','turf']);
const FINISH={
 edge_water:0x42757a,pond:0x314f59,east_path:0x85877c,grove:0x718345,old_frame_turf:0x73814e,outer_infill:0x728051,
 bank_foundation:0x687a46,
 marking:0xe1ded0,track:0xa65e4d,football_light:0x627e45,football_dark:0x536e3e,
 tennis:0x4f6d72,basketball:0x986a56,volleyball:0x859578,sport_apron:0x848376,
 paving:0x9e9a8d,turf:0x79894b,
};
const inRect=(x,z,[a,b,c,d])=>x>=a&&x<=c&&z>=b&&z<=d;
const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const boundsXZ=points=>[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),
                        Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];

export function removeRectangle(mesh,rect){
 const source=mesh.geometry;
 if(source.drawRange.count===0)return;
 source.computeBoundingBox();
 const {min,max}=source.boundingBox;
 const [x,z,X,Z]=rect;
 if(max.x<=x||min.x>=X||max.z<=z||min.z>=Z)return;
 if(min.x>=x&&max.x<=X&&min.z>=z&&max.z<=Z){
  source.setDrawRange(0,0);
  return;
 }
 const attrs=Object.entries(source.attributes);
 const buffers=Object.fromEntries(attrs.map(([name])=>[name,[]]));
 function vertex(i){
  const values={};
  for(const [name,attr] of attrs){
   const list=[];
   for(let k=0;k<attr.itemSize;k++)list.push(attr.getComponent(i,k));
   values[name]=list;
  }
  return values;
 }
 function join(a,b,t){
  const values={};
  for(const [name] of attrs)values[name]=a[name].map((v,k)=>v+(b[name][k]-v)*t);
  return values;
 }
 function triangle(a,b,c){
  for(const [name] of attrs)buffers[name].push(...a[name],...b[name],...c[name]);
 }
 function split(poly,axis,value,sign){
  const inner=[],outer=[];
  let a=poly.at(-1),da=(a.position[axis]-value)*sign;
  for(const b of poly){
   const db=(b.position[axis]-value)*sign;
   if((da>=0)!==(db>=0)){
    const mid=join(a,b,da/(da-db));
    inner.push(mid);outer.push(mid);
   }
   (db>=0?inner:outer).push(b);
   a=b;da=db;
  }
  return [inner,outer];
 }
 const planes=[[0,x,1],[0,X,-1],[2,z,1],[2,Z,-1]];
 const count=source.index?.count??source.attributes.position.count;
 for(let i=0;i<count;i+=3){
  const indices=[i,i+1,i+2].map(v=>source.index?.getX(v)??v);
  const p=source.attributes.position;
  const tx=indices.map(k=>p.getX(k)),tz=indices.map(k=>p.getZ(k));
  if(Math.min(...tx)>=x&&Math.max(...tx)<=X&&Math.min(...tz)>=z&&Math.max(...tz)<=Z)continue;
  let polygon=indices.map(vertex);
  if(Math.max(...tx)<x||Math.min(...tx)>X||Math.max(...tz)<z||Math.min(...tz)>Z){
   triangle(...polygon);continue;
  }
  for(const instruction of planes){
   const [inner,outer]=split(polygon,...instruction);
   for(let k=1;k+1<outer.length;k++)triangle(outer[0],outer[k],outer[k+1]);
   polygon=inner;
   if(polygon.length<3)break;
  }
 }
 const result=new THREE.BufferGeometry();
 for(const [name,attr] of attrs)result.setAttribute(name,new THREE.Float32BufferAttribute(buffers[name],attr.itemSize));
 result.computeBoundingBox();result.computeBoundingSphere();
 mesh.geometry=result;
 source.dispose();
}

function trimToCampus(mesh,ring,triangles,inside){
 const source=mesh.geometry;
 if(source.drawRange.count===0)return;
 source.computeBoundingBox();
 const {min,max}=source.boundingBox;
 const area=[min.x,min.z,max.x,max.z];
 const crosses=ring.some((a,i)=>intersects(boundsXZ([a,ring[(i+1)%ring.length]]),area));
 if(!crosses){
  if(!inside((min.x+max.x)/2,(min.z+max.z)/2,ring))source.setDrawRange(0,0);
  return;
 }
 const regional=triangles.filter(t=>intersects(t.bounds,area));
 const attrs=Object.entries(source.attributes);
 const output=Object.fromEntries(attrs.map(([name])=>[name,[]]));
 function readVertex(i){
  return attrs.map(([,attribute])=>Array.from({length:attribute.itemSize},(_,k)=>attribute.getComponent(i,k)));
 }
 function insert(vertices){
  for(const vertex of vertices)attrs.forEach(([name],i)=>output[name].push(...vertex[i]));
 }
 function cut(verts,point,direction,positionIndex){
  let a=verts.at(-1);
  const value=v=>(v[positionIndex][0]-point[0])*direction[1]-(v[positionIndex][2]-point[1])*direction[0];
  let da=value(a);
  const result=[];
  for(const b of verts){
   const db=value(b);
   if((da>=0)!==(db>=0)){
    const along=da/(da-db);
    result.push(a.map((attr,i)=>attr.map((v,k)=>v+(b[i][k]-v)*along)));
   }
   if(db>=0)result.push(b);
   a=b;da=db;
  }
  return result;
 }
 const p=attrs.findIndex(([name])=>name==='position');
 const count=source.index?.count??source.attributes.position.count;
 for(let index=0;index<count;index+=3){
  const indices=[index,index+1,index+2].map(i=>source.index?.getX(i)??i);
  const points=indices.map(i=>[source.attributes.position.getX(i),source.attributes.position.getZ(i)]);
  const bounds=boundsXZ(points);
  const touched=regional.filter(t=>intersects(t.bounds,bounds));
  if(!touched.length)continue;
  const vertices=indices.map(readVertex);
  for(const t of touched){
   let clipped=vertices;
   for(const [a,d] of t.edges){
    clipped=cut(clipped,a,d,p);
    if(clipped.length<3)break;
   }
   for(let i=1;i+1<clipped.length;i++)insert([clipped[0],clipped[i],clipped[i+1]]);
  }
 }
 const result=new THREE.BufferGeometry();
 for(const [name,attr] of attrs)result.setAttribute(name,new THREE.Float32BufferAttribute(output[name],attr.itemSize));
 result.computeBoundingBox();result.computeBoundingSphere();
 mesh.geometry=result;
 source.dispose();
}

function partContains(x,z,part,inside){
 return inside(x,z,part.rings[0])&&!part.rings.slice(1).some(r=>inside(x,z,r));
}

function surfaces(root,records,terrain,bindSurface,bindGrass,bindWater){
 const positions=new Map();
 for(const part of records){
  if(!positions.has(part.kind))positions.set(part.kind,[]);
  const p=positions.get(part.kind);
  const offset=part.kind==='grove'?.055:.085;
  for(const tri of part.triangles){
   const [a,b,c]=tri;
   const normal=(b[1]-a[1])*(c[0]-a[0])-(b[0]-a[0])*(c[1]-a[1]);
   for(const [x,z] of normal>0?tri:[a,c,b]){
    const y=terrain(x,z);
    const wet=part.kind==='edge_water'||part.kind==='pond';
    p.push(x,wet?-.115:part.height===null?(part.kind==='old_frame_turf'?Math.max(0,y):y)+offset:part.height,z);
   }
  }
 }
 for(const [kind,data] of positions){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(data,3));
  g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({name:'R9_site_'+kind,color:FINISH[kind],roughness:kind.includes('water')||kind==='pond'?.40:.95}));
  mesh.receiveShadow=true;
  mesh.name='R9_site_'+kind;
  if(NATURAL_TURF.has(kind)){
   const uv=new Float32Array(data.length/3*2);
   for(let point=0;point<data.length/3;point++){
    uv[point*2]=data[point*3]*.25;
    uv[point*2+1]=1-data[point*3+2]*.25;
   }
   g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
   bindGrass(mesh.material,kind);
  }
  bindSurface(mesh.material);
  root.add(mesh);
  if(kind==='edge_water'||kind==='pond')bindWater(mesh);
 }
}

function fixtures(root,sport){
 const metal=new THREE.MeshStandardMaterial({color:0x555d60,roughness:.72});
 const meshNet=new THREE.MeshStandardMaterial({color:0xbbc0b4,roughness:.95});
 const white=new THREE.MeshStandardMaterial({color:0xe9e4d2,roughness:.8});
 const red=new THREE.MeshStandardMaterial({color:0xa74f31,roughness:.74});
 const lines=new Map(), meshes=[];
 function pole(from,to,r,material=metal){
  if(!lines.has(material))lines.set(material,[]);
  lines.get(material).push({from:new THREE.Vector3(...from),to:new THREE.Vector3(...to),r});
 }
 function box(position,size,material){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);
  mesh.position.set(...position);mesh.castShadow=true;mesh.receiveShadow=true;
  meshes.push(mesh);
 }
 for(const {sport:kind,bounds_xz:[x,z,X,Z]} of sport.courts){
  const midX=(x+X)/2,midZ=(z+Z)/2;
  if(kind==='basketball'){
   for(const [end,dir] of [[z,1],[Z,-1]]){
    const post=end-dir*.73,board=end+dir*.41,hoop=board+dir*.33;
    pole([midX,.04,post],[midX,4.63,post],.088);
    pole([midX,4.63,post],[midX,4.63,board],.060);
    box([midX,4.52,board],[1.65,.96,.075],white);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.30,.027,6,18),red);
    ring.position.set(midX,4.10,hoop);ring.rotation.x=Math.PI/2;
    meshes.push(ring);
    for(let n=0;n<9;n++){
     const a=n*Math.PI*2/9,b=a+.26;
     pole([midX+.30*Math.cos(a),4.08,hoop+.30*Math.sin(a)],
          [midX+.18*Math.cos(b),3.81,hoop+.18*Math.sin(b)],.011,white);
    }
   }
  }else{
   const h=kind==='tennis'?1.22:3.08, netHeight=kind==='tennis'?.79:.77;
   pole([x-.19,.04,midZ],[x-.19,h+.09,midZ],.052);
   pole([X+.19,.04,midZ],[X+.19,h+.09,midZ],.052);
   for(let k=0;k<5;k++){
    const y=h-k*netHeight/4;
    pole([x-.19,y,midZ],[X+.19,y,midZ],k===0?.021:.010,k===0?white:meshNet);
   }
   for(let q=x;q<X;q+=.33) pole([q,h,midZ],[q,h-netHeight,midZ],.009,meshNet);
  }
 }
 const f=sport.fitness_candidate_xz;
 for(const [a,b,c,d] of [[f[0],f[1],f[2],f[1]],[f[2],f[1],f[2],f[3]],[f[2],f[3],f[0],f[3]],[f[0],f[3],f[0],f[1]]]){
  const sections=Math.ceil(Math.hypot(c-a,d-b)/1.8);
  for(let i=0;i<sections;i++){
   const u=i/sections,v=(i+.6)/sections;
   pole([a+(c-a)*u,.05,b+(d-b)*u],[a+(c-a)*v,.05,b+(d-b)*v],.035,white);
  }
 }
 const unit=new THREE.CylinderGeometry(1,1,1,6);
 const up=new THREE.Vector3(0,1,0), temp=new THREE.Object3D();
 for(const [material,items] of lines){
  const mesh=new THREE.InstancedMesh(unit,material,items.length);
  items.forEach(({from,to,r},i)=>{
   const d=to.clone().sub(from);
   temp.position.copy(from).lerp(to,.5);
   temp.quaternion.setFromUnitVectors(up,d.clone().normalize());
   temp.scale.set(r,d.length(),r);
   temp.updateMatrix();mesh.setMatrixAt(i,temp.matrix);
  });
  mesh.computeBoundingSphere();mesh.castShadow=true;root.add(mesh);
 }
 root.add(...meshes);
}

export function attachSatelliteSite({world,terrainY,inside,perimeter,sport,fixtureRanges,forecourtBounds,northForecourt,bindSurface,bindGrass,bindWater,waterEdits}){
 const root=new THREE.Group();root.name='R9_SATELLITE_CAMPUS_PERIMETER';world.add(root);
 surfaces(root,perimeter.geometry,terrainY,bindSurface,bindGrass,bindWater);
 const water=perimeter.geometry.filter(p=>p.kind==='edge_water'||p.kind==='pond');
 const restored=perimeter.geometry.filter(p=>p.kind==='old_frame_turf');
 const paths=perimeter.geometry.filter(p=>p.kind==='east_path');
 const additionalGround=perimeter.geometry.filter(p=>['outer_infill','old_frame_turf','bank_foundation','east_path'].includes(p.kind));
 const groves=perimeter.geometry.filter(p=>p.kind==='grove');
 const campusContains=(x,z)=>inside(x,z,perimeter.outline);
 const footprintInCampus=(lo,hi)=>{
  const tile=[lo[0],lo[2],hi[0],hi[2]];
  return campusContains((lo[0]+hi[0])/2,(lo[2]+hi[2])/2)||
   perimeter.outline.some((p,i)=>intersects(boundsXZ([p,perimeter.outline[(i+1)%perimeter.outline.length]]),tile));
 };
 const boundaryTriangles=perimeter.outline_triangles.map(points=>{
  const [a,b,c]=points, cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const ordered=cross>0?[a,c,b]:points;
  const edges=ordered.map((point,i)=>{
   const next=ordered[(i+1)%3];
   return [point,[next[0]-point[0],next[1]-point[1]]];
  });
  return {bounds:boundsXZ(points),edges};
 });
 const legacyWater=(x,z)=>perimeter.legacy_outer_water_bands_xz.some(b=>inRect(x,z,b));
 const reclaimed=(x,z)=>restored.some(part=>partContains(x,z,part,inside));
 const inSport=(x,z)=>!!sport&&inRect(x,z,sport.domain_xz);
 const sportTurf=sport?.geometry.filter(p=>p.kind==='turf')||[];
 const naturalSportTurf=(x,z)=>sportTurf.some(p=>partContains(x,z,p,inside));
 const isWet=(x,z)=>water.some(part=>partContains(x,z,part,inside));
 const blockPlant=(x,z)=>!campusContains(x,z)||isWet(x,z)||(inSport(x,z)&&!naturalSportTurf(x,z))||paths.some(p=>partContains(x,z,p,inside));

 const origin=[-1700,-1050],size=[3500,2050],width=1250,height=766;
 const bytes=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=origin[0]+(x+.5)*size[0]/width,v=origin[1]+(y+.5)*size[1]/height;
  const i=4*(y*width+x);
  bytes[i]=campusContains(u,v)?255:0;
  bytes[i+1]=legacyWater(u,v)?255:0;
  bytes[i+2]=inSport(u,v)?255:0;
  bytes[i+3]=255;
 }
 const mask=new THREE.DataTexture(bytes,width,height);
 mask.needsUpdate=true;
 const original=fixtureRanges?.rows||[];
 const fixturesByNode=new Map();
 for(const owner of original)for(const [node,d] of Object.entries(owner.nodes)){
  if(!fixturesByNode.has(node))fixturesByNode.set(node,[]);
  fixturesByNode.get(node).push({range:d,owner});
 }
 if(sport){
  const scope=new THREE.Group();scope.name='R9_SCIENCE_SATELLITE_COURTS';
  surfaces(scope,sport.geometry,terrainY,bindSurface,bindGrass,bindWater);fixtures(scope,sport);world.add(scope);
 }

 function remapFixtures(node){
  const rows=fixturesByNode.get(node.name);
  if(!sport||!rows)return;
  const geometry=node.geometry,src=geometry.attributes.position;
  const [a,b,c,d]=sport.old_football_bounds_xz;
  const [e,f,g,h]=sport.football_bounds_xz;
  for(const {range:[start,count],owner} of rows){
   const {centre:[cx,cz],role}=owner;
   const xx=e+(cx-a)*(g-e)/(c-a),zz=f+(cz-b)*(h-f)/(d-b);
   for(let tri=start;tri<start+count;tri++){
    for(let corner=0;corner<3;corner++){
     const k=geometry.index?geometry.index.getX(tri*3+corner):tri*3+corner;
     if(k===undefined||k>=src.count)continue;
     const offX=src.getX(k)-cx,offZ=src.getZ(k)-cz;
     const targetX=role==='shelter'?(g-4)+offX:xx+offX;
     const targetZ=role==='shelter'?(h+7)+offZ:zz+offZ;
     src.setXYZ(k,targetX,src.getY(k),targetZ);
    }
   }
  }
  src.needsUpdate=true;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
 }
 function clipMaterial(mesh,kind){
  if(kind==='building'){remapFixtures(mesh);return;}
  if(kind!=='surface'&&kind!=='ground_flora'&&kind!=='aquatic_vegetation')return;
  if(kind==='surface'||kind==='ground_flora'){
   for(const strip of perimeter.legacy_outer_water_bands_xz)removeRectangle(mesh,strip);
   if(kind==='surface'&&mesh.material.name==='water')for(const bounds of waterEdits)removeRectangle(mesh,bounds);
   if(sport)removeRectangle(mesh,sport.domain_xz);
   if(kind==='ground_flora')for(const bounds of forecourtBounds)removeRectangle(mesh,bounds);
   if(kind==='surface'&&northForecourt)removeRectangle(mesh,northForecourt);
   if(kind==='ground_flora'||mesh.material.name==='grass')trimToCampus(mesh,perimeter.outline,boundaryTriangles,inside);
  }
  bindPerimeterMask(mesh.material,kind);
 }
 function bindPerimeterMask(m,kind){
  if(m.userData.satelliteMaskBound)return;
  m.userData.satelliteMaskBound=true;
  const isWater=kind==='surface'&&m.name==='water';
  const prior=m.onBeforeCompile, key=m.customProgramCacheKey();
  m.onBeforeCompile=function(shader,...args){
   prior.call(this,shader,...args);
   shader.uniforms.r9SiteMask={value:mask};
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 r9SiteXZ;')
    .replace('#include <project_vertex>',`#include <project_vertex>\nr9SiteXZ=(modelMatrix*vec4(transformed,1.0)).xz/${world.scale.x.toFixed(8)};`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
    '#include <common>\nuniform sampler2D r9SiteMask;\nvarying vec2 r9SiteXZ;')
    .replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
      vec2 r9UV=(r9SiteXZ-vec2(${origin.map(n=>n.toFixed(1)).join(',')}))/vec2(${size.map(n=>n.toFixed(1)).join(',')});
      if (any(lessThan(r9UV,vec2(0.0)))||any(greaterThan(r9UV,vec2(1.0)))) discard;
      vec4 r9Area=texture2D(r9SiteMask,r9UV);
      if (r9Area.r<0.5${isWater?' || r9Area.g>0.5':''}) discard;
      ${sport?`if (all(greaterThan(r9SiteXZ,vec2(${sport.domain_xz.slice(0,2).map(v=>v.toFixed(3)).join(',')}))) &&
        all(lessThan(r9SiteXZ,vec2(${sport.domain_xz.slice(2).map(v=>v.toFixed(3)).join(',')})))) discard;`:''}
    `);
  };
  m.customProgramCacheKey=()=>key+`/r9-satellite/${kind}/${isWater}/${!!sport}`;
  m.needsUpdate=true;
 }
 return {campusContains,footprintInCampus,clipMaterial,bindPerimeterMask,isWet,reclaimed,inSport,blockPlant,perimeter,
  supportedInfill:(x,z)=>additionalGround.some(p=>partContains(x,z,p,inside)),
  extraHabitat:(x,z)=>inSport(x,z)?(naturalSportTurf(x,z)?1:0):groves.some(p=>partContains(x,z,p,inside))?3:0,
  state:()=>({points:perimeter.outline.length-1,gates:4,newTrees:perimeter.trees.length,outerWaterReplaced:true,
    sports:sport?.court_counts??null,fitnessCandidate:sport?.fitness_candidate_xz??null})};
}
