import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');

const needles=[
  'hpPot','mpPot','hppot','mppot','healthPotion','manaPotion','potion',
  'grimoires','grimoireRankDrops','GRIMOIRE_ART','SKILL_SETS','CLASS_SKILLS','skillsByClass',
  'tank_','barb_','pala_','gnome_','archer_','mage_','assa_','priest_',
  'makeGear','v232PushGear','pushGear','gearDrop','rarity:\'common\''
];

function contexts(needle,max=6,before=700,after=1700){
  let out=[],pos=0;
  while((pos=src.indexOf(needle,pos))>=0 && out.length<max){
    out.push(src.slice(Math.max(0,pos-before),Math.min(src.length,pos+after)));
    pos+=needle.length;
  }
  return out;
}

let out='';
for(const n of needles){
  const xs=contexts(n);
  if(!xs.length)continue;
  out+='\n===== '+n+' ('+xs.length+') =====\n';
  xs.forEach((x,i)=>{out+='\n--- '+(i+1)+' ---\n'+x+'\n';});
}
fs.writeFileSync('diag-newbie-kit-source-small.txt',out);
console.log('wrote',out.length);
