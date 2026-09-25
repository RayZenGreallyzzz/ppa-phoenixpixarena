import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const packed=Buffer.concat(parts.map(p=>fs.readFileSync(p)));
const src=zlib.gunzipSync(packed).toString('utf8');
const terms=['КРИСТАЛЛЫ','ЗАХВАТ ЗАМКА','PPA_CLAN_SIEGE_HANDLER','castleCaptured','clansiege'];
let out='';
for(const term of terms){
  out+='\n\n===== TERM: '+term+' =====\n';
  let pos=0,count=0;
  while((pos=src.indexOf(term,pos))>=0 && count<30){
    const a=Math.max(0,pos-5000),b=Math.min(src.length,pos+7000);
    out+='\n--- hit '+(++count)+' @ '+pos+' ---\n'+src.slice(a,b)+'\n';
    pos+=term.length;
  }
}
fs.writeFileSync('siege-context.txt',out,'utf8');
console.log('wrote',out.length,'chars');
