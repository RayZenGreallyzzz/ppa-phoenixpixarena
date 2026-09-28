import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>'PPA'+String(i+1).padStart(2,'0')+'.bin');
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');

function decode(s){
  return String(s)
    .replace(/&quot;/g,'"').replace(/&#x27;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&amp;/g,'&');
}
const m=src.match(/<iframe id="classSelectFrame"[\s\S]*?srcdoc="([\s\S]*?)"><\/iframe>/);
if(!m)throw new Error('classSelectFrame srcdoc not found');
const html=decode(m[1]);
const needles=['choose.onclick','choose.addEventListener','getElementById(\'choose\')','getElementById("choose")','classChosen','nickInput','ppaRegisterCharacter'];
let out='';
for(const n of needles){
  let pos=0,c=0;
  while((pos=html.indexOf(n,pos))>=0&&c<12){
    out+='\n===== '+n+' #'+(c+1)+' @ '+pos+' =====\n';
    out+=html.slice(Math.max(0,pos-1800),Math.min(html.length,pos+4200));
    pos+=n.length;c++;
  }
}
fs.writeFileSync('diag-class-select-flow.txt',out);
