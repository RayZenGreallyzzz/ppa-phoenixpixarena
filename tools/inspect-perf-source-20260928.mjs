import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const source=zlib.gunzipSync(Buffer.concat(parts.map(name=>fs.readFileSync(name)))).toString('utf8');
const needles=[
  'Math.hypot(e.x-P.x',
  'Math.hypot(P.x-e.x',
  'e.x-P.x',
  'P.x-e.x',
  '600)return',
  '>600',
  '<600',
  'sleep beyond',
  'distance sleep',
  'function ai',
  'function enemy',
  'EN.length-1;i>=0',
  'EN.length;i++'
];
for(const needle of needles){
  console.log('\n===== '+needle+' =====');
  let from=0,count=0;
  while(count<20){
    const i=source.indexOf(needle,from); if(i<0)break;
    console.log('\n--- MATCH '+(++count)+' @ '+i+' ---\n');
    console.log(source.slice(Math.max(0,i-2400),Math.min(source.length,i+5600)));
    from=i+needle.length;
  }
  if(!count)console.log('NO MATCH');
}