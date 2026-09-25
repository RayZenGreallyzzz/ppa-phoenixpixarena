import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const packed=Buffer.concat(parts.map(p=>fs.readFileSync(p)));
const src=zlib.gunzipSync(packed).toString('utf8');
const terms=[
  'function clanSiegeEnsureHud',
  'function clanSiegeHudUpdate',
  'function clanSiegeUpdate',
  'function drawClanSiegeWorld',
  'isClanSiegeCastle',
  'clanSiegeCastle',
  'castleShownAt',
  'captureProgress',
  'collision',
  'collide',
  'solid',
  'block',
  'blocked',
  'isSolid',
  'canMove',
  'walk',
  'rects',
  'OBST',
  'WALL',
  'MAP'
];
let out='SOURCE LENGTH '+src.length+'\n';
for(const term of terms){
  out+='\n\n===== TERM: '+term+' =====\n';
  let pos=0,count=0;
  while((pos=src.indexOf(term,pos))>=0 && count<35){
    const a=Math.max(0,pos-3500),b=Math.min(src.length,pos+5500);
    out+='\n--- hit '+(++count)+' @ '+pos+' ---\n'+src.slice(a,b)+'\n';
    pos+=term.length;
  }
}
fs.writeFileSync('diag-clan-siege-collision.txt', out, 'utf8');
console.log('wrote diag-clan-siege-collision.txt', out.length);
