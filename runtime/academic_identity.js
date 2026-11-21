import * as THREE from 'three';

const PUBLIC_TEACHING_BRICK='buildings_s_-1_-1_R9_Core_Teaching_Brick';

function lettering(lines,width,height){
 const canvas=document.createElement('canvas');
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#ece8dd';
 ctx.textAlign='center';
 ctx.textBaseline='middle';
 for(const {text,y,size,family} of lines){
  ctx.font=`650 ${size}px ${family}`;
  ctx.fillText(text,width/2,y,width*.96);
 }
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.anisotropy=4;
 return texture;
}

export function addAcademicEntranceIdentity(model){
 if(!model.getObjectByName(PUBLIC_TEACHING_BRICK))return;
 const marker=new THREE.Group();
 marker.name='R9_A_TEACHING_WALL_LETTERING';
 function sign(lines,image,position,width,height){
  const material=new THREE.MeshBasicMaterial({map:lettering(lines,...image),
   transparent:true,alphaTest:.075,depthWrite:false});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
  mesh.position.set(...position);
  marker.add(mesh);
 }
 sign([
  {text:'公共教学楼',y:92,size:124,family:'"Microsoft YaHei", sans-serif'},
  {text:'PUBLIC TEACHING HALL',y:206,size:46,family:'Arial, sans-serif'},
 ],[720,264],[-173.2,9.74,137.068],10.6,3.05);
 sign([{text:'A 区',y:79,size:110,family:'"Microsoft YaHei", sans-serif'}],
  [240,156],[-174.7,5.05,137.068],2.75,1.76);
 model.add(marker);
}


// These doors sit one source unit above the connected terrace. Use the
// same top elevations for the stone treads and the walkable surfaces.
export function attachAcademicThresholds(world){
 const group=new THREE.Group();
 group.name='R9_CORE_ENTRANCE_TREADS';
 const stone=new THREE.MeshStandardMaterial({color:'#bfb9ab',roughness:.83});
 const surfaces=[],doorApproaches=[];
 const specs=[
  {id:'TEACHING_B',edge:-133.65,ends:[35,42],floor:5,side:1},
  {id:'TEACHING_C',edge:-133.65,ends:[-46,-39],floor:5,side:1},
  {id:'LAB_A',edge:-4.83,ends:[123,130],floor:1,side:-1},
  {id:'LAB_D',edge:-4.83,ends:[-132,-125],floor:1,side:-1},
 ];
 for(const {id,edge,ends,floor,side} of specs){
  const [a,b]=ends;
  const z0=a-.16,z1=b+.16;
  const triangles=[];
  for(let row=0;row<4;row++){
   const start=edge+side*row*.48,end=edge+side*(row+1)*.48;
   const [x0,x1]=[start,end].sort((a,b)=>a-b);
   const level=floor+1-row*.25;
   const height=level-floor+.06;
   const step=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,height,z1-z0),stone);
   step.name='R9_CORE_'+id+'_TREAD_'+row;
   step.position.set((x0+x1)/2,level-height/2,(z0+z1)/2);
   step.castShadow=step.receiveShadow=true;
   group.add(step);
   triangles.push([[x0,level,z0],[x0,level,z1],[x1,level,z1]],
    [[x0,level,z0],[x1,level,z1],[x1,level,z0]]);
  }
  surfaces.push({id:'R9_CORE_'+id+'_TREADS',mode:'raise',triangles});
  doorApproaches.push({edge,side,floor,a,b});
 }
 world.add(group);
 return {
  surfaces,
  hasDoorApproach(x,z,feet){
   return doorApproaches.some(({edge,side,floor,a,b})=>{
    const depth=(x-edge)*side;
    return depth>=.17&&depth<=2.27&&z>=a+.17&&z<=b-.17&&feet>=floor-.05&&feet<=floor+1.01;
   });
  },
 };
}
