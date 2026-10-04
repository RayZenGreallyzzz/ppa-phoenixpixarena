import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>fs.readFileSync(`PPA${String(i+1).padStart(2,'0')}.bin`));
const src=zlib.gunzipSync(Buffer.concat(parts)).toString('utf8');
const out=[];
function contexts(label,needle,radius=2400,limit=30){
  out.push(`\n===== ${label}: ${needle} =====`);
  let pos=0,n=0;
  while((pos=src.indexOf(needle,pos))>=0&&n<limit){
    const a=Math.max(0,pos-radius),b=Math.min(src.length,pos+needle.length+radius);
    out.push(`\n--- hit ${++n} @ ${pos} ---\n${src.slice(a,b)}`);
    pos+=needle.length;
  }
  out.push(`\nhits=${n}`);
}
for(const [label,needle] of [
 ['joy lowercase','joy'],['Joy upper','Joy'],['stick lowercase','stick'],['pointerdown','pointerdown'],['pointermove','pointermove'],['pointerup','pointerup'],['touchstart','touchstart'],['touchmove','touchmove'],['touchend','touchend'],['movement x','moveX'],['movement y','moveY'],['jx','jx'],['jy','jy'],['bAtk','bAtk'],['canvas','canvas']
]) contexts(label,needle);
fs.writeFileSync('floating-joystick-audit.txt',out.join('\n'),'utf8');
console.log('audit chars',out.join('\n').length);
