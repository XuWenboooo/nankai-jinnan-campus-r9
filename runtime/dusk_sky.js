import {BackSide,Mesh,ShaderMaterial,SphereGeometry,Vector3} from 'three';

const VERTEX =
 'varying vec3 skyDirection;\n'+
 'void main(){\n'+
 ' skyDirection=position;\n'+
 ' vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.0);\n'+
 ' gl_Position=vec4(clip.xy,clip.w*0.999999,clip.w);\n'+
 '}';

const FRAGMENT=`
varying vec3 skyDirection;
uniform float brightness;
uniform float time;
uniform float meteor;
uniform vec3 moonDirection;
uniform vec3 meteorOrigin;
uniform vec3 meteorTangent;
const float PI=3.14159265;
float hash2(vec2 grid){
 return fract(sin(dot(grid,vec2(127.1,311.7)))*43758.5453123);
}
void main(){
 vec3 d=normalize(skyDirection);
 float elevation=smoothstep(-.06,.66,d.y);
 vec3 horizon=vec3(.012,.020,.037);
 vec3 zenith=vec3(.0014,.0030,.0085);
 float bright=.24+.76*brightness;
 vec3 sky=mix(horizon,zenith,elevation)*bright;
 vec2 angular=vec2(atan(d.z,d.x)/PI*.5+.5,asin(clamp(d.y,-1.,1.))/PI+.5);
 vec2 starGrid=angular*vec2(174.,100.);
 vec2 cell=floor(starGrid);
 float rand=hash2(cell);
 vec2 starPosition=.18+.64*vec2(hash2(cell+vec2(23.,7.)),hash2(cell+vec2(11.,29.)));
 vec2 offset=(fract(starGrid)-starPosition)*vec2(max(.42,sqrt(max(0.,1.-d.y*d.y))),1.);
 float rad=length(offset);
 float aa=clamp(fwidth(rad),.022,.090);
 float size=mix(.025,.067,hash2(cell+vec2(3.,9.)));
 float star=1.-smoothstep(max(0.,size-aa),size+aa,rad);
 float visible=step(.968,rand)*smoothstep(.04,.31,d.y);
 float twinkle=.84+.16*sin(time*.83+rand*182.);
 sky+=vec3(.61,.69,.84)*star*visible*twinkle*mix(.46,.21,clamp(brightness,0.,1.));

 vec3 moonRight=normalize(cross(vec3(0.,1.,0.),moonDirection));
 vec3 moonUp=normalize(cross(moonDirection,moonRight));
 vec2 moonUV=vec2(dot(d,moonRight),dot(d,moonUp))/.0088;
 float moonRadius=length(moonUV);
 float disk=(1.-smoothstep(.93,1.1,moonRadius))*step(.99,dot(d,moonDirection));
 float sphereZ=sqrt(max(0.,1.-dot(moonUV,moonUV)));
 float phase=smoothstep(-.025,.075,dot(vec3(moonUV,sphereZ),normalize(vec3(-.82,.10,.37))));
 float mottled=.92+.08*sin(moonUV.x*12.+sin(moonUV.y*8.))*cos(moonUV.y*15.);
 sky=mix(sky,vec3(.74,.75,.69)*mottled,disk*(.07+.93*phase));
 sky+=vec3(.018,.016,.011)*exp(-moonRadius*1.15)*step(.98,dot(d,moonDirection));

 if(meteor>0.){
  vec3 plane=normalize(cross(meteorOrigin,meteorTangent));
  float along=atan(dot(d,meteorTangent),dot(d,meteorOrigin));
  float width=abs(dot(d,plane));
  float head=meteor*.22;
  float tail=head-.086;
  float profile=exp(-width*1650.)*smoothstep(tail,head,along)*(1.-smoothstep(head,head+.009,along));
  float glow=exp(-length(vec2(width*875.,(along-head)*180.)));
  float fade=smoothstep(0.,.11,meteor)*(1.-smoothstep(.72,1.,meteor));
  sky+=vec3(.90,.76,.53)*(profile*.78+glow*.52)*fade;
 }
 gl_FragColor=vec4(sky,1.);
 #include <colorspace_fragment>
}
`;

export function createDuskSky(scene){
 const moonDirection=new Vector3(.34,.52,-.79).normalize();
 const meteorOrigin=new Vector3(.055,.54,-.842).normalize();
 const meteorTangent=new Vector3(.87,-.42,-.13);
 meteorTangent.addScaledVector(meteorOrigin,-meteorTangent.dot(meteorOrigin)).normalize();
 const uniforms={
  brightness:{value:1},time:{value:0},meteor:{value:0},
  moonDirection:{value:moonDirection},meteorOrigin:{value:meteorOrigin},meteorTangent:{value:meteorTangent},
 };
 const material=new ShaderMaterial({vertexShader:VERTEX,fragmentShader:FRAGMENT,uniforms,
  side:BackSide,depthWrite:false,toneMapped:false});
 const layer=new Mesh(new SphereGeometry(1,48,24),material);
 layer.name='R9_DUSK_SKY';
 layer.renderOrder=2000;
 layer.frustumCulled=false;
 layer.visible=false;
 scene.add(layer);
 let started=0,count=0,wasActive=false;
 return {
  setMode(enabled,sky){
   if(enabled&&!layer.visible){
    started=performance.now();
    count=0;
    wasActive=false;
    uniforms.meteor.value=0;
   }
   layer.visible=enabled;
   uniforms.brightness.value=sky;
  },
  update(now){
   if(!layer.visible)return;
   const elapsed=Math.max(0,(now-started)*.001);
   const activeAt=5.8;
   const cycle=elapsed>=activeAt?(elapsed-activeAt)%28.9:-1;
   const active=cycle>0&&cycle<1.68;
   if(active&&!wasActive)count++;
   wasActive=active;
   uniforms.time.value=elapsed;
   uniforms.meteor.value=active?cycle/1.68:0;
  },
  state:()=>({visible:layer.visible,moon:moonDirection.toArray(),meteors:count,elapsed:uniforms.time.value,
   meteor:uniforms.meteor.value,skyBrightness:uniforms.brightness.value}),
 };
}
