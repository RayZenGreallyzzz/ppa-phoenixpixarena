import fs from 'node:fs';
import zlib from 'node:zlib';
const src=zlib.gunzipSync(Buffer.concat(Array.from({length:12},(_,i)=>fs.readFileSync('PPA'+String(i+1).padStart(2,'0')+'.bin')))).toString('utf8');
const needles=['playerName','PPA_PLAYER_NAME',"fillText('","fillText(","strokeText(","function renderPlayer","drawPlayer","P.cls"];
let rows=[];
for(const n of needles){
  let pos=0,c=0;
  while((pos=src.indexOf(n,pos))>=0&&c<80){
    const a=Math.max(0,pos-1800),b=Math.min(src.length,pos+2600);
    const ctx=src.slice(a,b);
    if(n==='playerName'||n==='PPA_PLAYER_NAME'){
      if(/fillText|strokeText|render|draw|sprite|ctx\.|cx\./i.test(ctx))rows.push('\n===== '+n+' @ '+pos+' =====\n'+ctx);
    }else if(/playerName|PPA_PLAYER_NAME|P\.x-cam|P\.y-cam|P\.cls|PLAYER_/i.test(ctx)){
      rows.push('\n===== '+n+' @ '+pos+' =====\n'+ctx);
    }
    pos+=n.length;c++;
  }
}
fs.writeFileSync('diag-player-name-render.txt',rows.join('\n'));
