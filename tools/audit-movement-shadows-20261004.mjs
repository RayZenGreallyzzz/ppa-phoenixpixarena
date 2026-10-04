import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const groups={
  movement:[
    'joy','joystick','stick','moveX','moveY','movePlayer','playerMove','canMove','isSolid','blocked','collide','collision','walkable','P.x','P.y'
  ],
  shadows:[
    'shadowBlur','shadowColor','ellipse(','drawMob','drawBoss','mobShadow','bossShadow','drawImage'
  ]
};
let out='SOURCE LENGTH '+src.length+'\n';
for(const [group,terms] of Object.entries(groups)){
  out+='\n\n######## '+group.toUpperCase()+' ########\n';
  for(const term of terms){
    out+='\n===== TERM: '+term+' =====\n';
    let pos=0,count=0;
    while((pos=src.indexOf(term,pos))>=0 && count<45){
      const a=Math.max(0,pos-2400),b=Math.min(src.length,pos+4200);
      out+='\n--- hit '+(++count)+' @ '+pos+' ---\n'+src.slice(a,b)+'\n';
      pos+=term.length;
    }
  }
}
fs.writeFileSync('movement-shadows-audit.txt',out,'utf8');
console.log('wrote movement-shadows-audit.txt',out.length);
