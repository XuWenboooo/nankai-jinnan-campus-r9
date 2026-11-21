// Photo-informed commercial frontage. All source triangles keep their position.
export function finishCommercialPaving(mesh, sector, unitScale) {
 if (sector !== 's_-8_-5' || !mesh.geometry.attributes.position) return;
 const material=mesh.material;
 const finish={timber_deck:1,stone_paving:2};
 const surface=finish[material.name];
 if (!surface) return;
 const bounds=mesh.geometry.boundingBox;
 if (bounds && (bounds.max.x<-960 || bounds.min.x>-924 || bounds.max.z<-634 || bounds.min.z>-548)) return;

 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nvarying vec2 nkuPavingXZ;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nnkuPavingXZ=position.xz;');
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>',`#include <common>
varying vec2 nkuPavingXZ;
float nkuNoise(vec2 p){
 vec2 cell=floor(p), f=fract(p);
 vec4 r=fract(sin(vec4(dot(cell,vec2(27.31,43.71)),dot(cell+vec2(1,0),vec2(27.31,43.71)),dot(cell+vec2(0,1),vec2(27.31,43.71)),dot(cell+1.0,vec2(27.31,43.71))))*15214.163);
 f=f*f*(3.0-2.0*f);
 return mix(mix(r.x,r.y,f.x),mix(r.z,r.w,f.x),f.y);
}
`)
   .replace('#include <map_fragment>',`#include <map_fragment>
 float isOchre=${surface===1?'1.0':'0.0'};
 vec2 p=nkuPavingXZ*${unitScale.toFixed(9)};
 // Feather the inferred block limits; surface classes follow original polygon ownership.
 vec4 margin=vec4(nkuPavingXZ.x+960.0,-924.0-nkuPavingXZ.x,nkuPavingXZ.y+634.0,-548.0-nkuPavingXZ.y);
 float amount=smoothstep(0.0,3.2,min(min(margin.x,margin.y),min(margin.z,margin.w)));
 float wear=nkuNoise(p*.24)*.14+nkuNoise(p*1.7)*.06-.10;
 float grit=(nkuNoise(p*63.0)-.5)*.08*(1.0-smoothstep(.005,.022,max(length(dFdx(p)),length(dFdy(p)))));
 vec2 flags=p/vec2(.62,.32);
 flags.x+=.5*mod(floor(flags.y),2.0);
 vec2 fromEdge=abs(fract(flags+.5)-.5), feather=fwidth(flags);
 float joint=1.0-min(smoothstep(.011,.011+feather.x,fromEdge.x),smoothstep(.013,.013+feather.y,fromEdge.y));
 joint*=1.0-smoothstep(.18,.40,max(feather.x,feather.y));
 vec3 ochre=vec3(.55,.322,.111)*(1.0+wear+grit);
 vec3 stone=vec3(.335,.327,.300)*(1.0+wear+grit-.115*joint+.07*(nkuNoise(floor(flags))-.5));
 diffuseColor.rgb=mix(diffuseColor.rgb,mix(stone,ochre,isOchre),amount*.92);
`);
 };
 material.customProgramCacheKey=()=>`nku-frontage-${surface}`;
 material.needsUpdate=true;
}

