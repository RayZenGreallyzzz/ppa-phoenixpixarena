import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const source=zlib.gunzipSync(Buffer.concat(parts.map(name=>fs.readFileSync(name)))).toString('utf8');
const needles=[
  'ROOM safe','VISIBLE','PLAYERS','NET ↓/s','LOCAL STRESS',
  'function drawMini','function renderMini','minimap','miniMap','MINIMAP',
  'function updateMobs','function updateMob','mobs.forEach','mobs.filter',
  'requestAnimationFrame','function tick','function gameLoop','function update(',
  'for(const m of mobs','for(let i=0;i<mobs.length','for(var i=0;i<mobs.length'
];
for(const needle of needles){
  console.log('\n===== '+needle+' =====');
  let from=0,count=0;
  while(count<10){
    const i=source.indexOf(needle,from); if(i<0)break;
    console.log('\n--- MATCH '+(++count)+' @ '+i+' ---\n');
    console.log(source.slice(Math.max(0,i-5000),Math.min(source.length,i+12000)));
    from=i+needle.length;
  }
  if(!count)console.log('NO MATCH');
}