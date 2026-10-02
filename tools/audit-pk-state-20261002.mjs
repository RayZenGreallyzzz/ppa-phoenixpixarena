import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const raw=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const terms=['player killer','Player Killer','PK','pk','ПК','pvp','PVP','canAttack','attackPlayer','targetPlayer','peace','Peace','safe zone','Safe Zone','pkEnabled','pkMode','killerMode'];
for(const term of terms){
  let from=0,count=0;
  while(true){
    const i=raw.indexOf(term,from);if(i<0)break;count++;
    if(count<=12){
      const a=Math.max(0,i-260),b=Math.min(raw.length,i+520);
      console.log(`\n=== ${term} #${count} @${i} ===\n`+raw.slice(a,b).replace(/\n/g,' '));
    }
    from=i+term.length;
  }
  console.log(`\nCOUNT ${term}: ${count}`);
}
