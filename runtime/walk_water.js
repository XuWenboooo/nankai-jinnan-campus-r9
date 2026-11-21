export async function loadWalkWater(){
 const r=await fetch('../world/r9_walk_water.json');
 if(!r.ok)throw Error('Wet surface index HTTP '+r.status);
 const data=await r.json();
 const response=await fetch('../'+data.file);
 if(!response.ok)throw Error('Wet surface cells HTTP '+response.status);
 const stream=response.body.pipeThrough(new DecompressionStream('deflate'));
 const bits=new Uint8Array(await new Response(stream).arrayBuffer());
 const [width,height]=data.size,[x0,z0]=data.origin;
 if(bits.length!==Math.ceil(width*height/8))throw Error('Wet surface cell count does not match');
 return {
  resolution:data.cell,
  surfaces:data.surfaces,pavementTieIn:data.pavement_tie_in,
  contains(x,z){
   const col=Math.floor((x-x0)/data.cell),row=Math.floor((z-z0)/data.cell);
   if(col<0||row<0||col>=width||row>=height)return false;
   const i=row*width+col;
   return (bits[i>>>3]&(1<<(i&7)))!==0;
  },
 };
}

