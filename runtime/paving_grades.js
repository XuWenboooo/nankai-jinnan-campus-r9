import {science5Floor} from './source_passage_hardscape.js';

// Verified pavement artifacts in source-native x/z and y. Each correction
// lowers only excess height inside its ellipse and blends to the retained grade.
const corrections=[
 {x:-867.25,z:494,radiusX:2.55,radiusZ:3.5,height:.88,slopeX:.063},
 // The west plinth of student residence 5 has an isolated rounded peak
 // next to a window. Keep the plinth and the surrounding path grades.
 {x:-842.55,z:533.05,radiusX:3.15,radiusZ:2.6,height:.54,slopeX:.055},
 // Northern campus road spur. The quartz rise interrupts otherwise
 // continuous flat paving along both ends of the same road edge.
 {x:-776.75,z:-678.25,radiusX:5.7,radiusZ:4.25,height:.115,slopeX:-.01},
 // Western campus road where the curb and lane meet an elevation change.
 {x:-1024.25,z:301.65,radiusX:6.1,radiusZ:5.3,height:.90,slopeZ:-.068},
 // The long curb next to the western canal. The street level stays near 1 u.
 {x:-1017.2,z:370.5,radiusX:2.35,radiusZ:5.9,height:1.045,strip:true},
 {x:-1016.9,z:398,radiusX:2.0,radiusZ:17,height:1.066,strip:true},
 // Raised decorative detail accidentally inherited by the crossing surface.
 {x:-863.85,z:230.5,radiusX:3.1,radiusZ:2.7,height:.085},
 // Original rise here belongs to the dormitory side stair, not the floor.
 {x:-713.35,z:552.5,radiusX:3.8,radiusZ:3.8,height:1,strip:true},
 // The commercial courtyard's source chest was included in the legacy
 // ground-height grid. Grade the local paving back toward its surrounding floor.
 {x:-844.25,z:-454.75,radiusX:3.45,radiusZ:4.1,height:1.025},
];
const surfaceLayers=new Set(['stone_paving','paving','grass','white_marking','yellow_marking','brick_paving','asphalt']);
const bySector=new Map();
for(const grade of corrections){
 const {x,z,radiusX,radiusZ}=grade;
 for(let sx=Math.floor((x-radiusX)/128);sx<=Math.floor((x+radiusX)/128);sx++){
  for(let sz=Math.floor((z-radiusZ)/128);sz<=Math.floor((z+radiusZ)/128);sz++){
   const key='s_'+sx+'_'+sz;
   if(!bySector.has(key))bySector.set(key,[]);
   bySector.get(key).push(grade);
  }
 }
}

function datongApproachGrade(x,z,y){
 const dx=x-199,dz=z-34.5;
 const distance=Math.hypot(23,18);
 const along=(23*dx+18*dz)/distance,forward=(-18*dx+23*dz)/distance;
 const outer=9.0+.062*(along-2);
 const blend=Math.min(1,(along-.55)/.95,(29.9-along)/.8,(forward+.9)/.65,(outer-forward)/.85);
 return blend>0?y-Math.max(0,y-.985)*blend*blend*(3-2*blend):y;
}

function dormPassageGrade(x,z,y){
 const {x0,z0,x1,z1,y:limit}=science5Floor;
 const edge=Math.min(x-x0,x1-x,z-z0,z1-z);
 return edge>=0?Math.min(y,limit):y;
}

function reduceSpike(grade,x,z,y){
 const {radiusX,radiusZ,height,slopeX=0,slopeZ=0,strip}=grade;
 const dx=x-grade.x,dz=z-grade.z;
 const radius=strip?Math.max(Math.abs(dx/radiusX),Math.abs(dz/radiusZ)):Math.hypot(dx/radiusX,dz/radiusZ);
 if(radius>=1)return y;
 const limit=height+dx*slopeX+dz*slopeZ;
 if(y<=limit)return y;
 const blend=Math.min(1,(1-radius)/.45);
 return y-(y-limit)*blend*blend*(3-2*blend);
}

export function correctedPavingHeight(x,z,y){
 for(const grade of corrections){
  if(Math.abs(x-grade.x)>=grade.radiusX||Math.abs(z-grade.z)>=grade.radiusZ)continue;
  y=reduceSpike(grade,x,z,y);
 }
 return dormPassageGrade(x,z,datongApproachGrade(x,z,y));
}

export function fixPavingMesh(mesh,sector){
 const grades=bySector.get(sector);
 const datong=sector==='s_1_0';
 const science5=sector==='s_-6_4';
 if((!grades&&!datong&&!science5)||!surfaceLayers.has(mesh.material.name))return;
 const geometry=mesh.geometry;
 const position=geometry.attributes.position;
 const originalNormals=geometry.attributes.normal?.clone();
 const lowered=new Uint8Array(position.count);
 let changed=0;
 for(let i=0;i<position.count;i++){
  const x=position.getX(i),z=position.getZ(i),y=position.getY(i);
  let newY=y;
  for(const grade of grades||[])newY=reduceSpike(grade,x,z,newY);
  if(datong)newY=datongApproachGrade(x,z,newY);
  if(science5)newY=dormPassageGrade(x,z,newY);
  if(newY>=y-.00001)continue;
  position.setY(i,newY);
  lowered[i]=1;
  changed++;
 }
 if(!changed)return;
 const normalsToRefresh=lowered.slice();
 const count=geometry.index?.count??position.count;
 for(let i=0;i<count;i+=3){
  const a=geometry.index?.getX(i)??i,b=geometry.index?.getX(i+1)??i+1,c=geometry.index?.getX(i+2)??i+2;
  if(lowered[a]||lowered[b]||lowered[c])normalsToRefresh[a]=normalsToRefresh[b]=normalsToRefresh[c]=1;
 }
 geometry.computeVertexNormals();
 const normals=geometry.attributes.normal;
 if(originalNormals){
  for(let i=0;i<normals.count;i++){
   if(!normalsToRefresh[i])normals.setXYZ(i,originalNormals.getX(i),originalNormals.getY(i),originalNormals.getZ(i));
  }
 }
 normals.needsUpdate=true;
 position.needsUpdate=true;
 geometry.computeBoundingBox();
 geometry.computeBoundingSphere();
 mesh.userData.pavingVerticesLowered=changed;
}
