import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import vm from 'node:vm';
import {ORIGINAL_ACTIVE_SKILLS} from '../src/native-original-active-catalog.generated.js';
import {ORIGINAL_CLAN_BONUS_VALUES,auditOriginalClanBonusReference}
  from '../src/native-original-clan-bonus-parity.js';
import {originalRankEffect} from '../src/native-original-passive-parity.js';
import {auditOriginalActiveSkillRanks}
  from '../src/native-original-active-parity.js';
import {projectNativeCombatProfileReadOnly}
  from '../src/native-combat-profile-readonly.js';

// Golden source is NOT edited, run or deployed. Only original pure numeric
// tables / clanBonusPct are evaluated in a sandbox with synthetic values.
const packed=Array.from({length:12},(_,i)=>readFileSync(new URL(
  '../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url)));
const raw=zlib.gunzipSync(Buffer.concat(packed));
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),
  'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7');
const src=raw.toString('utf8');
const build=readFileSync(new URL('../build.mjs',import.meta.url),'utf8');
assert(build.includes('const V189_IV_RATIO=160/140;'));
assert(build.includes('const V189_V_RATIO=180/140;'));
assert(build.includes('const cd=meta&&meta.cd?(rr<=3?('));
function extract(prefix) {
  const pos=src.indexOf(prefix);
  assert(pos>=0,'Original game source missing '+prefix);
  const start=src.indexOf('{',pos);
  let quote='',escape=false,depth=0;
  for(let i=start;i<src.length;i++){
    const c=src[i];
    if(quote){
      if(escape){escape=false;continue}
      if(c.charCodeAt(0)===92){escape=true;continue}
      if(c===quote)quote='';
      continue;
    }
    if([34,39,96].includes(c.charCodeAt(0))){quote=c;continue}
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0)return src.slice(pos,i+1);
  }
  throw Error('Unbalanced '+prefix);
}
const obj=prefix=>JSON.parse(JSON.stringify(vm.runInNewContext(
  '('+extract(prefix).slice(extract(prefix).indexOf('{'))+')',
  Object.create(null),{timeout:3000})));
const originalMeta=obj('const ACTIVE_META=');
const originalGrimoires=obj('const GRIMOIRE_CATALOG=');
const clanData=obj('const CLAN_BONUS_VALUES=');
assert.deepEqual(clanData,ORIGINAL_CLAN_BONUS_VALUES);
assert.equal(Object.keys(ORIGINAL_ACTIVE_SKILLS).length,8);
let activeCount=0,cooldownCases=0;
for(const [classKey,skills] of Object.entries(ORIGINAL_ACTIVE_SKILLS)){
  assert.equal(skills.length,4);
  assert.deepEqual(skills.map(x=>x.id),
    originalGrimoires[classKey].active.map(x=>x.id),
    'Original active skills changed for '+classKey);
  for(const item of skills){
    const expected=originalMeta[item.id];
    assert(expected);
    assert.equal(item.mp,expected.mp);
    assert.deepEqual(item.cd,expected.cd);
    assert(Number.isSafeInteger(item.mp)&&item.mp>=0&&item.mp<=100);
    for(let rank=1;rank<=5;rank++){
      const cdExpected=rank<=3?item.cd[rank-1]:
        item.cd[2]===item.cd[1]?item.cd[2]:
        item.cd[2]>item.cd[1]?
          item.cd[2]*(rank===4?160/140:180/140):
          item.cd[2]/(rank===4?160/140:180/140);
      assert.equal(originalRankEffect(item.cd,rank),cdExpected,
        'Original cooldown rank IV/V changed '+item.id+' '+rank);
      cooldownCases++;
    }
    activeCount++;
  }
  for(let rank=0;rank<=5;rank++){
    const state={skillRanks:Object.fromEntries(skills.map(x=>[x.id,rank]))};
    const before=JSON.stringify(state);
    const observed=auditOriginalActiveSkillRanks(state,classKey);
    assert.equal(observed.status,'REFERENCE_ACTIVE_ONLY');
    assert.equal(observed.activeSkills.length,4);
    assert(observed.activeSkills.every(x=>x.rank===rank&&
      x.unlockedInSave===(rank>0)&&
      (rank===0?x.cooldownSecondsReference===null:
        x.cooldownSecondsReference>0)));
    assert.equal(observed.canCast,false);
    assert.equal(observed.authoritativeCooldowns,null);
    assert.equal(JSON.stringify(state),before);
  }
}
assert.equal(activeCount,32);
assert.equal(cooldownCases,160);
for(const bad of [{skillRanks:null},{skillRanks:{tank_taunt:6}},
  {skillRanks:{tank_taunt:'3'}},{skillRanks:{tank_taunt:-1}}]){
  assert.notEqual(auditOriginalActiveSkillRanks(bad,'tank').status,
    'REFERENCE_ACTIVE_ONLY');
}
assert.equal(auditOriginalActiveSkillRanks({skillRanks:{}},'made-up').canCast,false);

