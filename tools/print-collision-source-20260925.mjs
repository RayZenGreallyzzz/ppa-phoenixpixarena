import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
function excerpt(label,pos,pre=2600,post=5000){
  console.log('\n===== '+label+' @ '+pos+' =====');
  console.log(src.slice(Math.max(0,pos-pre), Math.min(src.length,pos+post)));
}
const terms=[
  'function clanSiegeSlide','clanSiegeSlide(','CLAN_SIEGE_CAPTURE','CLAN_SIEGE_CASTLE','clanSiegeInsideCapture','function clanSiegeInsideCapture',
  'function hitWall','function collide','function collision','function blocked','function canMove','function movePlayer','function updatePlayer','tryMove','solidAt','isWall','isBlocked','isSolid','collideRect','wallAt',
  'leaveBtn','ВЫЙТИ В ГОРОД','ВЫЙТИ','можно выйти',
  'drawClanSiegeWorld','clanSiegeUpdate','CLAN_SIEGE'
];
for(const term of terms){
  let pos=0,count=0;
  while((pos=src.indexOf(term,pos))>=0 && count<12){ excerpt(term+' hit '+(++count),pos); pos+=term.length; }
}
const re=/function\s+([A-Za-z0-9_$]*(?:clanSiege|move|Move|wall|Wall|solid|Solid|collid|Collid|block|Block|leave|Leave)[A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/g;
let m, names=[];
while((m=re.exec(src)) && names.length<120){names.push({name:m[1],pos:m.index});}
console.log('\n===== LIKELY FUNCTIONS =====');
for(const n of names) console.log(n.pos+' '+n.name);
for(const n of names.slice(0,50)) excerpt('FUNC '+n.name,n.pos,1000,2200);
// trigger exact clanSiegeSlide 20260925-1427
