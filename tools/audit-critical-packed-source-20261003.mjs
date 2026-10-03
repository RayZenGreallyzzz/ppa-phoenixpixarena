import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
for(const p of parts)if(!fs.existsSync(p))throw new Error('Missing '+p);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');

function clean(s){
  return s
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,'data:image/...;base64,[REMOVED]')
    .replace(/([A-Za-z0-9+/]{500,})/g,'[LONG_DATA_REMOVED]');
}
function context(label,needle,max=12,pre=1800,post=2800){
  console.log(`\n===== ${label} :: ${needle} =====`);
  let pos=0,n=0;
  while((pos=src.indexOf(needle,pos))>=0&&n<max){
    n++;
    console.log(`\n--- ${label} #${n} @ ${pos} ---\n`+clean(src.slice(Math.max(0,pos-pre),Math.min(src.length,pos+post))));
    pos+=needle.length;
  }
  console.log(`\nCOUNT ${label}: ${n}${n===max?' (capped)':''}`);
}

context('REWARD_KILL','P.kil',20);
context('REWARD_XP','P.xp',20);
context('SKILL_VAMP','applyPlayerVampirism(dmg',20);
context('HP_MINUS_DMG','e.hp-=dmg',30);
context('DUNGEON_SPAWN_LOOP','DG_ACTIVE_SPAWNS.length',30);
context('MOB_ATTACK_AGGRO','e.aggro&&',30);
context('MOB_ATK_CD','e.atkCD<=0',30);
context('MOB_VIS_DIR','e.visDir',30);
context('GRAM_STATE','function sendGramWalletState()',10);
context('DRAGON_KEEPER_TEXT','Хранитель',20);
context('ELITE_BOOK_INSPECT','Rank',20,900,1600);

// TEMP 20261003: inspect canonical melee approach/stop-distance logic only.
context('MELEE_FUNCTION','function melee',12,2600,5200);
context('BASIC_RANGE','playerBasicRange',20,2200,4200);
context('ATTACK_MODE','attackMode',20,1800,3600);
context('AUTO_TARGET','findNearBasic',20,1800,3600);
context('MELEE_ANGLE','meleeAng',20,1800,3600);

console.log('\n===== SUMMARY =====');
for(const needle of [
  'P.kil','P.xp','applyPlayerVampirism(dmg','e.hp-=dmg','DG_ACTIVE_SPAWNS.length',
  'e.aggro&&','e.atkCD<=0','e.visDir','function sendGramWalletState()',
  'function melee','playerBasicRange','attackMode','findNearBasic','meleeAng'
]){
  let c=0,p=0;while((p=src.indexOf(needle,p))>=0){c++;p+=needle.length}
  console.log(JSON.stringify({needle,count:c}));
}
