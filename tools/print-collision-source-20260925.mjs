import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');

function out(label,pos,pre=4200,post=9000){
  console.log('\n===== '+label+' @ '+pos+' =====');
  console.log(src.slice(Math.max(0,pos-pre),Math.min(src.length,pos+post)));
}

const terms=[
  'Популярное','ПОПУЛЯРНОЕ','популярное',
  'statPoints','statPoint','premiumShop',
  'Очки характеристик','очки характеристик','характеристик',
  '15 очков','30 очков',
  'touchstart','touchend','pointerdown','pointerup',
  'swipe','carousel','pageDots','dots','dot','pager','pagination',
  'premiumGoods','PREMIUM_GOODS','renderPremium','premiumPage','shopPage'
];

for(const term of terms){
  let pos=0,n=0;
  while((pos=src.toLocaleLowerCase('ru-RU').indexOf(term.toLocaleLowerCase('ru-RU'),pos))>=0&&n<20){
    const frag=src.slice(Math.max(0,pos-2600),Math.min(src.length,pos+6200));
    if(/premium|shop|популяр|характер|statPoint|touch|swipe|page|dot|gram/i.test(frag)){
      out(term+' #'+(++n),pos,2600,6200);
    }
    pos+=Math.max(1,term.length);
  }
}

console.log('\n===== FUNCTIONS AROUND PREMIUM / SHOP / PAGE / SWIPE =====');
const re=/function\s+([A-Za-z0-9_$]*(?:premium|shop|page|swipe|carousel|render|good|product)[A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*\{/gi;
let m,count=0;
while((m=re.exec(src))&&count<120){
  const frag=src.slice(Math.max(0,m.index-900),Math.min(src.length,m.index+2800));
  if(/premium|shop|statPoints|Популяр|характер|page|dot|swipe|touch/i.test(frag)){
    console.log('\n--- FUNC '+(++count)+' '+m[1]+'('+m[2]+') @ '+m.index+' ---\n'+frag);
  }
}

console.log('\n===== STATPOINT PRODUCT OBJECTS =====');
let p0=0,k=0;
while((p0=src.indexOf("kind:'statPoints'",p0))>=0&&k<20){out('statPoints object '+(++k),p0,3400,5200);p0+=17}
