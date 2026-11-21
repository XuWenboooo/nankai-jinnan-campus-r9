import * as THREE from 'three';

// The dormitory passage has the source's continuous andesite floor at Y 1.
// The side stair reverses direction on the Y 3 landing.
export const science5Floor={x0:-727,z0:536,x1:-714,z1:568,y:1};

export function restoreScience5Hardscape(world,maps) {
 const {x0,z0,x1,z1,y}=science5Floor;
 const stone=new THREE.MeshStandardMaterial({color:0x999b9b,roughness:.86});
 if(maps){
  stone.map=maps[0];
  stone.normalMap=maps[1];
  stone.normalScale.setScalar(.32);
 }
 const stairs=stone.clone();
 stairs.color.setHex(0x747775);
 const group=new THREE.Group();
 group.name='R9_SCIENCE5_NATIVE_PAVING_AND_STAIRS';
 const surfaces=[];
 const colliders=[];
 function slab(id,x,z,xx,zz,top,base,material){
  const positions=[x,top,z,x,top,zz,xx,top,zz,xx,top,z];
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([x/4,z/4,x/4,zz/4,xx/4,zz/4,xx/4,z/4],2));
  geometry.setIndex([0,1,2,0,2,3]);
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=id;
  mesh.receiveShadow=true;
  group.add(mesh);
  const [a,b,c,d]=[0,3,6,9].map(i=>positions.slice(i,i+3));
  surfaces.push({id,mode:base===null?'replace':'raise',triangles:[[a,b,c],[a,c,d]]});
  if(base!==null){
   const height=top-base;
   const support=new THREE.Mesh(new THREE.BoxGeometry(xx-x,height,zz-z),material);
   support.position.set((x+xx)/2,top-height/2-.006,(z+zz)/2);
   support.castShadow=true;
   support.receiveShadow=true;
   group.add(support);
   colliders.push({id,bounds:[x,z,xx,zz],outer:[[x,z],[xx,z],[xx,zz],[x,zz]],
    holes:[],base,roof:top,walkable_step:true});
  }
 }
 // A small render offset eliminates coplanar overlap with neighbouring paving.
 slab('R9_SCIENCE5_PASSAGE_FLOOR',x0,z0,x1,z1,y+.018,null,stone);
 const treads=[
  [-714,-713.5,551,552,1.5],[-714.5,-714,551,552,2],
  [-715,-714.5,551,552,2.5],[-716,-715,551,552,3],
  [-716,-714,552,553,3],[-714,-713.5,552,553,3.5],
  [-713.5,-713,552,553,4],[-713,-712.5,552,553,4.5],
  [-712.5,-712,552,553,5],[-712,-711.5,552,553,5.5],
  [-711.5,-711,552,553,6],
 ];
 treads.forEach(([a,b,c,d,h],i)=>slab('R9_SCIENCE5_SIDE_TREAD_'+i,a,c,b,d,h,i<5?1:3,stairs));
 world.add(group);
 return {surfaces,colliders};
}
