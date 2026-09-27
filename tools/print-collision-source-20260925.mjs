import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const low=src.toLocaleLowerCase('ru-RU');

function out(label,pos,pre=5000,post=10000){
  console.log('\n===== '+label+' @ '+pos+' =====');
  console.log(src.slice(Math.max(0,pos-pre),Math.min(src.length,pos+post)));
}

function hits(term,max=12){
  const t=term.toLocaleLowerCase('ru-RU');
  let pos=0,n=0;
  while((pos=low.indexOf(t,pos))>=0&&n<max){
    out(term+' #'+(++n),pos);
    pos+=Math.max(1,t.length);
  }
}

hits('Популярное',8);
hits('statPoints',16);
hits('premiumShop',10);

console.log('\n===== NEARBY PAGE/SWIPE FUNCTIONS =====');
const re=/function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*\{/g;
let m,n=0;
while((m=re.exec(src))&&n<80){
  const frag=src.slice(Math.max(0,m.index-1400),Math.min(src.length,m.index+4000));
  if(/Популяр|statPoints|premiumShop|touchstart|touchend|pointerdown|pointerup|swipe|page|dot|pagination|carousel/i.test(frag)){
    console.log('\n--- FUNC '+(++n)+' '+m[1]+'('+m[2]+') @ '+m.index+' ---\n'+frag);
  }
}

console.log('\n===== STATPOINT PRODUCT OBJECTS =====');
let pos=0,k=0;
while((pos=src.indexOf("kind:'statPoints'",pos))>=0&&k<12){
  out('statPoints product '+(++k),pos,3800,6200);
  pos+=17;
}
