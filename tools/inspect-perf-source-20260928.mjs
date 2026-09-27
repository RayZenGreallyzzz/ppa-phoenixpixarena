import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const source=zlib.gunzipSync(Buffer.concat(parts.map(name=>fs.readFileSync(name)))).toString('utf8');
const needles=[
  'for(const e of EN)',
  'for (const e of EN)',
  'for(let i=EN.length-1',
  'for(let i=0;i<EN.length',
  'EN.forEach',
  'function drawEnemies',
  'function drawEnemy',
  'function updateEnemies',
  'function updateEnemy',
  'e.x+=',
  'e.x +=',
  'e.y+=',
  'e.y +=',
  'e.ai',
  'aggro',
  'chase'
];
for(const needle of needles){
  console.log('\n===== '+needle+' =====');
  let from=0,count=0;
  while(count<16){
    const i=source.indexOf(needle,from); if(i<0)break;
    console.log('\n--- MATCH '+(++count)+' @ '+i+' ---\n');
    console.log(source.slice(Math.max(0,i-3200),Math.min(source.length,i+7000)));
    from=i+needle.length;
  }
  if(!count)console.log('NO MATCH');
}