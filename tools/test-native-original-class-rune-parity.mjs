import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import vm from 'node:vm';
import {
  ORIGINAL_CLASS_BASE, ORIGINAL_STAT_POINT_GAIN, ORIGINAL_RUNE_TYPES,
  originalRuneDefinition, originalRuneUnlockedSlots, auditOriginalClassRuneReference
} from '../src/native-original-class-rune-parity.js';
import {projectNativeCombatProfileReadOnly} from '../src/native-combat-profile-readonly.js';

// Independent GOLDEN TEST against the exact 110 MB checksum-locked Telegram
// game source. It executes only selected original pure stat functions under
// a sandbox with synthetic fixtures, no DOM, timers, network or PPA D1.
const parts=Array.from({length:12},(_,i)=>readFileSync(new URL(
  '../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url)));
const raw=zlib.gunzipSync(Buffer.concat(parts));
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),
  'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7');
const source=raw.toString('utf8');
const build=readFileSync(new URL('../build.mjs',import.meta.url),'utf8');
// Actual original function bodies end at the first balanced closing brace.
function extractBlock(prefix) {
  const start=source.indexOf(prefix);
  assert(start>=0,'Missing '+prefix);
  const first=source.indexOf('{',start);
  let depth=0,quote='',escape=false;
  for(let i=first;i<source.length;i++){
    const ch=source[i];
    if(quote){
      if(escape){escape=false;continue}
      if(ch==='\\'){escape=true;continue}
      if(ch===quote)quote='';
      continue;
    }
    if(ch==="'"||ch==='"'||ch==='\x60'){quote=ch;continue}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw Error('Missing end '+prefix);
}
const literal=name=>{
  const prefix='const '+name+'=';
  const idx=source.indexOf(prefix);
  assert(idx>=0,'Original missing '+name);
  const first=source.indexOf('{',idx+prefix.length);
  const objectSource=extractBlock(prefix).slice(first-idx);
  return vm.runInNewContext('('+objectSource+')',Object.create(null),{timeout:1000});
};
const originalClasses=JSON.parse(JSON.stringify(literal('CLASS_BASE')));
const originalRunes=JSON.parse(JSON.stringify(literal('RUNE_TYPES')));
const originalGains=JSON.parse(JSON.stringify(literal('STAT_POINT_GAIN')));
assert.equal(Object.keys(originalClasses).length,8);
assert.equal(Object.keys(originalRunes).length,8);
assert.deepEqual(originalGains,ORIGINAL_STAT_POINT_GAIN);
assert(source.includes('const RUNE_MAX_SLOTS=10;'));
for(const [name,spec] of Object.entries(originalClasses)){
  const expected=ORIGINAL_CLASS_BASE[name];
  assert(expected,'Unknown PPA class '+name);
  for(const [k,v] of Object.entries(expected)){
    if(k==='range'&&['tank','barbarian','paladin','assassin'].includes(name)){
      const original=spec.range;
      assert(build.includes('range:'+expected.range+','),'Missing game build range override for '+name);
      assert(original!==v,'Range patch missing for '+name);
    }else assert.equal(spec[k],v,'Class stat changed '+name+'.'+k);
  }
}
for(const [type,spec] of Object.entries(originalRunes)){
  const expected=ORIGINAL_RUNE_TYPES[type];
  assert(expected,'Unknown original rune '+type);
  assert.equal(expected.stat,spec.stat);
  assert.deepEqual(expected.values,spec.values,'Original rune rarity table differs: '+type);
}
assert.equal(Object.keys(ORIGINAL_CLASS_BASE).length,8);
assert.equal(Object.keys(ORIGINAL_RUNE_TYPES).length,8);

const patched=structuredClone(originalClasses);
for(const k of ['tank','barbarian','paladin','assassin'])
  patched[k].range=ORIGINAL_CLASS_BASE[k].range;
const snippets=[
  'const CLASS_BASE='+JSON.stringify(patched)+';',
  'const STAT_POINT_GAIN='+JSON.stringify(originalGains)+';',
  'const RUNE_TYPES='+JSON.stringify(originalRunes)+';',
  "const RUNE_RARITY_ORDER=['common','uncommon','rare','epic','legendary'];",
  'const RUNE_RARITY_COLOR={}; const RUNE_RARITY_NAME={}; const RUNE_ART={};',
  extractBlock('function runeKey('),
  extractBlock('function runeDefByKey('),
  extractBlock('function runeBonus('),
  extractBlock('function gearBonus('),
  extractBlock('function syncRuneProgress('),
  extractBlock('function recomputeStats('),
  'function runeUnlockedSlots(){return __unlocked;}',
  'function classBaseKey(){return __class;}',
  'function clanHpMul(){return 1;} function clanMpMul(){return 1;}',
  'function computeBM(){return 0;} function updateBMHud(){}',
  'function updateSkillButtons(){} function saveGame(){}',
  'function sendInvState(){}',
];
const sourceScript=snippets.join('\n')+
  '\nrecomputeStats({skipNormalize:true,deferSave:true,deferInv:true});'+
  '\nJSON.stringify({mhp:P.mhp,mmp:P.mmp,atk:P.atk,def:P.def,'+
  'crit:P.crit,spd:P.spd,dodge:P.dodge,atkSpd:P.atkSpd,'+
  'critDmg:P.critDmg,attackRange:P.attackRange,damagePct:P.damagePct,'+
  'vampirism:P.vampirism,physDamagePct:P.physDamagePct,'+
  'magicDamagePct:P.magicDamagePct,armorPen:P.armorPen,'+
  'magicPen:P.magicPen,damageReduction:P.damageReduction});';
const unlockScript='const RUNE_MAX_SLOTS=10;\n'+extractBlock('function syncRuneProgress(')+
  '\nfunction normalizeRuneState(){}; syncRuneProgress();';

function compare(classKey,lvl,statAlloc,equipped,runeSlots,runeProgress,rebirths){
  const save={classKey,lvl,statAlloc,equipped,runeSlots,
    runeProgress,rebirths,statPts:0,skillRanks:{basic_attack:1}};
  const before=JSON.stringify(save);
  const own=auditOriginalClassRuneReference(save,classKey);
  assert.equal(own.status,'REFERENCE_PARITY_ONLY',JSON.stringify(own));
  const originalUnlocked=vm.runInNewContext(unlockScript,{
    P:{lvl,rebirths},INV:{runeProgress:structuredClone(runeProgress)}
  },{timeout:1000});
  assert.equal(own.reference.unlockedRuneSlots,originalUnlocked,
    'Original syncRuneProgress differs for '+classKey);
  const P={cls:classKey,lvl,rebirths,statAlloc:structuredClone(statAlloc),
    hp:1,mp:1},INV={equipped:structuredClone(equipped),
    runeSlots:structuredClone(runeSlots)};
  const result=JSON.parse(vm.runInNewContext(sourceScript,{
    P,INV,__unlocked:originalUnlocked,__class:classKey
  },{timeout:1000}));
  const predicted=own.reference.baselineWithoutClanBuffs;
  for(const [key,v] of Object.entries(predicted)){
    const gameKey=key==='hpBeforeClan'?'mhp':key==='mpBeforeClan'?'mmp':key;
    assert(Math.abs(result[gameKey]-v)<.000001,
      'Canonical recomputeStats mismatch '+classKey+'.'+gameKey+
      ' original='+result[gameKey]+' native='+v);
  }
  assert.equal(JSON.stringify(save),before,'Reference touched D1 save data');
  const profile=projectNativeCombatProfileReadOnly({
    ok:true,version:42,profile:{classKey},state:save
  });
  assert.equal(profile.candidate.classRuneParity.status,'REFERENCE_PARITY_ONLY');
  assert.equal(profile.canAttack,false);
  assert.equal(profile.canCast,false);
  assert.equal(profile.authoritativeCombatStats,null);
}
const zero={hp:0,mp:0,atk:0,def:0,spd:0,atkspd:0,critdmg:0,crit:0,dodge:0};
for(const key of Object.keys(originalClasses)){
  compare(key,1,zero,{},[],{levelSlots:0,rebirthSlots:0},0);
  compare(key,40,{...zero,hp:55,mp:20,atk:36,def:16,spd:10,
    atkspd:22,critdmg:12,crit:18,dodge:9},
    {weapon:{slot:'weapon',enh:7,uid:'synthetic-weapon-plus7',
      stats:{atk:190,armorPen:10}},
     armor:{slot:'armor',enh:5,stats:{def:45,hp:80,defPct:5}},
     pet:{slot:'pet',enh:5,stats:{atk:10,spdFlat:.5,atkSpeedPct:3}}},
    ['strength|legendary','strength|legendary','defense|epic',
      'agility|rare','crit|epic',null,null],
    {levelSlots:3,rebirthSlots:1},1);
}
compare('mage',60,{...zero,hp:200,mp:200,atk:200,def:70,spd:40,
    atkspd:45,critdmg:34,crit:25,dodge:100},
  {weapon:{slot:'weapon',enh:7,stats:{atk:152,magicPen:10}},
    ring:{slot:'ring',enh:6,stats:{crit:7,hpPct:5}},
    cloak:{slot:'cloak',enh:6,stats:{defPct:6,spd:1}},
    wings:{slot:'wings',enh:7,stats:{spdFlat:.7}}},
  ['speed|legendary','mana|epic','health|rare','vampirism|legendary',
    'agility|legendary','crit|rare','strength|epic','defense|legendary'],
  {levelSlots:6,rebirthSlots:2},2);
compare('priest',20,{...zero,mp:45,def:12,crit:8},
  {necklace:{slot:'necklace',enh:5,stats:{crit:4,mpPct:7}}},
  ['mana|uncommon','health|rare',null],
  {levelSlots:0,rebirthSlots:0},0);
compare('tank',1,zero,{},['health|rare','defense|rare'],{
  levelSlots:6,rebirthSlots:1},0); // persistent slots after rebirth
assert.equal(originalRuneUnlockedSlots(1,0,{levelSlots:6,rebirthSlots:1}),7);
assert.equal(originalRuneDefinition('agility|epic').value,4.5);
assert.equal(originalRuneDefinition('strength|legendary').value,13);
assert.equal(originalRuneDefinition('defense|legendary').value,17);
assert.equal(originalRuneDefinition('agility|unknown'),null);
for(const fake of [
  {runeSlots:['superpower|legendary']},
  {runeSlots:['strength|legendary'],runeProgress:{levelSlots:0,rebirthSlots:0}},
  {runeSlots:['strength|legendary'],runeProgress:{levelSlots:'10',rebirthSlots:0}},
  {runeSlots:Array(11).fill('strength|common')},
  {equipped:{weapon:{slot:'weapon',stats:{atk:Infinity}}}},
  {statAlloc:{...zero,atk:201}}
]){
  const save={lvl:1,classKey:'gnome',statAlloc:zero,equipped:{},
    runeSlots:[],runeProgress:{levelSlots:0,rebirthSlots:0},rebirths:0,...fake};
  const audit=auditOriginalClassRuneReference(save,'gnome');
  assert.notEqual(audit.status,'REFERENCE_PARITY_ONLY',
    'Malformed save was treated as an executable rune profile: '+JSON.stringify(fake));
  assert.equal(audit.effectiveCombatStats,null);
  assert.equal(audit.canAttack,false);
}
console.log('PPA_ORIGINAL_CLASS_RUNE_PARITY_OK checksum=1 original_class=8 original_runes=8 rarities=5 stat_formula=vm_runtime_equal cases=19 rebirth_slots_persist=1 duplicate_runes_stack=1 no_attacks=1 no_D1_mutations=1');
