import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const source=zlib.gunzipSync(Buffer.concat(parts.map(name=>fs.readFileSync(name)))).toString('utf8');
for(const needle of ["function renderStats","renderStats(st","statPoints","statBtn","MAX"]){
  console.log("\n===== "+needle+" =====");
  let from=0,count=0;
  while(count<10){
    const i=source.indexOf(needle,from); if(i<0)break;
    console.log("\n--- MATCH "+(++count)+" @ "+i+" ---\n");
    console.log(source.slice(Math.max(0,i-3500),Math.min(source.length,i+7500)));
    from=i+needle.length;
  }
  if(!count)console.log("NO MATCH");
}
