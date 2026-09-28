import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>'PPA'+String(i+1).padStart(2,'0')+'.bin');
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const needles=['ppaRegisterCharacter','classSelectFrame','classSelect','createCharacter','beginGame()','applyClass({name','PPA_PLAYER_NAME'];
let out='';
for(const n of needles){
  let pos=0,c=0;
  while((pos=src.indexOf(n,pos))>=0&&c<20){
    out+='\n\n===== '+n+' #'+(c+1)+' @ '+pos+' =====\n';
    out+=src.slice(Math.max(0,pos-3500),Math.min(src.length,pos+6500));
    pos+=n.length;c++;
  }
}
fs.writeFileSync('diag-character-create.txt',out);
