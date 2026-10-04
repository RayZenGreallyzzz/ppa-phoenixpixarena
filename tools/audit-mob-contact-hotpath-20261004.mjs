import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');

function balancedEnd(text,openAt){
  let depth=0,quote=null,escape=false,line=false,block=false;
  for(let i=openAt;i<text.length;i++){
    const ch=text[i],nx=text[i+1];
    if(line){if(ch==='\n')line=false;continue}
    if(block){if(ch==='*'&&nx==='/'){block=false;i++}continue}
    if(quote){if(escape){escape=false;continue}if(ch==='\\'){escape=true;continue}if(ch===quote)quote=null;continue}
    if(ch==='/'&&nx==='/'){line=true;i++;continue}
    if(ch==='/'&&nx==='*'){block=true;i++;continue}
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return i;
  }
  return text.length-1;
}
function fn(name){
  const sig=`function ${name}(`,start=src.indexOf(sig);
  if(start<0)return `MISSING ${name}\n`;
  const open=src.indexOf('{',start),end=balancedEnd(src,open);
  return `===== ${name} =====\n${src.slice(start,end+1)}\n\n`;
}
function hits(needle,back=1800,ahead=2600,limit=20){
  let out=`===== HITS ${needle} =====\n`,p=0,n=0;
  while((p=src.indexOf(needle,p))>=0&&n<limit){
    out+=`\n--- hit ${++n} @ ${p} ---\n${src.slice(Math.max(0,p-back),Math.min(src.length,p+ahead))}\n`;
    p+=needle.length;
  }
  return out+'\n';
}
let out='SOURCE LENGTH '+src.length+'\n\n';
for(const name of [
  'ppaNearWorldBodies','ppaWorldBodyMetric','ppaWorldBodiesFreeAt','ppaMoveWithWorldBodyCollision',
  'ppaScenePointWalkableForBody','clanBossBodyFreeAt','clanBossMoveWithBodyCollision',
  'worldCrystalBossBodyFreeAt','worldBossMoveWithCrystalCollision'
])out+=fn(name);
out+=hits('ppaMoveWithWorldBodyCollision(');
out+=hits('ppaWorldBodiesFreeAt(');
out+=hits('ppaNearWorldBodies(');
out+=hits('clanBossMoveWithBodyCollision(');
out+=hits('worldBossMoveWithCrystalCollision(');
fs.writeFileSync('mob-contact-hotpath-audit.txt',out,'utf8');
console.log('wrote mob-contact-hotpath-audit.txt',out.length);
