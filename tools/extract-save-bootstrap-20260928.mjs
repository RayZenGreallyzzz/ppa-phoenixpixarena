import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>'PPA'+String(i+1).padStart(2,'0')+'.bin');
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const needles=['ppaBuildSaveObject','PPA_CLOUD','ppaLoadSave','ppaRegisterCharacter','applySave','loadGame','INV=','const INV','let INV'];
let out='';
for(const n of needles){
  let at=src.indexOf(n);
  out+='\n\n===== '+n+' @ '+at+' =====\n';
  if(at>=0)out+=src.slice(Math.max(0,at-5000),Math.min(src.length,at+9000));
}
fs.writeFileSync('diag-save-bootstrap.txt',out);
