import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import vm from 'node:vm';
import {ORIGINAL_PASSIVE_SKILLS} from '../src/native-original-passive-catalog.generated.js';
import {originalRankEffect,auditOriginalPassiveSkills}
  from '../src/native-original-passive-parity.js';
import {projectNativeCombatProfileReadOnly}
  from '../src/native-combat-profile-readonly.js';

// EXECUTES the original Telegram PPA V189 passive algorithm with synthetic
// skillRanks. This does not connect to Cloudflare or modify any player save.
const parts=Array.from({length:12},(_,i)=>readFileSync(new URL(
  '../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url)));
const raw=zlib.gunzipSync(Buffer.concat(parts));
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),
  'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7');
const original=raw.toString('utf8');
const build=readFileSync(new URL('../build.mjs',import.meta.url),'utf8');
assert(build.includes('const V189_IV_RATIO=160/140;'));
assert(build.includes('const V189_V_RATIO=180/140;'));
assert(build.includes('return v3>v2?v3*ratio:v3/ratio;'));
assert(build.includes("typeof skillProgressRank==='function'?skillProgressRank(sk.id):skillRank(sk.id)"));
function segment(prefix) {
  const pos=original.indexOf(prefix);
  assert(pos>=0,'Cannot find canonical Telegram passive '+prefix);
  const first=original.indexOf('{',pos);
  let depth=0,quote='',escape=false;
  for(let i=first;i<original.length;i++){
    const c=original[i];
    if(quote){
      if(escape){escape=false;continue}
      if(c.charCodeAt(0)===92){escape=true;continue}
      if(c===quote)quote='';
      continue;
    }
    if(c.charCodeAt(0)===39||c.charCodeAt(0)===34||c.charCodeAt(0)===96){
      quote=c;continue;
    }
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0)return original.slice(pos,i+1);
  }
  throw Error('Unbalanced Telegram PASSIVE_META: '+prefix);
}
const obj=(prefix)=>{
  const item=segment(prefix);
  return JSON.parse(JSON.stringify(vm.runInNewContext(
    '('+item.slice(item.indexOf('{'))+')',Object.create(null),{timeout:500})));
};
const origMeta=obj('const PASSIVE_META=');
const origClasses=obj('const GRIMOIRE_CATALOG=');
assert.equal(Object.keys(ORIGINAL_PASSIVE_SKILLS).length,8);
let count=0;
for(const [name,cls] of Object.entries(ORIGINAL_PASSIVE_SKILLS)){
  const ids=origClasses[name].passive.map(x=>x.id);
  assert.deepEqual(cls.map(x=>x.id),ids,'Changed passive class mapping '+name);
  assert.equal(cls.length,5);
  for(const skill of cls){
    const source=origMeta[skill.id];
    assert(source,'Missing original passive '+skill.id);
    assert.equal(skill.k,source.k);
    assert.deepEqual(skill.v,source.v);
    for(let rank=1;rank<=5;rank++){
      const v2=source.v[1],v3=source.v[2];
      const expected=rank<=3?source.v[rank-1]:
        v3===v2?v3:v3>v2?v3*(rank===4?160/140:180/140):
          v3/(rank===4?160/140:180/140);
      assert.equal(originalRankEffect(skill.v,rank),expected,
        'Original rank IV/V scaling changed '+skill.id+' '+rank);
      count++;
    }
  }
}
assert.equal(count,200);

const sourceFunc=segment('function passiveBonusForClass(ck)');
assert(sourceFunc.includes('rank=skillRank(sk.id)'));
const patchedFunc=sourceFunc.replace('rank=skillRank(sk.id)',
  "rank=(typeof skillProgressRank==='function'?skillProgressRank(sk.id):skillRank(sk.id))");
