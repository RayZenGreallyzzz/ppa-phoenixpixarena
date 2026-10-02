import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const raw=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const src=raw.replace(/data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+/g,'[DATA_IMAGE]');
const terms=['player killer','Player Killer','PK','pk','ПК','targetIsValid','P.tid','bAtk','pvp1','P.scene===\'pvp1\'','P.scene===\"pvp1\"','onlinePlayers','remotePlayers','isPlayer','playerTarget','attackPlayer','damagePlayer','hitPlayer','autoAttack','findTarget','pickTarget','nearestTarget'];
for(const term of terms){
  let from=0,count=0;
  while(true){
    const i=src.indexOf(term,from);if(i<0)break;count++;
    if(count<=20){
      const a=Math.max(0,i-420),b=Math.min(src.length,i+900);
      console.log(`\n=== ${term} #${count} @${i} ===\n`+src.slice(a,b).replace(/\n/g,' '));
    }
    from=i+term.length;
  }
  console.log(`\nCOUNT ${term}: ${count}`);
}
