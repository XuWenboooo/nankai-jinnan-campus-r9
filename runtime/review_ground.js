import * as THREE from 'three';

function intersects(a,b) {
 return a[0]<=b[2]&&b[0]<=a[2]&&a[1]<=b[3]&&b[1]<=a[3];
}

export function attachReviewGround(world,plan,inside,materials) {
 const shade=(region)=>region.finish??((region.kind==='entry'||region.source_material.includes('light_gray')||
  region.source_material==='sandstone_top')?'stone_paving':'asphalt');
 const excludedNodes=new Set(plan.excluded_nodes||[]);
 const geometry=new Map();
 const areas=new Map();
 const surfaces=[];
 const group=new THREE.Group();
 group.name='R9_REVIEW_SOURCE_GROUND';
 for(const region of plan.regions){
  const key=shade(region);
  if(!geometry.has(key))geometry.set(key,[]);
  if(region.kind!=='grade')geometry.get(key).push(...region.triangles);
  const [x0,z0,x1,z1]=region.bounds;
  for(let x=Math.floor(x0/128);x<=Math.floor(x1/128);x++){
   for(let z=Math.floor(z0/128);z<=Math.floor(z1/128);z++){
    const sector='s_'+x+'_'+z;
    if(!areas.has(sector))areas.set(sector,[]);
    if(region.kind==='paving'||region.kind==='grade')areas.get(sector).push(region);
   }
  }
  if(region.kind==='paving')surfaces.push({id:region.case,mode:'replace',triangles:region.triangles});
 }
 if(plan.risers?.length)geometry.set('step_riser',plan.risers);
 for(const [name,triangles] of geometry){
  if(!triangles.length)continue;
  const meshGeometry=new THREE.BufferGeometry();
  const position=triangles.flat(2);
  const uv=triangles.flat().flatMap(([x,y,z])=>[x/4,name==='step_riser'?y/4:z/4]);
  meshGeometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  meshGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  meshGeometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({
   name:'R9_REVIEW_'+name, color:({corridor_grass:0x626e45,planter_tuff:0x515850,finance_stone:0x8f635b,finance_wood:0xae9164,asphalt:0x7f827e})[name]??0xb7b8b2, roughness:.91,
   side:name==='step_riser'||name==='planter_tuff'?THREE.DoubleSide:THREE.FrontSide,
  });
  const maps=materials.get(({corridor_grass:'grass',step_riser:'stone_paving',planter_tuff:'stone_paving',finance_stone:'brick_paving',finance_wood:'timber_deck'})[name]||name);
  if(maps){
   material.map=maps.textures[0];
   material.normalMap=maps.textures[1];
   material.normalScale.setScalar(.32);
  }
  const mesh=new THREE.Mesh(meshGeometry,material);
  mesh.name=material.name;
  mesh.receiveShadow=true;
  group.add(mesh);
 }
 if(group.children.length)world.add(group);
 function pointOnRegion(region,x,z){
  const [x0,z0,x1,z1]=region.bounds;
  return x>=x0&&x<=x1&&z>=z0&&z<=z1&&inside(x,z,region.rings[0])&&
   !region.rings.slice(1).some(ring=>inside(x,z,ring));
 }
 function height(x,z,y,patches=areas.get('s_'+Math.floor(x/128)+'_'+Math.floor(z/128))){
  if(!patches)return y;
  for(const region of patches){
   if(y>region.y&&pointOnRegion(region,x,z))y=region.y;
  }
  return y;
 }
 function grade(mesh,sector) {
  if(excludedNodes.has(mesh.name)){
   mesh.visible=false;
   return;
  }
  const patches=areas.get(sector);
  if(!patches?.length||!/^(asphalt|grass|paving|stone_paving|brick_paving|timber_deck|soil)$/.test(mesh.material.name))return;
  const shape=mesh.geometry;
  shape.computeBoundingBox();
  const {min,max}=shape.boundingBox;
  const nearby=patches.filter(region=>intersects(region.bounds,[min.x,min.z,max.x,max.z]));
  if(!nearby.length)return;
  const p=shape.attributes.position;
  let changed=false;
  for(let i=0;i<p.count;i++){
   const y=p.getY(i),next=height(p.getX(i),p.getZ(i),y,nearby);
   if(next<y-.001){p.setY(i,next);changed=true;}
  }
  if(changed){
   p.needsUpdate=true;shape.computeVertexNormals();
   shape.computeBoundingBox();shape.computeBoundingSphere();
  }
 }
 return {surfaces,height,grade};
}
