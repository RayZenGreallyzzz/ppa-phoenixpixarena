import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const source=zlib.gunzipSync(Buffer.concat(parts.map(name=>fs.readFileSync(name)))).toString('utf8');
const patterns=['for(const e of EN)','for (const e of EN)','for(let i=0;i<EN.length;i++)','for(let i=EN.length-1;i>=0;i--)'];
for(const pat of patterns){
  console.log('\n===== FILTER '+pat+' =====');
  let from=0,count=0,shown=0;
  while(count<200){
    const i=source.indexOf(pat,from); if(i<0)break;
    count++;
    const chunk=source.slice(Math.max(0,i-1200),Math.min(source.length,i+9000));
    if(/aggro|atkCD|LEASH_R|dungeonAggroRadiusFor|server.*mob|PPA_SERVER_MOBS_ACTIVE/i.test(chunk)){
      console.log('\n--- MATCH '+count+' @ '+i+' ---\n');
      console.log(chunk);
      shown++;
    }
    from=i+pat.length;
  }
  console.log('TOTAL '+count+' SHOWN '+shown);
}