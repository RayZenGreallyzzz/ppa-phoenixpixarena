import fs from 'node:fs';
import sharp from 'sharp';

const indexPath='public/index.html';
let html=fs.readFileSync(indexPath,'utf8');

const SHEETS=['PALADIN_IDLE_SRC','PALADIN_RUN_SRC','PALADIN_ATTACK_SRC'];
const CELL=256;
const TARGET_BOTTOM=234;

function components(raw,w,h,x0,y0){
  const seen=new Uint8Array(CELL*CELL);
  const out=[];
  const idx=(x,y)=>y*CELL+x;
  for(let y=0;y<CELL;y++){
    for(let x=0;x<CELL;x++){
      const ii=idx(x,y);
      if(seen[ii])continue;
      const a=raw[((y0+y)*w+(x0+x))*4+3];
      if(a<20)continue;
      const qx=[x],qy=[y]; let q=0;
      seen[ii]=1;
      const pts=[]; let minX=x,minY=y,maxX=x,maxY=y;
      while(q<qx.length){
        const px=qx[q],py=qy[q]; q++;
        pts.push([px,py]);
        if(px<minX)minX=px;if(px>maxX)maxX=px;if(py<minY)minY=py;if(py>maxY)maxY=py;
        for(let ny=py-1;ny<=py+1;ny++){
          for(let nx=px-1;nx<=px+1;nx++){
            if(nx===px&&ny===py)continue;
            if(nx<0||ny<0||nx>=CELL||ny>=CELL)continue;
            const ni=idx(nx,ny);
            if(seen[ni])continue;
            const na=raw[((y0+ny)*w+(x0+nx))*4+3];
            if(na<20)continue;
            seen[ni]=1;qx.push(nx);qy.push(ny);
          }
        }
      }
      if(pts.length>=3)out.push({pts,area:pts.length,minX,minY,maxX,maxY});
    }
  }
  out.sort((a,b)=>b.area-a.area);
  return out;
}

async function cleanSheet(name){
  const re=new RegExp("const "+name+"='data:image\\/png;base64,([^']+)'");
  const m=html.match(re);
  if(!m)throw new Error('Paladin sheet not found: '+name);
  const input=Buffer.from(m[1],'base64');
  const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==1024||info.height!==1024||info.channels!==4)throw new Error(name+' unexpected size '+info.width+'x'+info.height+' c'+info.channels);

  const src=Buffer.from(data);
  let fixed=0;
  for(let row=0;row<4;row++){
    for(let col=0;col<4;col++){
      const x0=col*CELL,y0=row*CELL;
      const comps=components(src,info.width,info.height,x0,y0);
      if(!comps.length)continue;
      const main=comps[0];
      const junk=comps.filter(c=>
        c!==main &&
        c.area<=500 &&
        c.minY>=210 &&
        ((c.minX+c.maxX)/2)>=100 &&
        ((c.minX+c.maxX)/2)<=156 &&
        c.minY>main.maxY+4
      );
      if(!junk.length)continue;

      const dy=TARGET_BOTTOM-(main.maxY+1);
      if(dy<=0||dy>32)continue;

      const junkMask=new Uint8Array(CELL*CELL);
      for(const c of junk)for(const [x,y] of c.pts)junkMask[y*CELL+x]=1;

      const cell=Buffer.alloc(CELL*CELL*4);
      for(let y=0;y<CELL;y++){
        for(let x=0;x<CELL;x++){
          if(junkMask[y*CELL+x])continue;
          const si=((y0+y)*info.width+(x0+x))*4;
          const a=src[si+3];
          if(!a)continue;
          const ny=y+dy;
          if(ny<0||ny>=CELL)continue;
          const di=(ny*CELL+x)*4;
          cell[di]=src[si];cell[di+1]=src[si+1];cell[di+2]=src[si+2];cell[di+3]=src[si+3];
        }
      }

      // clear source cell then write aligned cleaned frame
      for(let y=0;y<CELL;y++){
        const base=((y0+y)*info.width+x0)*4;
        src.fill(0,base,base+CELL*4);
      }
      for(let y=0;y<CELL;y++){
        for(let x=0;x<CELL;x++){
          const si=(y*CELL+x)*4;
          if(!cell[si+3])continue;
          const di=((y0+y)*info.width+(x0+x))*4;
          src[di]=cell[si];src[di+1]=cell[si+1];src[di+2]=cell[si+2];src[di+3]=cell[si+3];
        }
      }
      fixed++;
      console.log('[PPA PALADIN] '+name+' row '+row+' frame '+col+' cleaned + aligned by '+dy+'px');
    }
  }

  const out=await sharp(src,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
  const b64=out.toString('base64');
  html=html.replace(m[0],"const "+name+"='data:image/png;base64,"+b64+"'");
  return fixed;
}

let total=0;
for(const name of SHEETS)total+=await cleanSheet(name);
if(total<2)throw new Error('Paladin frame cleanup expected at least 2 corrupted frames, got '+total);
fs.writeFileSync(indexPath,html,'utf8');
console.log('[PPA POSTBUILD] Paladin frame labels removed and feet anchors normalized: '+total+' frame(s).');