const bonusFn=extract('function clanBonusPct(key)');
let checked=0;
for(const [name,values] of Object.entries(ORIGINAL_CLAN_BONUS_VALUES)){
  assert.equal(values.length,4);
  for(let rank=0;rank<=3;rank++){
    const reference=Number(vm.runInNewContext(
      'const CLAN_BONUS_VALUES='+JSON.stringify(clanData)+';'+
      'function clanBonusRank(key){return __rank;}\n'+bonusFn+
      ';clanBonusPct(__key);',
      {__rank:rank,__key:name},{timeout:500}));
    const observed=auditOriginalClanBonusReference({[name]:rank});
    assert.equal(observed.status,'REFERENCE_ONLY');
    assert.equal(observed.bonusPercent[name],reference);
    assert.equal(observed.mayApplyToCombat,false);
    assert.equal(observed.serverMembershipVerified,false);
    checked++;
  }
}
assert.equal(checked,24);
for(const invalid of [null,{hp:4},{mobDamage:-1},{gold:'3'},
  {xp:Infinity},{mp:0.5}]){
  const result=auditOriginalClanBonusReference(invalid);
  assert.equal(result.mayApplyToCombat,false);
  assert.equal(result.multipliers,null);
}
const save={
  profile:{classKey:'gnome'},version:81,
  state:{classKey:'gnome',lvl:30,statPts:0,
    statAlloc:{hp:0,mp:0,atk:0,def:0,spd:0,atkspd:0,critdmg:0,crit:0,dodge:0},
    equipped:{},runeSlots:[],runeProgress:{levelSlots:3,rebirthSlots:0},
    skillRanks:{gnome_explosive_shot:4,gnome_buckshot:5},
    bag:[{uid:'untouched-plus7',enh:7}],money:{gold:150,ppa:50,gram:2}}
};
const before=JSON.stringify(save);
const result=projectNativeCombatProfileReadOnly(save);
assert.equal(result.candidate.activeSkillParity.status,'REFERENCE_ACTIVE_ONLY');
assert.equal(result.candidate.activeSkillParity.activeSkills[0].rank,4);
assert.equal(result.candidate.activeSkillParity.activeSkills[1].rank,5);
assert.equal(result.candidate.activeSkillParity.canCast,false);
assert.equal(result.candidate.clanBonusStatus,'SERVER_CLAN_MEMBERSHIP_AND_BUFF_RANKS_NOT_VERIFIED');
assert.equal(result.canCast,false);
assert.equal(result.canAttack,false);
assert.equal(result.canReceiveRewards,false);
assert.equal(result.authoritativeCombatStats,null);
assert.equal(JSON.stringify(save),before);
console.log('PPA_ORIGINAL_ACTIVE_CLAN_PARITY_OK active=32 cooldown_rank_samples=160 clan_bonuses=6 clan_ranks=24 unsigned_member_untrusted=1 stage_only=1 no_cast=1 no_rewards=1 plus7_safe=1');
