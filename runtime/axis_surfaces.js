import * as THREE from 'three';

const plazaMaterials = new Set(['paving', 'stone_paving', 'brick_paving']);
const libraryZone = { x0: -133, x1: -36, north: [190, 269], south: [323, 475] };

function linearColor(hex) {
 return new THREE.Color(hex).toArray().map(value => value.toFixed(6)).join(',');
}

export function installAxisSurfaces(mesh, kind, scale) {
 const { material } = mesh;
 const isPanel = kind === 'building' && mesh.name === 'buildings_s_-1_2_Library_Panel_Stone';
 const isApron = kind === 'building' && mesh.name === 'buildings_s_-1_1_Warm_Limestone';
 const isBridge = kind === 'building' && mesh.name === 'buildings_s_-1_-1_Photographed_Light_Gray_Stone';
 if (!isPanel && !isApron && !isBridge && !(kind === 'surface' && plazaMaterials.has(material.name))) return;
 if (material.userData.r9AxisSurface) return;
 if (kind === 'surface') {
  mesh.geometry.computeBoundingBox();
  const { min, max } = mesh.geometry.boundingBox;
  const touchesPlaza = [libraryZone.north, libraryZone.south].some(([z0, z1]) => min.z < z1 && max.z > z0);
  if (!touchesPlaza || min.x >= libraryZone.x1 || max.x <= libraryZone.x0) return;
 }
 const profile = isBridge ? 'bridge' : isPanel ? 'library_stairs' : 'library';
 material.userData.r9AxisSurface = profile;
 const previous = material.onBeforeCompile;
 const key = material.customProgramCacheKey();
 material.customProgramCacheKey = () => key + '/r9-axis-stone/' + profile;
 material.onBeforeCompile = function(shader, ...args) {
  previous.call(this, shader, ...args);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 nkuAxisSource;\nvarying vec3 nkuAxisNormal;')
   .replace('#include <project_vertex>', '#include <project_vertex>\nnkuAxisSource=(modelMatrix*vec4(transformed,1.0)).xyz/'+scale.toFixed(8)+';\nnkuAxisNormal=normalize(mat3(modelMatrix)*objectNormal);');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
   varying vec3 nkuAxisSource;
   varying vec3 nkuAxisNormal;
   float axisHash(vec2 p){
    vec3 h=fract(vec3(p.xyx)*.1031);
    h+=dot(h,h.yzx+33.33);
    return fract((h.x+h.y)*h.z);
   }
   float axisNoise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    f=f*f*(3.0-2.0*f);
    return mix(mix(axisHash(i),axisHash(i+vec2(1,0)),f.x),
               mix(axisHash(i+vec2(0,1)),axisHash(i+vec2(1)),f.x),f.y);
   }
   float axisBand(float at,float a,float b){
    float edge=min(.65,(b-a)*.2);
    return smoothstep(a,a+edge,at)*(1.-smoothstep(b-edge,b,at));
   }
  `).replace('#include <color_fragment>', `#include <color_fragment>
   vec3 axisPoint=nkuAxisSource;
   float axisNorth=axisBand(axisPoint.z,${libraryZone.north.map(n=>n.toFixed(1)).join(',')});
   float axisSouth=axisBand(axisPoint.z,${libraryZone.south.map(n=>n.toFixed(1)).join(',')});
   float axisWeight=${isBridge ? `
    axisBand(axisPoint.x,-110.0,-59.0)*axisBand(axisPoint.y,4.92,5.08)*
    max(max(axisBand(axisPoint.z,40.0,45.4),axisBand(axisPoint.z,-49.1,-44.0)),
        axisBand(axisPoint.z-(9.5-(axisPoint.x+110.0)*23.0/51.0),-3.45,3.45))
   ` : `axisBand(axisPoint.x,${libraryZone.x0.toFixed(1)},${libraryZone.x1.toFixed(1)})*max(axisNorth,axisSouth)`};
   vec2 axisMetric=(axisPoint.xz+vec2(84.5,-295.5))*${scale.toFixed(8)};
   vec2 axisWidth=fwidth(axisMetric);
   float axisHeight=0.0;
   if(axisWeight>0.0&&nkuAxisNormal.y>.75&&axisPoint.y<12.0){
    float speck=(axisNoise(axisMetric*138.0)-.5)*(1.-smoothstep(.002,.011,max(axisWidth.x,axisWidth.y)));
    float minerals=axisNoise(axisMetric*19.0)-.5;
    float castTone=axisNoise(axisMetric*.71)-.5;
    ${isPanel ? `
     diffuseColor.rgb*=1.0+(speck*.20+minerals*.092+castTone*.055)*axisWeight;
     axisHeight=(minerals*.00044+speck*.00022)*axisWeight;
    ` : `
     vec2 blockSize=${isBridge?'vec2(.87,.56)':'mix(vec2(.71,.61),vec2(.66,.57),axisNorth)'};
     vec2 block=axisMetric/blockSize;
     vec2 distanceToJoint=min(fract(block),1.0-fract(block))*blockSize;
     vec2 aa=clamp(axisWidth*.50,vec2(.00033),vec2(.12));
     vec2 seam=1.0-smoothstep(vec2(.003)-aa,vec2(.003)+aa,distanceToJoint);
     float jointFade=1.0-smoothstep(.018,.17,max(axisWidth.x,axisWidth.y));
     float joint=max(seam.x,seam.y)*jointFade;
     float batch=axisHash(floor(block))-.5;
     vec3 granite=vec3(${linearColor(isBridge?'#acacaa':'#bdb9ab')})*(1.0+batch*.10+castTone*.11+minerals*.11+speck*.23);
     granite=mix(granite,vec3(${linearColor('#8c887d')}),joint*.51);
     diffuseColor.rgb=mix(diffuseColor.rgb,granite,${isBridge?'.55':'.79'}*axisWeight);
     axisHeight=(minerals*.00059+speck*.00028-joint*.0012)*axisWeight;
    `}
   }
  `).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
   vec3 axisX=dFdx(-vViewPosition),axisY=dFdy(-vViewPosition);
   vec3 axisRight=cross(axisY,normal),axisDown=cross(normal,axisX);
   float axisDet=dot(axisX,axisRight);
   vec2 axisSlope=vec2(dFdx(axisHeight),dFdy(axisHeight));
   if(abs(axisDet)>1e-9&&axisWeight>0.0&&nkuAxisNormal.y>.75&&axisPoint.y<12.0){
    vec3 axisGradient=sign(axisDet)*(axisSlope.x*axisRight+axisSlope.y*axisDown);
    normal=normalize(abs(axisDet)*normal-axisGradient);
   }
  `);
 };
 material.needsUpdate = true;
}

