// Low planting stays off the source footpaths and is loaded once its lawn is visible.
export function attachDormPlanting(THREE, world, terrainY, data) {
 const group = new THREE.Group();
 group.name = 'R9_2B_Lawn_and_Hedgerow';
 group.visible = false;
 world.add(group);
 let seed = 17403;
 const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
 const grass = [];
 for (let n=0; n<8; n++) {
  const x=(random()-.5)*.38, z=(random()-.5)*.38;
  const phi=random()*Math.PI*2, sx=Math.cos(phi), sz=Math.sin(phi);
  const h=.08+random()*.22, width=.013+random()*.010;
  const left=[x-sx*width,0,z-sz*width], right=[x+sx*width,0,z+sz*width];
  const bend=[x+sz*h*.22,h*.61,z-sx*h*.22], tip=[x+sz*h*.60,h,z-sx*h*.60];
  grass.push(...left,...right,...bend,...bend,...right,...tip);
 }
 const leaves=[], stems=[];
 const stemGeometry = new THREE.CylinderGeometry(.011,.023,1,5,1,true);
 const stemPosition = stemGeometry.attributes.position;
 const stemIndex = stemGeometry.index;
 for (let n=0; n<9; n++) {
  const phi=random()*Math.PI*2, r=.35+random()*.29;
  const end=new THREE.Vector3(Math.cos(phi)*r,.45+random()*.33,Math.sin(phi)*r);
  const start=new THREE.Vector3(end.x*.12,.025,end.z*.12);
  const direction=end.clone().sub(start);
  const tilt=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());
  const center=start.clone().addScaledVector(direction,.5);
  for(let i=0;i<stemIndex.count;i++){
   const v=new THREE.Vector3().fromBufferAttribute(stemPosition,stemIndex.getX(i));
   v.y*=direction.length();
   stems.push(...v.applyQuaternion(tilt).add(center).toArray());
  }
  for(let j=0;j<19;j++){
   const u=.26+random()*.76;
   const pos=start.clone().addScaledVector(direction,u);
   pos.x+=(random()-.5)*.38;
   pos.z+=(random()-.5)*.38;
   pos.y+=(random()-.5)*.23;
   const a=random()*Math.PI*2, length=.052+random()*.073;
   const x=Math.cos(a)*length,z=Math.sin(a)*length,h=(random()-.45)*.13;
   const left=[pos.x-z*.50,pos.y,pos.z+x*.50];
   const right=[pos.x+z*.50,pos.y,pos.z-x*.50];
   const base=[pos.x-x,pos.y-h,pos.z-z];
   const tip=[pos.x+x,pos.y+h,pos.z+z];
   const rib=[pos.x,pos.y+.022,pos.z];
   leaves.push(...base,...left,...rib,...left,...tip,...rib,...tip,...right,...rib,...right,...base,...rib);
  }
 }
 stemGeometry.dispose();
 function plant(positions,points,name,colors,shadow) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({name,color:0xffffff,roughness:.98,side:THREE.DoubleSide});
  const mesh=new THREE.InstancedMesh(geometry,material,points.length);
  const transform=new THREE.Object3D();
  const randomColors=points.map(()=>new THREE.Color(colors[Math.floor(random()*colors.length)]));
  points.forEach(([x,z],i)=>{
   transform.position.set(x,terrainY(x,z),z);
   transform.rotation.set(0,random()*Math.PI*2,0);
   const width=.77+random()*.38;
   transform.scale.set(width,.72+random()*.44,width);
   transform.updateMatrix();
   mesh.setMatrixAt(i,transform.matrix);
   mesh.setColorAt(i,randomColors[i]);
  });
  mesh.name=name;
  mesh.receiveShadow=true;
  mesh.castShadow=shadow;
  mesh.computeBoundingSphere();
  group.add(mesh);
  return mesh;
 }
 plant(grass,data.grass,'R9_2B_Grass_Blades',[0x526e35,0x658442,0x77894a,0x82984a],false);
 const foliage=plant(leaves,data.shrubs,'R9_2B_Individual_Shrub_Leaves',[0x526d30,0x66783d,0x708541],true);
 const branches=plant(stems,data.shrubs,'R9_2B_Shrub_Stems',[0x66624c,0x62563a],true);
 branches.instanceMatrix.array.set(foliage.instanceMatrix.array);
 branches.instanceMatrix.needsUpdate=true;
 branches.computeBoundingSphere();
 return (camera,scale)=>{
  const radius=100*scale;
  const previous=group.visible;
  group.visible=Math.hypot(camera.position.x-data.center[0]*scale,camera.position.z-data.center[1]*scale)<radius
   &&camera.position.y<radius;
  return group.visible!==previous;
 };
}
