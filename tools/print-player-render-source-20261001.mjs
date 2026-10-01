import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const clean=s=>s.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,'data:image/...;base64,[REMOVED]');
for(const term of ['drawPlayer();','function drawPlayerTag','function drawPlayerName','function drawName','P.name','P.nickname']){
 let p=0,n=0;
 while((p=src.indexOf(term,p))>=0&&n<6){
   const f=src.slice(Math.max(0,p-3500),Math.min(src.length,p+4500));
   if(term==='drawPlayer();'||/P\.x|P\.y|cam\.x|cam\.y|fillText|strokeText/.test(f)){
     console.log(`\n===== ${term} #${++n} @${p} =====\n`+clean(f));
   }
   p+=term.length;
 }
}
