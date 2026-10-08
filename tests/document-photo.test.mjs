import test from 'node:test';
import assert from 'node:assert/strict';
import {detectDocumentCorners,validDocumentCorners} from '../src/data/documentPhoto.ts';
function scene({pattern=false,paper=false,blank=false}={}){
 const width=480,height=360,data=new Uint8ClampedArray(width*height*4);
 // A skewed card photographed on cloth; optional larger sheet beneath it.
 const corners=[{x:105,y:102},{x:379,y:73},{x:359,y:255},{x:89,y:273}];
 const inside=(x,y)=>corners.every((p,i)=>{const q=corners[(i+1)%4];return(q.x-p.x)*(y-p.y)-(q.y-p.y)*(x-p.x)>=0});
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let c=blank?180:pattern?70+Math.round(12*Math.sin(x/7)*Math.cos(y/9)):65;
  if(paper&&x>24&&x<453&&y>20&&y<329)c=245;
  if(!blank&&inside(x,y))c=180+Math.round(8*Math.sin(x/5));
  const n=(y*width+x)*4;data[n]=c;data[n+1]=c;data[n+2]=Math.min(255,c+8);data[n+3]=255;
 }
 return{width,height,data};
}
for(const options of [{},{pattern:true},{paper:true}])test('Document contour preserves a skewed card '+JSON.stringify(options),()=>{
 const p=detectDocumentCorners(scene(options));assert.ok(p,'Card not detected');
 assert.ok(p[0].x>.16&&p[0].x<.25,'Selected the background instead of the card');
 assert.ok(p[0].y>.23&&p[0].y<.32);assert.ok(p[2].x>.7&&p[2].x<.8);assert.ok(validDocumentCorners(p));
});
test('Ambiguous image leaves original for review',()=>assert.equal(detectDocumentCorners(scene({blank:true})),null));
test('Invalid or crossed document corners cannot be saved',()=>{
 assert.equal(validDocumentCorners([{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]),false);
 assert.equal(validDocumentCorners([{x:0,y:0},{x:NaN,y:0},{x:1,y:1},{x:0,y:1}]),false);
});
