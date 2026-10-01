import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const clean=s=>s.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,'data:image/...;base64,[REMOVED]');
const clip=(p,pre=1400,post=2600)=>clean(src.slice(Math.max(0,p-pre),Math.min(src.length,p+post)));

function emitTerm(term,max=5){
  let p=0,n=0;
  while((p=src.indexOf(term,p))>=0&&n<max){
    const f=src.slice(Math.max(0,p-2200),Math.min(src.length,p+4200));
    if(/P\.x|P\.y|cam\.|drawImage|fillText|strokeText|ellipse|cameraZoom|playerAnim/.test(f)){
      console.log(`\n### TERM ${term} #${++n} POS ${p}\n${clip(p)}`);
    }
    p+=term.length;
  }
}

['playerAnimDef','cameraZoom','P.x-cam.x','P.y-cam.y','P.x - cam.x','P.y - cam.y','cx.drawImage','cx.ellipse','cx.fillText','cx.strokeText'].forEach(t=>emitTerm(t,5));

function emitRegex(label,re,max=6){
  let m,n=0;
  while((m=re.exec(src))&&n<max){
    const f=src.slice(Math.max(0,m.index-2200),Math.min(src.length,m.index+4200));
    if(/P\.x|P\.y/.test(f)&&/cam\.|cameraZoom/.test(f)) console.log(`\n### ${label} #${++n} POS ${m.index}\n${clip(m.index)}`);
  }
}
emitRegex('CAMX WRITE',/cam\.x\s*(?:=|\+=|-=)/g,8);
emitRegex('CAMY WRITE',/cam\.y\s*(?:=|\+=|-=)/g,8);
emitRegex('DRAWIMAGE NEAR PLAYER',/(?:cx|ctx|c)\.drawImage\s*\(/g,12);
emitRegex('ELLIPSE NEAR PLAYER',/(?:cx|ctx|c)\.ellipse\s*\(/g,8);
emitRegex('TEXT NEAR PLAYER',/(?:cx|ctx|c)\.(?:fillText|strokeText)\s*\(/g,12);

// Also print the smallest enclosing function-like regions around the strongest anchors.
for(const term of ['playerAnimDef','P.x-cam.x','P.x - cam.x']){
  const p=src.indexOf(term); if(p<0) continue;
  let a=Math.max(0,src.lastIndexOf('function ',p));
  let b=src.indexOf('\nfunction ',p+term.length); if(b<0||b-a>16000)b=Math.min(src.length,p+8000);
  console.log(`\n### FUNCTION WINDOW ${term} POS ${p}\n${clean(src.slice(a,b))}`);
}
