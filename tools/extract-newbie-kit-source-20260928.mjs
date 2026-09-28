import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const needles=['function ppaBuildSaveObject','ppaBuildSaveObject=','function saveGame','function loadGame','INV:{','inv:INV','bag:INV.bag'];
const out={};
for(const n of needles){
  const p=src.indexOf(n);
  out[n]=p>=0?src.slice(Math.max(0,p-700),Math.min(src.length,p+8000)):'';
}
fs.writeFileSync('diag-newbie-kit-source-small.txt',JSON.stringify(out,null,2));
console.log('wrote');

