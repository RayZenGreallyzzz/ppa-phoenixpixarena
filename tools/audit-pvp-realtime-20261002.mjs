import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const raw=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const src=raw.replace(/data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+/g,'[DATA_IMAGE]');
const built=fs.existsSync('public/index.html')?fs.readFileSync('public/index.html','utf8'):'';

function dump(label,text,terms){
  console.log(`\n===== ${label} =====`);
  for(const term of terms){
    let from=0,count=0;
    while(true){
      const i=text.indexOf(term,from);
      if(i<0)break;
      count++;
      if(count<=6){
        const a=Math.max(0,i-2200),b=Math.min(text.length,i+5200);
        console.log(`\n=== ${term} #${count} @${i} ===\n`+text.slice(a,b).replace(/\n/g,' '));
      }
      from=i+Math.max(1,term.length);
    }
    console.log(`\nCOUNT ${term}: ${count}`);
  }
}

const rawTerms=[
  'queueAttack','presenceState','PPA_ONLINE','remotes',
  'updated_at','saveVersion','saveTs','lastSave','autosave'
];
const builtTerms=[
  'СЕЙВ ЗАЩИЩЕН','старые данные','перезаписали облако','облако',
  'queueAttack','PPA_ONLINE','remotes','save','Save','cloud','Cloud',
  'updated_at','revision','version','timestamp'
];

dump('PACKED SOURCE',src,rawTerms);
dump('FINAL PUBLIC',built,builtTerms);