const script=new vm.Script(`
  const rv=(arr,rank)=>{
    let r=rank|0;if(r<1)r=1;if(r>5)r=5;
    if(r<=3)return arr[r-1];
    const v3=arr&&arr[2],v2=arr&&arr[1];
    if(typeof v3!=='number'||typeof v2!=='number'||v3===v2)return v3;
    const ratio=r===4?160/140:180/140;
    return v3>v2?v3*ratio:v3/ratio;
  };
  function skillProgressRank(id){return Math.max(0,Math.min(5,INV.skillRanks[id]||0));}
  ${patchedFunc}
  passiveBonusForClass(__class);
`);
let runs=0;
for(const name of Object.keys(ORIGINAL_PASSIVE_SKILLS)){
  for(let rank=0;rank<=5;rank++){
    const ranks={};
    for(const item of ORIGINAL_PASSIVE_SKILLS[name])ranks[item.id]=rank;
    const save={skillRanks:ranks};
    const before=JSON.stringify(save);
    const vmResult=JSON.parse(JSON.stringify(script.runInNewContext({
      GRIMOIRE_CATALOG:origClasses,PASSIVE_META:origMeta,
      INV:{skillRanks:ranks},__class:name
    },{timeout:1000})));
    const got=auditOriginalPassiveSkills(save,name);
    assert.equal(got.status,'REFERENCE_PASSIVE_ONLY');
    assert.deepEqual(got.passiveBonuses,vmResult,
      'Telegram passive totals mismatch '+name+' rank '+rank);
    assert.equal(got.canAttack,false);
    assert.equal(got.canCast,false);
    assert.equal(got.effectiveCombatStats,null);
    assert.equal(JSON.stringify(save),before,'Read-only passive audit mutated skill ranks');
    runs++;
  }
}
assert.equal(runs,48);
for(const bad of [
  {skillRanks:null},
  {skillRanks:{tank_steel_will:6}},
  {skillRanks:{tank_steel_will:-1}},
  {skillRanks:{tank_steel_will:'5'}},
  {skillRanks:{tank_steel_will:NaN}},
  {skillRanks:{tank_steel_will:3.5}}
]){
  const result=auditOriginalPassiveSkills(bad,'tank');
  assert.notEqual(result.status,'REFERENCE_PASSIVE_ONLY');
  assert.equal(result.passiveBonuses,null);
  assert.equal(result.canAttack,false);
}
assert.equal(originalRankEffect([30,20,10],4),8.75);
assert.equal(originalRankEffect([10,10,10],5),10);
assert.equal(originalRankEffect([1,2,3],6),null);

const save={
  profile:{classKey:'tank'},version:51,updatedAt:12345,
  state:{classKey:'tank',lvl:40,statPts:4,
    statAlloc:{hp:0,mp:0,atk:0,def:0,spd:0,atkspd:0,critdmg:0,crit:0,dodge:0},
    equipped:{},runeSlots:[],runeProgress:{levelSlots:4,rebirthSlots:0},
    skillRanks:{tank_steel_will:5,tank_tough_armor:4},
    bag:[{uid:'actual-plus7',enh:7}],money:{gold:500,gram:3,ppa:42}}
};
const copy=JSON.stringify(save);
const view=projectNativeCombatProfileReadOnly(save);
assert.equal(view.candidate.passiveParity.status,'REFERENCE_PASSIVE_ONLY');
assert.equal(view.candidate.passiveParity.activePassives.length,2);
assert.equal(view.candidate.passiveParity.passiveBonuses.damageReduction,8*(180/140));
assert.equal(view.candidate.passiveParity.liveClanMultipliersVerified,false);
assert.equal(view.authoritativeCombatStats,null);
assert.equal(view.canAttack,false);
assert.equal(view.canReceiveRewards,false);
assert.equal(JSON.stringify(save),copy);
console.log('PPA_ORIGINAL_PASSIVE_PARITY_OK SHA_locked=1 classes=8 skills=40 values=200 original_algorithm_cases=48 rank_IV_V=1 clan_unverified=1 no_attack=1 saves_and_plus7_untouched=1');
