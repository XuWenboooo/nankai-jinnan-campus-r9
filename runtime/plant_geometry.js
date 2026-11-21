import * as THREE from 'three';

export function seededRandom(seed) {
 let state=seed>>>0;
 return ()=>(state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296;
}

const pigments=['#3c5128','#688337','#8ca44f','#566a2f','#53442e'].map(hex=>new THREE.Color(hex));
const profiles={
  clipped:{stems:11,spread:.78,leaf:.103},
  spreading:{stems:9,spread:.89,leaf:.110},
  upright:{stems:10,spread:.68,leaf:.075},
  groundcover:{stems:7,spread:.83,leaf:.160},
};

export function shrubGeometry(form,variant,detail,sparse=false) {
 const profile=profiles[form];
 const rng=seededRandom(form.length*761+variant*4301+279);
 const vertices=[],colors=[];
 const v=(x,y,z)=>new THREE.Vector3(x,y,z);
 const mix=(a,b,t)=>a.clone().lerp(b,t);
 function triangle(a,b,c,tintA,tintB=tintA,tintC=tintA){
  vertices.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
  for(const tint of [tintA,tintB,tintC])colors.push(tint.r,tint.g,tint.b);
 }
 function woody(from,to,width){
  const cross=v(to.z-from.z,0,from.x-to.x).normalize().multiplyScalar(width);
  const lower=from.clone().add(cross), opposite=from.clone().sub(cross);
  const tip=to.clone().addScaledVector(cross,.24), flip=to.clone().addScaledVector(cross,-.24);
  const bark=pigments[4];
  triangle(lower,opposite,tip,bark);triangle(opposite,flip,tip,bark);
  const other=v(0,1,0).cross(cross).normalize().multiplyScalar(width*.76);
  triangle(from.clone().add(other),from.clone().sub(other),to,bark);
 }
 function leaf(site,angle,length,bend,tint) {
  const along=v(Math.cos(angle),bend,Math.sin(angle)).multiplyScalar(length);
  const across=v(-Math.sin(angle),.13,Math.cos(angle)).multiplyScalar(length*(.42+rng()*.17));
  const base=site, end=site.clone().add(along);
  const side=site.clone().addScaledVector(along,.49);
  const left=side.clone().add(across),right=side.clone().sub(across);
  if(detail){
   const keel=side.clone().add(v(0,length*.14,0));
   const shaded=tint.clone().multiplyScalar(.68+rng()*.17);
   triangle(base,left,keel,shaded,tint,tint);triangle(left,end,keel,tint);
   triangle(end,right,keel,tint,shaded,tint);triangle(right,base,keel,shaded,shaded,tint);
  }else{
   triangle(base,left,end,tint);triangle(end,right,base,tint);
  }
 }
 const stems=sparse?5:detail?profile.stems:Math.max(6,profile.stems-2);
 for(let t=0;t<stems;t++){
  const angle=t*2.399963+(rng()-.5)*.58;
  const radial=v(Math.cos(angle),0,Math.sin(angle));
  const tangent=v(-radial.z,0,radial.x);
  const reach=profile.spread*(.34+rng()*.58);
  const shapeHeight=form==='clipped'?1.05-.54*reach:form==='upright'?.56+rng()*.40:.38+rng()*.42;
  const root=v((rng()-.5)*.17,0,(rng()-.5)*.17);
  const bend=root.clone().addScaledVector(radial,reach*.41).add(v(0,shapeHeight*.53,0));
  const tip=root.clone().addScaledVector(radial,reach).add(v(0,shapeHeight,0));
  if(!sparse||t%2===0)woody(root,bend,.014);
  if(!sparse)woody(bend,tip,.009);
  const sprays=sparse||form==='groundcover'?2:detail?4:3;
  for(let spray=0;spray<sprays;spray++){
   const start=sparse?mix(root,tip,.38+.46*spray/(sprays-1)):mix(bend,tip,.18+.76*spray/(sprays-1));
   const sweep=(spray%2===0?1:-1)*(.13+rng()*.14);
   const end=start.clone().addScaledVector(tangent,sweep).addScaledVector(radial,.10).add(v(0,.15+rng()*.22,0));
   if(!sparse)woody(start,end,.0047);
   const leafCount=sparse?4:detail?(form==='clipped'?10:8):6;
   for(let i=0;i<leafCount;i++){
    const direction=angle+(i%2===0?1:-1)*(1.0+rng()*.85);
    const site=mix(start,end,.22+.73*i/(leafCount-1)).addScaledVector(radial,(rng()-.35)*.075);
    const tone=pigments[0].clone().lerp(pigments[1],Math.min(1,site.y*.65+rng()*.46))
     .lerp(pigments[2],site.y>.68?.20+rng()*.25:0).lerp(pigments[3],rng()*.30);
    const length=profile.leaf*(sparse?1.83:detail?1:1.38)*(.77+rng()*.75);
    leaf(site,direction,length,.21+rng()*.90,tone);
    if(!sparse&&form==='clipped'&&i%3===0){
     const inside=site.clone().addScaledVector(radial,-(.065+rng()*.05)).add(v(0,-.06,0));
     leaf(inside,direction+1.1,length*.84,.18+rng()*.63,tone);
    }
   }
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.computeVertexNormals();
 geometry.computeBoundingSphere();
 return geometry;
}

