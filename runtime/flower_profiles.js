const ROW_BYTES=24;

export async function loadFlowerProfiles() {
 const indexResponse=await fetch('../world/r9_campus_flower_profiles.json');
 if(!indexResponse.ok)throw Error('Flower profile index HTTP '+indexResponse.status);
 const index=await indexResponse.json();
 const response=await fetch('../'+index.compressed_file);
 if(!response.ok)throw Error('Flower profiles HTTP '+response.status);
 const stream=response.body.pipeThrough(new DecompressionStream('deflate'));
 const view=new DataView(await new Response(stream).arrayBuffer());
 if(index.record_bytes!==ROW_BYTES||view.byteLength!==index.rows*ROW_BYTES)throw Error('Invalid flower profile record length');
 return {
  refine(mesh){
   const range=index.sectors[mesh.name];
   if(!range)return;
   const [start,count]=range;
   const p=mesh.geometry.getAttribute('position');
   for(let i=start;i<start+count;i++){
    const offset=i*ROW_BYTES;
    const first=view.getUint32(offset,true),end=view.getUint32(offset+4,true);
    const x=view.getFloat32(offset+8,true),y=view.getFloat32(offset+12,true),z=view.getFloat32(offset+16,true);
    const k=view.getFloat32(offset+20,true);
    if(first>=end||end>p.count||!(k>0&&k<=1))throw Error('Flower profile no longer matches '+mesh.name);
    for(let j=first;j<end;j++)p.setXYZ(j,x+(p.getX(j)-x)*k,y+(p.getY(j)-y)*k,z+(p.getZ(j)-z)*k);
   }
   p.needsUpdate=true;
   mesh.geometry.computeBoundingBox();
   mesh.geometry.computeBoundingSphere();
   mesh.userData.r9RefinedFlowers=count;
  },
  state:()=>({recorded:index.rows,sectors:Object.keys(index.sectors).length}),
 };
}

