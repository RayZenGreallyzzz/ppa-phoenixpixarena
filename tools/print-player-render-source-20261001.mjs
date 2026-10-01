import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const clean=s=>s.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,'data:image/...;base64,[REMOVED]');
function emit(label,pos,pre=1200,post=5200){
  if(pos<0){console.log(`\n===== ${label}: NOT FOUND =====`);return;}
  console.log(`\n===== ${label} @${pos} =====\n`+clean(src.slice(Math.max(0,pos-pre),Math.min(src.length,pos+post))));
}
function firstRegex(label,re,pre=1200,post=5200){const m=re.exec(src);emit(label,m?m.index:-1,pre,post)}

firstRegex('DRAW PLAYER FUNCTION',/function\s+drawPlayer\s*\([^)]*\)\s*\{/);
firstRegex('DRAW PLAYER NICKNAME FUNCTION',/function\s+drawPlayerNickname\s*\([^)]*\)\s*\{/);
firstRegex('PLAYER ANIM DEF FUNCTION',/function\s+playerAnimDef\s*\([^)]*\)\s*\{/);
firstRegex('CAM DECL',/(?:const|let|var)\s+cam\s*=\s*\{/);

let n=0;
for(const re of [/cam\.x\s*=\s*[^;]+;/g,/cam\.y\s*=\s*[^;]+;/g,/cam\.x\s*\+=/g,/cam\.y\s*\+=/g]){
 let m;while((m=re.exec(src))&&n<20){const f=src.slice(Math.max(0,m.index-900),Math.min(src.length,m.index+2200));if(/P\.x|P\.y|SCENES|cameraZoom|cv\.width|cv\.height|clamp|Math\.(?:min|max)/.test(f))emit('CAM WRITE '+(++n),m.index,900,2200);}
}

for(const term of ['const px=P.x-cam.x','const py=P.y-cam.y','P.x-cam.x','P.y-cam.y','P.x - cam.x','P.y - cam.y']){
 let p=src.indexOf(term); if(p>=0)emit('WORLD TO SCREEN '+term,p,1800,3500);
}

// Main world render region around the canonical drawPlayer call.
let p=src.indexOf('drawPlayer();');
if(p>=0)emit('MAIN WORLD PASS',p,6000,3500);
