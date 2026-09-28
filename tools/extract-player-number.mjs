import fs from 'node:fs';
import zlib from 'node:zlib';
const src=zlib.gunzipSync(Buffer.concat(Array.from({length:12},(_,i)=>fs.readFileSync('PPA'+String(i+1).padStart(2,'0')+'.bin')))).toString('utf8');
let out='';
for(const needle of ['function drawPlayer','drawPlayerNickname','fillText(','strokeText(']){
  let pos=0,c=0;
  while((pos=src.indexOf(needle,pos))>=0&&c<80){
    const ctx=src.slice(Math.max(0,pos-2200),Math.min(src.length,pos+4200));
    if(needle==='function drawPlayer'||needle==='drawPlayerNickname'||/P\.x|P\.y|animFrame|frame|face|shadow/i.test(ctx)){
      out+='\n===== '+needle+' #'+(++c)+' @ '+pos+' =====\n'+ctx;
    }else c++;
    pos+=needle.length;
  }
}
fs.writeFileSync('diag-player-number.txt',out);
