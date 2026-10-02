import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const clean=s=>s.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,'data:image/...;base64,[REMOVED]');

function emit(term,max=30){
  let pos=0,n=0;
  while((pos=src.indexOf(term,pos))>=0&&n<max){
    const start=Math.max(0,pos-5000),end=Math.min(src.length,pos+9000);
    console.log(`\n===== ${term} #${++n} @${pos} =====\n${clean(src.slice(start,end))}`);
    pos+=term.length;
  }
  if(!n)console.log(`\n===== ${term}: NOT FOUND =====`);
}

for(const term of [
  'function gnomeFireCannonball',
  'gnomeFireCannonball',
  'cannonball',
  'Cannonball',
  'shootT',
  'runAttackT'
])emit(term);
