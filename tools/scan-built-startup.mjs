import fs from 'node:fs';
const p='public/index.html';
const s=fs.readFileSync(p,'utf8');
const regs=[
  /rayzen/ig,
  /любов/ig,
  /build.{0,40}256/ig,
  /256.{0,40}build/ig,
  /build/ig,
  /version/ig,
  /верси/ig
];
let out='';
for(const re of regs){
  re.lastIndex=0;
  let m,c=0;
  while((m=re.exec(s))&&c<80){
    out+='\n===== '+re+' #'+(++c)+' @ '+m.index+' =====\n'+s.slice(Math.max(0,m.index-1200),Math.min(s.length,m.index+2400));
    if(m[0].length===0)re.lastIndex++;
  }
}
fs.writeFileSync('diag-built-startup.txt',out);
