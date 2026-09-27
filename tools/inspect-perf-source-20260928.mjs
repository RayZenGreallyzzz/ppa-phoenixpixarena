import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const source=zlib.gunzipSync(Buffer.concat(parts.map(name=>fs.readFileSync(name)))).toString('utf8');
const needles=['function mob','function enemy','function ai','function tickAI','function updateAI','const AGGRO_R=110','LEASH_R=260','atkCD--','e.atkCD','e.aggro'];
for(const needle of needles){
 console.log('\n===== '+needle+' =====');
 let from=0,count=0;
 while(count<20){
  const i=source.indexOf(needle,from); if(i<0)break;
  console.log('\n--- MATCH '+(++count)+' @ '+i+' ---\n');
  console.log(source.slice(Math.max(0,i-2600),Math.min(source.length,i+8500)));
  from=i+needle.length;
 }
 if(!count)console.log('NO MATCH');
}