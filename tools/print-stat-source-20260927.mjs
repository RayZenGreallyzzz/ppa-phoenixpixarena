import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const packed=Buffer.concat(parts.map((name)=>fs.readFileSync(name)));
const source=zlib.gunzipSync(packed).toString('utf8');

const needles=[
  'максимум 100',
  'Уворот',
  'Очки характеристик',
  'СБРОС ХАРАКТЕРИСТИК',
  'РАСПРЕДЕЛЕНИЕ ХАРАКТЕРИСТИК',
  'allocatedStatPointCount',
  'minimumEarnedStatPool',
  'statPts',
  'dodge'
];

for(const needle of needles){
  console.log('\n===== '+needle+' =====');
  let from=0,count=0;
  while(count<8){
    const i=source.indexOf(needle,from);
    if(i<0)break;
    console.log('\n--- MATCH '+(++count)+' @ '+i+' ---\n');
    console.log(source.slice(Math.max(0,i-2500),Math.min(source.length,i+4500)));
    from=i+needle.length;
  }
  if(!count)console.log('NO MATCH');
}
