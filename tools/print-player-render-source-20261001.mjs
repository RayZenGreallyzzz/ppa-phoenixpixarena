import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const clean=s=>s.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,'data:image/...;base64,[REMOVED]');
function emit(label,pos,pre=1800,post=6000){
  if(pos<0)return;
  console.log(`\n===== ${label} @${pos} =====\n`+clean(src.slice(Math.max(0,pos-pre),Math.min(src.length,pos+post))));
}
function scanTerm(term,max=20){let pos=0,n=0;while((pos=src.indexOf(term,pos))>=0&&n<max){const frag=src.slice(Math.max(0,pos-3000),Math.min(src.length,pos+7000));if(/Image|\.src|sprite|Sprite|playerAnim|drawPlayer|archer|gnome|assassin|paladin|priest|mage|tank|berserker|barbarian/i.test(frag))emit(term+' '+(++n),pos);pos+=term.length;}}

for(const term of [
  'function playerAnimDef','function drawPlayer','playerUsesArcherSprites','playerUsesGnomeSprites',
  'new Image','new Image()','.src=','data:image/','archer','Archer','sprite','Sprite'
])scanTerm(term,30);

console.log('\n===== IMAGE INITIALIZERS NEAR PLAYER TERMS =====');
let m,n=0;const re=/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Image\s*\(\s*\)/g;
while((m=re.exec(src))&&n<120){const start=Math.max(0,m.index-1000),end=Math.min(src.length,m.index+5000),frag=src.slice(start,end);if(/player|archer|gnome|assassin|paladin|priest|mage|tank|berserk|barbar|idle|run|attack|sprite/i.test(frag)){console.log(`\n--- IMAGE ${++n} ${m[1]} @${m.index} ---\n`+clean(frag));}}

console.log('\n===== DATA URI ASSIGNMENTS WITH PLAYER CONTEXT =====');
const dr=/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\.src\s*=\s*([`'\"])(data:image\/[a-zA-Z0-9.+-]+;base64,)/g;
n=0;while((m=dr.exec(src))&&n<120){const frag=src.slice(Math.max(0,m.index-1800),Math.min(src.length,m.index+2600));if(/player|archer|gnome|assassin|paladin|priest|mage|tank|berserk|barbar|idle|run|attack|sprite/i.test(frag))console.log(`\n--- SRC ${++n} ${m[1]} @${m.index} ---\n`+clean(frag));}
