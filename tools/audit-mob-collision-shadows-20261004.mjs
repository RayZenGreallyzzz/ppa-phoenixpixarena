import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const needles=[
  'function ppaMoveWithWorldBodyCollision',
  'function clanBossMoveWithBodyCollision',
  'function worldBossSlide',
  'mobCollision',
  'bodyCollision',
  'for(const m of mobs',
  'for(let m of mobs',
  'ellipse(',
  'drawMob',
  'drawBoss',
  "fillStyle='rgba(0,0,0",
  'shadowBlur'
];
let out='SOURCE LENGTH '+src.length+'\n';
for(const needle of needles){
  out+='\n\n===== '+needle+' =====\n';
  let pos=0,count=0;
  while((pos=src.indexOf(needle,pos))>=0&&count<60){
    const a=Math.max(0,pos-3200),b=Math.min(src.length,pos+7000);
    out+='\n--- hit '+(++count)+' @ '+pos+' ---\n'+src.slice(a,b)+'\n';
    pos+=needle.length;
  }
}
fs.writeFileSync('mob-collision-shadows-audit.txt',out,'utf8');
console.log('wrote mob-collision-shadows-audit.txt',out.length);
