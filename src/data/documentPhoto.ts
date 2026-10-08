/** Local document geometry only: no OCR, uploads or external image processing. */
export type DocumentPoint = { x:number; y:number };
export type DocumentCorners = [DocumentPoint,DocumentPoint,DocumentPoint,DocumentPoint]; // clockwise TL, TR, BR, BL
const cross=(a:DocumentPoint,b:DocumentPoint,c:DocumentPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const distance=(a:DocumentPoint,b:DocumentPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
export function validDocumentCorners(p:DocumentCorners) {
  return p.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)&&q.x>=0&&q.x<=1&&q.y>=0&&q.y<=1) &&
    p.every((a,i)=>cross(a,p[(i+1)%4],p[(i+2)%4])>.001) &&
    Math.abs(p.reduce((s,a,i)=>s+a.x*p[(i+1)%4].y-a.y*p[(i+1)%4].x,0))/2>.04;
}
function hull(points:DocumentPoint[]) {
  const sorted=points.sort((a,b)=>a.x-b.x||a.y-b.y), lower:DocumentPoint[]=[], upper:DocumentPoint[]=[];
  for(const p of sorted){while(lower.length>=2&&cross(lower.at(-2)!,lower.at(-1)!,p)<=0)lower.pop();lower.push(p);}
  for(const p of [...sorted].reverse()){while(upper.length>=2&&cross(upper.at(-2)!,upper.at(-1)!,p)<=0)upper.pop();upper.push(p);}
  return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
/** Fit straight edges through rounded card corners instead of cutting through them. */
function refineQuad(points:DocumentCorners,mask:Uint8Array,w:number,h:number):DocumentCorners {
  const at=(x:number,y:number)=>{const xx=Math.round(x),yy=Math.round(y);return xx>=0&&yy>=0&&xx<w&&yy<h?mask[yy*w+xx]:0;};
  const lines=points.map((a,i)=>{
    const b=points[(i+1)%4],length=distance(a,b),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,angle=Math.atan2(b.y-a.y,b.x-a.x);
    let best=-Infinity,result={nx:Math.sin(angle),ny:-Math.cos(angle),c:0};
    for(let step=-10;step<=10;step++){
      const theta=angle+step*.016,tx=Math.cos(theta),ty=Math.sin(theta),nx=ty,ny=-tx;
      for(let offset=-Math.ceil(Math.min(w,h)*.045);offset<=Math.min(w,h)*.045;offset++){
        let score=0;
        for(let k=0;k<36;k++){
          const t=(k/35-.5)*length*.76,x=cx+nx*offset+tx*t,y=cy+ny*offset+ty*t;
          score+=at(x-nx*3,y-ny*3)-at(x+nx*3,y+ny*3);
        }
        score-=Math.abs(offset)*.02+Math.abs(step)*.03;
        if(score>best){best=score;result={nx,ny,c:nx*cx+ny*cy+offset};}
      }
    }
    return result;
  });
  return points.map((fallback,i)=>{
    const a=lines[(i+3)%4],b=lines[i],den=a.nx*b.ny-b.nx*a.ny;
    if(Math.abs(den)<.1)return fallback;
    const point={x:(a.c*b.ny-b.c*a.ny)/den,y:(a.nx*b.c-b.nx*a.c)/den};
    return distance(point,fallback)<Math.min(w,h)*.14?point:fallback;
  }) as DocumentCorners;
}
/** Conservative contour detection: uncertainty preserves the original for manual review. */
export function detectDocumentCorners(image:{width:number;height:number;data:Uint8ClampedArray}):DocumentCorners|null {
  const {width:w,height:h,data}=image, gray=new Float32Array(w*h), edges=new Uint8Array(w*h);
  for(let i=0;i<gray.length;i++)gray[i]=data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;
    const gx=-gray[i-w-1]+gray[i-w+1]-2*gray[i-1]+2*gray[i+1]-gray[i+w-1]+gray[i+w+1];
    const gy=-gray[i-w-1]-2*gray[i-w]-gray[i-w+1]+gray[i+w-1]+2*gray[i+w]+gray[i+w+1];
    let strength=Math.hypot(gx,gy);
    // Colour contrast also separates pale IDs from similarly bright wood.
    for(let k=0;k<3;k++){
      const at=(offset:number)=>data[(i+offset)*4+k];
      const cx=-at(-w-1)+at(-w+1)-2*at(-1)+2*at(1)-at(w-1)+at(w+1);
      const cy=-at(-w-1)-2*at(-w)-at(-w+1)+at(w-1)+2*at(w)+at(w+1);
      strength=Math.max(strength,Math.hypot(cx,cy));
    }
    if(strength>85)edges[i]=1;
  }
  const joined=new Uint8Array(w*h);
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++)if(edges[y*w+x])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)joined[(y+dy)*w+x+dx]=1;
  const masks=[joined];
  // Independent pale-region candidates survive textured backgrounds that join edge contours.
  for(const saturation of [.18,.30,.42]){
    const mask=new Uint8Array(w*h);
    for(let i=0;i<mask.length;i++){
      const r=data[i*4],g=data[i*4+1],b=data[i*4+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b);
      if(gray[i]>75 && hi-lo<hi*saturation)mask[i]=1;
    }
    masks.push(mask);
  }
  let best:DocumentCorners|null=null,bestScore=0;
  for(const mask of masks){
  const seen=new Uint8Array(w*h);
  for(let start=0;start<joined.length;start++){
    if(!mask[start]||seen[start])continue;
    const queue=[start], boundary:DocumentPoint[]=[];seen[start]=1;
    for(let n=0;n<queue.length;n++){
      const i=queue[n], x=i%w,y=Math.floor(i/w);
      if(n%2===0 && (x===0||y===0||x===w-1||y===h-1||!mask[i-1]||!mask[i+1]||!mask[i-w]||!mask[i+w]))boundary.push({x,y});
      for(const j of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1])if(j>=0&&mask[j]&&!seen[j]){seen[j]=1;queue.push(j);}
    }
    if(queue.length<w*.5||queue.length>w*h*.93)continue;
    const polygon=hull(boundary);
    while(polygon.length>4){let index=0,min=Infinity;for(let i=0;i<polygon.length;i++){const area=Math.abs(cross(polygon[(i+polygon.length-1)%polygon.length],polygon[i],polygon[(i+1)%polygon.length]));if(area<min){min=area;index=i;}}polygon.splice(index,1);}
    if(polygon.length!==4)continue;
    const first=polygon.reduce((best,p,i)=>p.x+p.y<polygon[best].x+polygon[best].y?i:best,0);
    let p=Array.from({length:4},(_,i)=>polygon[(first+i)%4]) as DocumentCorners;
    if(mask!==joined)p=refineQuad(p,mask,w,h);
    const area=Math.abs(p.reduce((s,a,i)=>s+a.x*p[(i+1)%4].y-a.y*p[(i+1)%4].x,0))/2;
    const coverage=area/(w*h), width=(distance(p[0],p[1])+distance(p[3],p[2]))/2, height=(distance(p[0],p[3])+distance(p[1],p[2]))/2;
    const aspect=Math.max(width,height)/Math.min(width,height);
    if(coverage<.12||coverage>.93||aspect<1.28||aspect>1.95)continue;
    if(p.some(q=>q.x<2||q.x>w-3||q.y<2||q.y>h-3))continue;
    // Each of the four edges must be supported, not just a rectangular area of texture.
    const support=p.map((a,k)=>{const b=p[(k+1)%4];let hits=0;for(let n=2;n<38;n++){const x=Math.round(a.x+(b.x-a.x)*n/40),y=Math.round(a.y+(b.y-a.y)*n/40);let found=false;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h&&edges[(y+dy)*w+x+dx])found=true;if(found)hits++;}return hits/36;});
    if(Math.min(...support)<.65)continue;
    // Prefer the DPI proportions over a larger sheet of paper underneath it.
    const score=coverage*.1+support.reduce((a,b)=>a+b,0)/4-Math.abs(Math.log(aspect/1.586))*3;
    if(score<=bestScore)continue;
    const cx=p.reduce((s,q)=>s+q.x,0)/4,cy=p.reduce((s,q)=>s+q.y,0)/4;
    const expanded=p.map(q=>({x:Math.max(0,Math.min(1,(cx+(q.x-cx)*1.015)/w)),y:Math.max(0,Math.min(1,(cy+(q.y-cy)*1.015)/h))})) as DocumentCorners;
    if(validDocumentCorners(expanded)){best=expanded;bestScore=score;}
  }
  }
  return best;
}
export async function loadDocumentCanvas(src:string) {
  const image=new Image();image.src=src;await image.decode();
  const scale=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('No se pudo preparar la fotografía.');ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
}
export function findDocumentCorners(canvas:HTMLCanvasElement) {
  const scan=document.createElement('canvas'), scale=Math.min(1,560/Math.max(canvas.width,canvas.height));scan.width=Math.round(canvas.width*scale);scan.height=Math.round(canvas.height*scale);
  const ctx=scan.getContext('2d',{willReadFrequently:true});if(!ctx)return null;ctx.drawImage(canvas,0,0,scan.width,scan.height);return detectDocumentCorners(ctx.getImageData(0,0,scan.width,scan.height));
}
export function rectifyDocument(source:HTMLCanvasElement,points:DocumentCorners,rotation=0) {
  if(!validDocumentCorners(points))throw Error('Las cuatro esquinas deben rodear el documento sin cruzarse.');
  const p=points.map(q=>({x:q.x*source.width,y:q.y*source.height})) as DocumentCorners;
  const width=Math.max(1,Math.round(Math.max(distance(p[0],p[1]),distance(p[3],p[2])))),height=Math.max(1,Math.round(Math.max(distance(p[0],p[3]),distance(p[1],p[2]))));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d'), input=source.getContext('2d',{willReadFrequently:true});if(!ctx||!input)throw Error('No se pudo ajustar la fotografía.');
  const src=input.getImageData(0,0,source.width,source.height), out=ctx.createImageData(width,height);
  // Projective mapping from the output rectangle to the four document corners.
  const dx1=p[1].x-p[2].x,dx2=p[3].x-p[2].x,dx3=p[0].x-p[1].x+p[2].x-p[3].x;
  const dy1=p[1].y-p[2].y,dy2=p[3].y-p[2].y,dy3=p[0].y-p[1].y+p[2].y-p[3].y,den=dx1*dy2-dx2*dy1;
  const g=Math.abs(den)>1e-8?(dx3*dy2-dx2*dy3)/den:0,h=Math.abs(den)>1e-8?(dx1*dy3-dx3*dy1)/den:0;
  const a=p[1].x-p[0].x+g*p[1].x,b=p[3].x-p[0].x+h*p[3].x,d=p[1].y-p[0].y+g*p[1].y,e=p[3].y-p[0].y+h*p[3].y;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/Math.max(1,width-1),v=y/Math.max(1,height-1),z=g*u+h*v+1;
    const sx=Math.max(0,Math.min(source.width-1,(a*u+b*v+p[0].x)/z)),sy=Math.max(0,Math.min(source.height-1,(d*u+e*v+p[0].y)/z));
    const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(x0+1,source.width-1),y1=Math.min(y0+1,source.height-1),fx=sx-x0,fy=sy-y0;
    for(let k=0;k<3;k++)out.data[(y*width+x)*4+k]=src.data[(y0*source.width+x0)*4+k]*(1-fx)*(1-fy)+src.data[(y0*source.width+x1)*4+k]*fx*(1-fy)+src.data[(y1*source.width+x0)*4+k]*(1-fx)*fy+src.data[(y1*source.width+x1)*4+k]*fx*fy;
    out.data[(y*width+x)*4+3]=255;
  }
  ctx.putImageData(out,0,0);
  if(!rotation)return canvas.toDataURL('image/jpeg',.94);
  const rotated=document.createElement('canvas');rotated.width=rotation%180?height:width;rotated.height=rotation%180?width:height;
  const rc=rotated.getContext('2d')!;rc.translate(rotated.width/2,rotated.height/2);rc.rotate(rotation*Math.PI/180);rc.drawImage(canvas,-width/2,-height/2);return rotated.toDataURL('image/jpeg',.94);
}
