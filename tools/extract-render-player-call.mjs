import fs from 'node:fs';
import zlib from 'node:zlib';
const src=zlib.gunzipSync(Buffer.concat(Array.from({length:12},(_,i)=>fs.readFileSync('PPA'+String(i+1).padStart(2,'0')+'.bin')))).toString('utf8');
let out='';
for(const n of ['drawPlayer();','drawPlayer(','function render(){','function render() {']){
  let pos=0,c=0;
  while((pos=src.indexOf(n,pos))>=0&&c<30){
    out+='\n===== '+n+' #'+(c+1)+' @ '+pos+' =====\n'+src.slice(Math.max(0,pos-2400),Math.min(src.length,pos+4500));
    pos+=n.length;c++;
  }
}
fs.writeFileSync('diag-render-player-call.txt',out);
