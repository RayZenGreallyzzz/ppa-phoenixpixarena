import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const packed=Buffer.concat(parts.map((name)=>fs.readFileSync(name)));
const source=zlib.gunzipSync(packed).toString('utf8');

const needles=[
  'function recomputeStats',
  'recomputeStats(opts',
  'STAT_POINT_GAIN.dodge',
  'P.statAlloc.dodge',
  'Math.min(60',
  'dodge=Math.min',
  "case 'dodge'",
  "statPointState"
];

for(const needle of needles){
  console.log('\n===== '+needle+' =====');
  let from=0,count=0;
  while(count<12){
    const i=source.indexOf(needle,from);
    if(i<0)break;
    console.log('\n--- MATCH '+(++count)+' @ '+i+' ---\n');
    console.log(source.slice(Math.max(0,i-5000),Math.min(source.length,i+9000)));
    from=i+needle.length;
  }
  if(!count)console.log('NO MATCH');
}
