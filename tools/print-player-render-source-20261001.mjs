import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');

function clean(s){return s.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,'data:image/...;base64,[REMOVED]')}
function out(label,pos,pre=3200,post=7000){
  if(pos<0)return;
  console.log(`\n===== ${label} @ ${pos} =====\n`+clean(src.slice(Math.max(0,pos-pre),Math.min(src.length,pos+post))));
}

for(const term of [
  'playerAnimDef','function playerAnim','drawPlayer','renderPlayer','drawLocalPlayer',
  'cameraZoom','cam.x','cam.y','requestAnimationFrame','cx.drawImage','drawImage(a.img',
  'P.x-cam.x','P.y-cam.y','P.x - cam.x','P.y - cam.y'
]){
  let pos=0,n=0;
  while((pos=src.indexOf(term,pos))>=0&&n<14){
    const frag=src.slice(Math.max(0,pos-2800),Math.min(src.length,pos+6500));
    if(/P\.x|P\.y|cam\.|drawImage|fillText|strokeText|ellipse|playerAnim|cameraZoom|requestAnimationFrame/.test(frag)){
      out(term+' '+(++n),pos,2800,6500);
    }
    pos+=term.length;
  }
}

console.log('\n===== DRAW CANDIDATES NEAR P.x/P.y =====');
const drawRe=/(?:cx|ctx|c)\.drawImage\s*\(/g;
let m,n=0;
while((m=drawRe.exec(src))&&n<80){
  const frag=src.slice(Math.max(0,m.index-3000),Math.min(src.length,m.index+5000));
  if(/P\.x|P\.y|playerAnim|nickname|playerName|cam\.|ellipse|fillText|strokeText/.test(frag)){
    console.log(`\n--- DRAW ${++n} @ ${m.index} ---\n`+clean(frag));
  }
}

console.log('\n===== CAMERA WRITE CANDIDATES =====');
for(const re of [/cam\.x\s*(?:=|\+=|-=)/g,/cam\.y\s*(?:=|\+=|-=)/g,/cam\s*=\s*\{/g]){
  let mm,k=0;
  while((mm=re.exec(src))&&k<40){
    const frag=src.slice(Math.max(0,mm.index-2200),Math.min(src.length,mm.index+4500));
    if(/P\.x|P\.y|scene|clamp|Math\.(?:min|max)|camera|viewport|cv\.|innerWidth|innerHeight/.test(frag)){
      console.log(`\n--- CAM ${++k} @ ${mm.index} ---\n`+clean(frag));
    }
  }
}

console.log('\n===== PLAYER NAME / SHADOW NEAR LOCAL PLAYER =====');
for(const term of ['fillText(P.','strokeText(P.','playerName','nickname','shadow','ellipse(']){
  let pos=0,k=0;
  while((pos=src.indexOf(term,pos))>=0&&k<30){
    const frag=src.slice(Math.max(0,pos-2200),Math.min(src.length,pos+4200));
    if(/P\.x|P\.y|cam\.|drawImage|playerAnim/.test(frag)) console.log(`\n--- ${term} ${++k} @ ${pos} ---\n`+clean(frag));
    pos+=term.length;
  }
}
