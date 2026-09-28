import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const packed=Buffer.concat(parts.map(p=>fs.readFileSync(p)));
const src=zlib.gunzipSync(packed).toString('utf8');

const needles=[
  'Маленьк','маленьк','зель','Зель','potion','Potion',
  'grimoires','grimoire','SKILLS','skills','activeSkills','skillDefs',
  'makeGear','pushGear','genGear','rollGear','gearFor','GEAR',
  'common','rarity'
];

let out='';
for(const n of needles){
  out+='\n\n===== '+n+' =====\n';
  let pos=0,count=0;
  while((pos=src.indexOf(n,pos))>=0 && count<40){
    out+=src.slice(Math.max(0,pos-900),Math.min(src.length,pos+2200))+'\n---\n';
    pos+=n.length;count++;
  }
}
fs.writeFileSync('diag-newbie-kit-source.txt',out);
console.log('wrote',out.length);
