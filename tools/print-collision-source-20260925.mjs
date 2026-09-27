import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');

function out(label,pos,pre=5000,post=12000){
  console.log('\n===== '+label+' @ '+pos+' =====');
  console.log(src.slice(Math.max(0,pos-pre),Math.min(src.length,pos+post)));
}

const anchors=[
  'const _smartMove=updateSmartAttackInput();',
  'const _moveX=_smartMove',
  'const _moveY=_smartMove',
  'updateSmartAttackInput()'
];
for(const a of anchors){
  const p=src.indexOf(a);
  if(p>=0)out(a,p);
}

console.log('\n===== JX/JY CONTEXTS =====');
for(const term of ['jX','jY']){
  let pos=0,n=0;
  while((pos=src.indexOf(term,pos))>=0&&n<12){
    const lo=Math.max(0,pos-1200),hi=Math.min(src.length,pos+2600);
    const frag=src.slice(lo,hi);
    if(/P\.x|P\.y|speed|spd|move|collid|wall|block|cam/i.test(frag)){
      console.log('\n--- '+term+' '+(++n)+' @ '+pos+' ---\n'+frag);
    }
    pos+=term.length;
  }
}

console.log('\n===== PLAYER POSITION WRITE CONTEXTS =====');
const posRe=/P\.(?:x|y)\s*(?:\+=|-=|=)/g;
let m,n=0;
while((m=posRe.exec(src))&&n<40){
  const lo=Math.max(0,m.index-1000),hi=Math.min(src.length,m.index+2200);
  const frag=src.slice(lo,hi);
  if(/jX|jY|_moveX|_moveY|speed|spd|move|collid|wall|block|cam|delta|\bdt\b/i.test(frag)){
    console.log('\n--- POSWRITE '+(++n)+' @ '+m.index+' ---\n'+frag);
  }
}

console.log('\n===== LOOP / FRAME CANDIDATES =====');
for(const term of ['requestAnimationFrame','performance.now()','deltaTime','function loop','function update']){
  let pos=0,n=0;
  while((pos=src.indexOf(term,pos))>=0&&n<10){
    const frag=src.slice(Math.max(0,pos-1400),Math.min(src.length,pos+3000));
    if(/P\.x|P\.y|jX|jY|_moveX|_moveY|updateSmartAttackInput/i.test(frag)){
      console.log('\n--- '+term+' '+(++n)+' @ '+pos+' ---\n'+frag);
    }
    pos+=term.length;
  }
}
