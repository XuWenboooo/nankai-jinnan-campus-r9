import * as THREE from 'three';

export function createRoadLighting(world, loadPositions, groundAt, inCampus) {
 const group=new THREE.Group();
 group.name='R9_ROAD_LAMPS_AT_DUSK';
 group.visible=false;
 world.add(group);
 const colors=[new THREE.Color('#ffd083'),new THREE.Color('#fff2d8')];
 const budget=8;
 const lights=Array.from({length:budget},()=>{
  const light=new THREE.SpotLight('#fff2d8',0,30,.88,.71,2);
  group.add(light,light.target);
  return light;
 });
 const grid=new Map(), stat={positions:0,activeNearby:0,warm:0,white:0,groundPools:0};
 const cellSize=48;
 const origin=new THREE.Vector2(-1720,-1050);
 const pixelStep=2;
 const width=1740,height=1010;
 const extent=new THREE.Vector2(width*pixelStep,height*pixelStep);
 const lightmap={value:null}, glaze={value:0};
 const focus=new THREE.Vector3(), direction=new THREE.Vector3();
 let loading=null,previousPosition=null;

 function bakeGroundPool(data){
  const rgb=new Uint8Array(width*height*4);
  for(const [x,y,z,dx,dz,tone] of data){
   const drop=Math.max(3,y-groundAt(x,z));
   const radius=THREE.MathUtils.clamp(drop*1.8,10,24);
   const reach=Math.hypot(dx,dz);
   const shift=reach>.1?Math.min(3.2,drop*.28)/reach:0;
   const cx=(x+dx*shift-origin.x)/pixelStep,cz=(z+dz*shift-origin.y)/pixelStep;
   const r=radius/pixelStep;
   const color=colors[tone];
   const peak=THREE.MathUtils.clamp(.31-(drop-7)*.012,.18,.35);
   for(let j=Math.max(0,Math.floor(cz-r));j<Math.min(height,Math.ceil(cz+r));j++){
    for(let i=Math.max(0,Math.floor(cx-r));i<Math.min(width,Math.ceil(cx+r));i++){
     const t=((i+.5-cx)**2+(j+.5-cz)**2)/(r*r);
     if(t>=1)continue;
     const glow=255*peak*(1-t)**2.35, a=4*(j*width+i);
     rgb[a]=Math.min(137,rgb[a]+glow*color.r);
     rgb[a+1]=Math.min(137,rgb[a+1]+glow*color.g);
     rgb[a+2]=Math.min(137,rgb[a+2]+glow*color.b);
    }
   }
  }
  const texture=new THREE.DataTexture(rgb,width,height);
  texture.minFilter=texture.magFilter=THREE.LinearFilter;
  texture.needsUpdate=true;
  lightmap.value=texture;
  stat.groundPools=data.length;
 }

 // Baked pools keep distant streets readable with the same fixed number of
 // GPU spot lights. They illuminate the existing surface texture, including
 // the replacement court pavements, without drawing floating ground quads.
 function bindSurface(material){
  if(!material.isMeshStandardMaterial||material.userData.r9RoadGroundBound)return;
  material.userData.r9RoadGroundBound=true;
  const previous=material.onBeforeCompile, key=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,...args){
   previous.call(this,shader,...args);
   shader.uniforms.r9RoadLightmap=lightmap;
   shader.uniforms.r9RoadDusk=glaze;
   shader.uniforms.r9RoadOrigin={value:origin};
   shader.uniforms.r9RoadExtent={value:extent};
   shader.vertexShader=shader.vertexShader.replace('#include <common>',
    '#include <common>\nvarying vec2 r9RoadXZ;\nvarying float r9RoadFacing;')
    .replace('#include <project_vertex>',`#include <project_vertex>
      r9RoadXZ=(modelMatrix*vec4(transformed,1.0)).xz/${world.scale.x.toFixed(8)};
      r9RoadFacing=clamp((modelMatrix*vec4(objectNormal,0.0)).y*1.33,0.0,1.0);
    `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
     varying vec2 r9RoadXZ;
     varying float r9RoadFacing;
     uniform sampler2D r9RoadLightmap;
     uniform float r9RoadDusk;
     uniform vec2 r9RoadOrigin;
     uniform vec2 r9RoadExtent;
    `).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      if(r9RoadDusk>0.0){
       vec2 roadUV=(r9RoadXZ-r9RoadOrigin)/r9RoadExtent;
       vec3 pools=texture2D(r9RoadLightmap,roadUV).rgb;
       reflectedLight.indirectDiffuse+=pools*diffuseColor.rgb*r9RoadFacing*r9RoadDusk;
      }
    `);
  };
  material.customProgramCacheKey=()=>key+'/r9-road-ground-pools';
  material.needsUpdate=true;
 }

 function glowAtHeads(data){
  const geometry=new THREE.PlaneGeometry(1,1);
  const tint=new Float32Array(data.length*3);
  const material=new THREE.ShaderMaterial({
   transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,
   vertexShader:`
    attribute vec3 glowTint;
    varying vec3 lampTint;
    varying vec2 glowUV;
    void main(){
     lampTint=glowTint;
     glowUV=uv;
     vec4 centre=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
     centre.xy+=position.xy*clamp(1.65-centre.z*.004,1.65,3.15);
     gl_Position=projectionMatrix*centre;
    }`,
   fragmentShader:`
    varying vec3 lampTint;
    varying vec2 glowUV;
    void main(){
     float distanceFromCentre=length(glowUV-.5)*2.;
     float alpha=pow(clamp(1.-distanceFromCentre,0.,1.),2.8)*.85;
     gl_FragColor=vec4(lampTint,alpha);
     #include <colorspace_fragment>
    }`,
  });
  const glow=new THREE.InstancedMesh(geometry,material,data.length), transform=new THREE.Matrix4();
  glow.name='R9_ROAD_LAMP_GLOW';
  data.forEach(([x,y,z,,,tone],i)=>{
   glow.setMatrixAt(i,transform.makeTranslation(x,y+.12,z));
   colors[tone].toArray(tint,i*3);
  });
  geometry.setAttribute('glowTint',new THREE.InstancedBufferAttribute(tint,3));
  glow.computeBoundingSphere();glow.boundingSphere.radius+=2;
  group.add(glow);
 }

 function addLenses(data) {
  const bulbs=data.positions.filter(([x,,z])=>inCampus(x,z)).map(([x,y,z,dx,dz])=>{
   const tone=((Math.floor(x/32)+Math.floor(z/40))&3)===0?0:1;
   return [x,y,z,dx,dz,tone];
  });
  const shape=new THREE.Shape();
  const x=.75,z=.35,b=.10;
  shape.moveTo(-x+b,-z);shape.lineTo(x-b,-z);shape.quadraticCurveTo(x,-z,x,-z+b);
  shape.lineTo(x,z-b);shape.quadraticCurveTo(x,z,x-b,z);
  shape.lineTo(-x+b,z);shape.quadraticCurveTo(-x,z,-x,z-b);shape.lineTo(-x,-z+b);shape.quadraticCurveTo(-x,-z,-x+b,-z);
  const lens=new THREE.InstancedMesh(new THREE.ShapeGeometry(shape,3).rotateX(Math.PI/2),
      new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),bulbs.length);
  lens.name='R9_ROAD_LUMINOUS_LENSES';
  const placement=new THREE.Object3D();
  bulbs.forEach(([x,y,z,dx,dz,tone],i)=>{
   placement.position.set(x,y,z);
   placement.rotation.y=Math.atan2(-dz,dx);
   placement.updateMatrix();
   lens.setMatrixAt(i,placement.matrix);
   lens.setColorAt(i,colors[tone]);
   const cell=Math.floor(x/cellSize)+'_'+Math.floor(z/cellSize);
   if(!grid.has(cell))grid.set(cell,[]);
   grid.get(cell).push({x,y,z,tone});
   stat[tone===0?'warm':'white']++;
  });
  lens.computeBoundingSphere();
  group.add(lens);
  stat.positions=bulbs.length;
  if(bulbs.length){
   glowAtHeads(bulbs);
   bakeGroundPool(bulbs);
  }
 }
 function update(camera,scale,dusk){
  group.visible=dusk;
  glaze.value=dusk&&lightmap.value?1:0;
  if(!dusk){stat.activeNearby=0;previousPosition=null;return;}
  if(!loading)loading=loadPositions().then(addLenses);
  if(!stat.positions)return;
  focus.copy(camera.position).multiplyScalar(1/scale);
  // At an oblique aerial view, prioritize the visible ground instead of
  // selecting by the height difference between the camera and lamp heads.
  if(focus.y>28){
   camera.getWorldDirection(direction);
   if(direction.y<-.19)focus.addScaledVector(direction,Math.min(360,(focus.y-3)/-direction.y));
  }
  const searchRadius=camera.position.y/scale>28?126:58;
  const cellRadius=Math.ceil(searchRadius/cellSize);
  const {x,z}=focus;
  if(previousPosition&&Math.hypot(x-previousPosition.x,z-previousPosition.z)<4)return;
  previousPosition={x,z};
  const ix=Math.floor(x/cellSize),iz=Math.floor(z/cellSize), near=[];
  for(let a=ix-cellRadius;a<=ix+cellRadius;a++)for(let b=iz-cellRadius;b<=iz+cellRadius;b++){
   for(const row of grid.get(a+'_'+b)||[]){
    const distance=Math.hypot(row.x-x,row.z-z);
    if(distance<searchRadius)near.push({row,distance});
   }
  }
  near.sort((a,b)=>a.distance-b.distance);
  stat.activeNearby=Math.min(budget,near.length);
  lights.forEach((light,id)=>{
   const row=near[id]?.row;
   light.intensity=row?(row.tone===0?365:390):0;
   if(row){
    light.position.set(row.x,row.y-.38,row.z);
    light.target.position.set(row.x,row.y-12,row.z);
    light.color.copy(colors[row.tone]);
   }
  });
 }
 return {update,bindSurface,state:()=>({...stat,groundPools:glaze.value?stat.groundPools:0})};
}
