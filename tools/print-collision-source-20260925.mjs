import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');

function excerpt(label,pos,pre=1800,post=3200){
  console.log('\n===== '+label+' @ '+pos+' =====');
  console.log(src.slice(Math.max(0,pos-pre),Math.min(src.length,pos+post)));
}

const terms=[
  'очки характеристик','Очки характеристик','ОЧКИ ХАРАКТЕРИСТИК',
  'очки параметров','Очки параметров','характеристик',
  'statPoints','statPoint','attributePoints','attributePoint','attrPoints','attrPoint',
  'bonusPoints','bonusPoint','freePoints','freePoint','spentPoints','spentPoint',
  'purchasedPoints','purchasedPoint','boughtPoints','boughtPoint',
  'buyStat','buyPoint','purchaseStat','purchasePoint','addStat','allocStat','allocateStat',
  'premiumStat','statPurchase','characterStat','baseStats','manualStats',
  'СИЛА','ЛОВКОСТ','ИНТЕЛЛЕКТ','ВЫНОСЛИВОСТ','МУДРОСТ','СТАТЫ','ХАРАКТЕРИСТИКИ'
];

for(const term of terms){
  let pos=0,count=0;
  while((pos=src.toLocaleLowerCase('ru-RU').indexOf(term.toLocaleLowerCase('ru-RU'),pos))>=0 && count<12){
    excerpt(term+' hit '+(++count),pos);
    pos+=Math.max(1,term.length);
  }
}

console.log('\n===== FUNCTIONS WITH STAT/POINT/ATTR/BUY/PURCHASE =====');
const re=/function\s+([A-Za-z0-9_$]*(?:stat|point|attr|buy|purchase|upgrade)[A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*\{/gi;
let m,count=0;
while((m=re.exec(src))&&count<160){
  console.log(m.index+' '+m[1]+'('+m[2]+')');
  excerpt('FUNC '+m[1],m.index,900,2200);
  count++;
}

console.log('\n===== SAVE OBJECT CANDIDATES =====');
for(const term of ['function saveGame','function loadGame','pxSave','JSON.stringify','lvl:','level:']){
  let pos=0,count=0;
  while((pos=src.indexOf(term,pos))>=0&&count<8){excerpt(term+' '+(++count),pos,1200,2600);pos+=term.length;}
}
