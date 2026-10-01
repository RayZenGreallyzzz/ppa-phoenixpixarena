import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const clean=s=>s.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,'data:image/...;base64,[REMOVED]').replace(/\s+/g,' ');
const snip=(p,pre=700,post=1300)=>clean(src.slice(Math.max(0,p-pre),Math.min(src.length,p+post)));
const positions=(term,max=8)=>{let a=[],p=0;while((p=src.indexOf(term,p))>=0&&a.length<max){a.push(p);p+=term.length;}return a;};
const rpositions=(re,max=20)=>{let a=[],m;while((m=re.exec(src))&&a.length<max)a.push(m.index);return a;};

console.log('SOURCE_LEN',src.length);

for(const term of ['playerAnimDef','cameraZoom']){
  const ps=positions(term,6); console.log(`\n## ${term} POS`,ps.join(','));
  ps.slice(0,3).forEach((p,i)=>console.log(`### ${term} ${i+1}\n${snip(p)}`));
}

function scored(label,re){
  const ps=rpositions(re,200);
  const arr=ps.map(p=>{
    const f=src.slice(Math.max(0,p-2200),Math.min(src.length,p+2800));
    let s=0;
    if(/P\.x/.test(f))s+=4;if(/P\.y/.test(f))s+=4;if(/cam\.x/.test(f))s+=3;if(/cam\.y/.test(f))s+=3;
    if(/playerAnimDef/.test(f))s+=5;if(/fillText|strokeText/.test(f))s+=2;if(/ellipse/.test(f))s+=2;
    if(/remote|mob|boss/i.test(f))s-=1;
    return {p,s};
  }).sort((a,b)=>b.s-a.s||a.p-b.p).slice(0,4);
  console.log(`\n## ${label}`,arr.map(x=>`${x.p}:${x.s}`).join(','));
  arr.forEach((x,i)=>console.log(`### ${label} ${i+1} @${x.p} score=${x.s}\n${snip(x.p,900,1800)}`));
}

scored('DRAWIMAGE',/(?:cx|ctx|c)\.drawImage\s*\(/g);
scored('ELLIPSE',/(?:cx|ctx|c)\.ellipse\s*\(/g);
scored('TEXT',/(?:cx|ctx|c)\.(?:fillText|strokeText)\s*\(/g);

for(const [label,re] of [['CAMX',/cam\.x\s*(?:=|\+=|-=)/g],['CAMY',/cam\.y\s*(?:=|\+=|-=)/g]]){
  const ps=rpositions(re,100).map(p=>({p,f:src.slice(Math.max(0,p-1800),Math.min(src.length,p+2400))})).filter(x=>/P\.x|P\.y/.test(x.f)).slice(0,4);
  console.log(`\n## ${label}`,ps.map(x=>x.p).join(','));
  ps.forEach((x,i)=>console.log(`### ${label} ${i+1}\n${snip(x.p,900,1600)}`));
}

// Strongest window around a playerAnimDef call that also contains local P/camera/rendering.
let best=null;
for(const p of positions('playerAnimDef',30)){
  const a=Math.max(0,p-5000),b=Math.min(src.length,p+7000),f=src.slice(a,b);
  let s=(/P\.x/.test(f)?5:0)+(/P\.y/.test(f)?5:0)+(/cam\.x/.test(f)?4:0)+(/cam\.y/.test(f)?4:0)+(/drawImage/.test(f)?5:0)+(/fillText|strokeText/.test(f)?3:0)+(/ellipse/.test(f)?2:0);
  if(!best||s>best.s)best={p,s,a,b};
}
if(best){console.log(`\n## BEST_PLAYER_WINDOW @${best.p} score=${best.s}\n${clean(src.slice(Math.max(0,best.p-1800),Math.min(src.length,best.p+4200)))}`)}
