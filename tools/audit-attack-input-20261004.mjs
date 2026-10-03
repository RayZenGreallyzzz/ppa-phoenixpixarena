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
function count(needle){let c=0,p=0;while((p=src.indexOf(needle,p))>=0){c++;p+=Math.max(1,needle.length)}return c}
function context(label,needle,max=8,pre=1400,post=2600){
  console.log(`\n===== ${label} :: ${needle} =====`);
  let pos=0,n=0;
  while((pos=src.indexOf(needle,pos))>=0&&n<max){
    n++;
    console.log(`\n--- ${label} #${n} @ ${pos} ---\n`+clean(src.slice(Math.max(0,pos-pre),Math.min(src.length,pos+post))));
    pos+=needle.length;
  }
  console.log(`COUNT ${label}: ${count(needle)}${count(needle)>max?' (printed first '+max+')':''}`);
}
function regexContexts(label,re,max=12,pre=900,post=1700){
  console.log(`\n===== REGEX ${label} :: ${re} =====`);
  re.lastIndex=0;let m,n=0,total=0;
  while((m=re.exec(src))){
    total++;
    if(n<max){n++;console.log(`\n--- ${label} #${n} @ ${m.index} :: ${m[0]} ---\n`+clean(src.slice(Math.max(0,m.index-pre),Math.min(src.length,m.index+post))))}
    if(!m[0].length)re.lastIndex++;
  }
  console.log(`COUNT ${label}: ${total}${total>max?' (printed first '+max+')':''}`);
}

context('SMART_APPROACH','PPA_MELEE_SMART_APPROACH_20261003',4,2600,5200);
context('BASIC_RANGE','playerBasicRange',12,1600,3000);
context('ATTACKING_STATE','P.attacking',16,1200,2500);
context('RUN_ATTACK_TIMER','runAttackT',20,1200,2500);
context('SHOOT_TIMER','shootT',12,1200,2200);
context('ATTACK_SPEED','atkSpd',20,1200,2200);
context('TARGET_ID','P.tid',20,1200,2200);
context('AUTO_ATTACK','autoAttack',20,1200,2200);
context('ATTACK_RU','Атака',20,1100,2200);
context('COOLDOWN_WORD','cooldown',20,1000,1800);
context('ATK_CD_CAMEL','atkCD',20,1000,1800);
context('ATK_CD_LOWER','atkCd',20,1000,1800);

regexContexts('POINTER_BIND',/addEventListener\(\s*['\"](?:pointerdown|pointerup|touchstart|touchend|mousedown|mouseup|click)['\"]/g,30,700,1400);
regexContexts('ATTACK_IDENT',/\b(?:tryAttack|doAttack|basicAttack|startAttack|performAttack|attackTarget|playerAttack|attackBtn|btnAttack|atkBtn|attackButton)\b/g,30,1000,2200);
regexContexts('EARLY_RETURN_ATTACK',/if\s*\([^\n]{0,160}(?:attacking|runAttackT|shootT|atkSpd|cooldown|tid|target)[^\n]{0,160}\)\s*return/g,30,1000,2000);

console.log('\n===== SUMMARY =====');
for(const needle of ['PPA_MELEE_SMART_APPROACH_20261003','playerBasicRange','P.attacking','runAttackT','shootT','atkSpd','P.tid','autoAttack','Атака','cooldown','atkCD','atkCd']){
  console.log(JSON.stringify({needle,count:count(needle)}));
}
