import * as THREE from 'three';

// Source L0 tiles -32/15 and -32/16. The steps on either end have
// separate half-unit treads; the middle asphalt deck is at Y 2.
const WEST=-1017, EAST=-998, SOUTH=506, NORTH=515;
const profile=[
 [WEST,-1013,1],[-1013,-1012.5,1.5],[-1012.5,-1002.5,2],
 [-1002.5,-1002,1.5],[-1002,EAST,1],
];

export function restoreScienceCanalBridge(world) {
 const stone=new THREE.MeshStandardMaterial({name:'R9_Canal_Bridge_Step_Stone',color:0x848883,roughness:.92});
 const steps=[
  [-1013,-1012.5,1.5],[-1012.5,-1012,2],
  [-1003,-1002.5,2],[-1002.5,-1002,1.5],
 ];
 const restored=new THREE.Group();
 restored.name='R9_SCIENCE_CANAL_BRIDGE_TREADS';
 for(const [a,b,y] of steps){
  const step=new THREE.Mesh(new THREE.BoxGeometry(b-a,y-1,NORTH-SOUTH),stone);
  step.position.set((a+b)/2,(y+1)/2,(NORTH+SOUTH)/2);
  step.castShadow=true;
  step.receiveShadow=true;
  restored.add(step);
 }
 world.add(restored);
 const surfaces=profile.map(([a,b,y],i)=>({
  id:'R9_SCIENCE_CANAL_BRIDGE_TREAD_'+i,mode:'exclusive',
  triangles:[[[a,y,SOUTH],[a,y,NORTH],[b,y,NORTH]],
             [[a,y,SOUTH],[b,y,NORTH],[b,y,SOUTH]]],
 }));
 const contains=(x,z)=>x>=WEST&&x<=EAST&&z>SOUTH&&z<NORTH;
 return {surfaces,contains};
}
