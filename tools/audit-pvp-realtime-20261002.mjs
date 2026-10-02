import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const raw=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const src=raw.replace(/data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+/g,'[DATA_IMAGE]');
const terms=[
  'СЕЙВ ЗАЩИЩЕН',
  'старые данные НЕ перезаписали облако',
  'O_REMOTES',
  'queueAttack',
  'presenceState',
  'updated_at',
  'saveVersion',
  'saveTs',
  'lastSave',
  'autosave'
];
for(const term of terms){
  let from=0,count=0;
  while(true){
    const i=src.indexOf(term,from);
    if(i<0)break;
    count++;
    if(count<=8){
      const a=Math.max(0,i-1800),b=Math.min(src.length,i+4200);
      console.log(`\n=== ${term} #${count} @${i} ===\n`+src.slice(a,b).replace(/\n/g,' '));
    }
    from=i+term.length;
  }
  console.log(`\nCOUNT ${term}: ${count}`);
}
