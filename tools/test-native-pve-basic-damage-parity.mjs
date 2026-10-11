import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
import {originalBasicDamageReference} from '../src/native-pve-original-basic-damage-parity.js';

// Differential test executes ONLY three small, pure, checksum-locked original
// Telegram PPA arithmetic functions in a sandbox. No DOM, network, D1,
// player saves, real RNG, game runtime or original client mutation.
const sourceBytes=gunzipSync(Buffer.concat(Array.from({length:12},(_,i)=>
  readFileSync(new URL('../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url)))));
const hash=createHash('sha256').update(sourceBytes).digest('hex');
assert.equal(hash,'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7');
const src=sourceBytes.toString('utf8');

function originalFunction(name) {
  const pos=src.indexOf('function '+name+'(');
  assert(pos>=0,'Original function not found: '+name);
  const start=src.indexOf('{',pos);
  let depth=0,quote='',escaped=false;
  for(let i=start;i<src.length;i++) {
    const c=src[i];
    if(quote) {
      if(escaped){escaped=false;continue;}
      if(c==='\\'){escaped=true;continue;}
      if(c===quote)quote='';
      continue;
    }
    if(c==="'"||c==='"'||c==='\x60'){quote=c;continue;}
    if(c==='{')depth++;
    else if(c==='}' && --depth===0)
      return src.slice(pos,i+1);
  }
  throw Error('Unbalanced original function '+name);
}
const basic=originalFunction('basicAttackRoll');
const shop=originalFunction('shopDamageMul');
const clan=originalFunction('clanDamageMulFor');
const classes=['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'];
const magicKey=c=>c==='mage'||c==='priest';
let checks=0,crits=0,fractional=0;

for(const classKey of classes)for(const mode of [0,1,2,3,4,5]) {
  const critical=mode%2===1;
  const crit=critical?70:0;
  const roll=critical?0:90;
  const sample={
    origin:'synthetic-original-basic-damage-only',
    classKey,targetKind:'ordinary-mob',
    atk:25+mode*19,crit,critDmg:180+mode*21,
    dmgMul:mode===4?1.35:1,damagePct:mode*3,
    physDamagePct:mode*7,magicDamagePct:mode*11,
    timedShopMul:mode%3===0?1.05:1,
    clanMobMul:mode%2===0?1.07:1,clanSiegeMul:mode===5?1.1:1,
    armorPen:mode*15,magicPen:mode*20,
    targetDef:mode===0?0:14+mode*8,
    critRoll:roll
  };
  const pure=originalBasicDamageReference(sample);
  assert.equal(pure.ok,true,JSON.stringify(pure));
  assert.equal(pure.canAttack,false);
  assert.equal(pure.canReceiveRewards,false);
  assert.equal(pure.combatAuthorityVerified,false);
  assert(!Object.hasOwn(pure,'damage'),'A reference cannot masquerade as authoritative damage');

  const P={
    atk:sample.atk,crit:sample.crit,critDmg:sample.critDmg,
    dmgMul:sample.dmgMul,damagePct:sample.damagePct,
    physDamagePct:sample.physDamagePct,
    magicDamagePct:sample.magicDamagePct,
    armorPen:sample.armorPen,magicPen:sample.magicPen
  };
  const fakeMath=Object.create(Math);
  fakeMath.random=()=>sample.critRoll/100;
  const boosts={magicUntil:sample.timedShopMul>1?1_900_000_000_000:0,
    physUntil:sample.timedShopMul>1?1_900_000_000_000:0};
  const fakeDate={now:()=>1_800_000_000_000};
  const common={P,Math:fakeMath,Date:fakeDate,
    INV:{activeBoosts:boosts},shopUsesMagicPower:()=>magicKey(classKey),
    clanMobDamageMul:()=>sample.clanMobMul,
    clanBossDamageMul:()=>1,
    clanSiegeOutgoingMul:()=>sample.clanSiegeMul,
    classBaseKey:()=>classKey
  };
  const sandbox=vm.createContext(common);
  const originalShop=vm.runInContext('('+shop+')',sandbox,{timeout:1000});
  const originalClan=vm.runInContext('('+clan+')',sandbox,{timeout:1000});
  const originalBasic=vm.runInContext('('+basic+')',sandbox,{timeout:1000});
  const target={def:sample.targetDef,isAiFighter:false,
    isClanBoss:false,isBoss:false,hp:200};
  sandbox.target=target;
  sandbox.basicAttackRoll=originalBasic;
  sandbox.shopDamageMul=originalShop;
  sandbox.clanDamageMulFor=originalClan;
  const originalResult=vm.runInContext('basicAttackRoll(target)',sandbox,{timeout:1000});
  assert.equal(pure.critical,originalResult.crit,
    'Crit mismatch '+classKey+' '+mode);
  assert(Math.abs(pure.damageReference-originalResult.damage)<1e-10,
    'Damage mismatch '+classKey+' '+mode+' '+JSON.stringify({pure,originalResult}));
  checks++;
  if(critical)crits++;
  if(!Number.isInteger(pure.damageReference))fractional++;
}
assert.equal(checks,48);
assert(crits>=8);
assert(fractional>=5,'Original fractional defense subtraction was rounded incorrectly');

const valid={
 origin:'synthetic-original-basic-damage-only',classKey:'mage',
 targetKind:'ordinary-mob',atk:100,crit:20,critDmg:180,
 dmgMul:1,damagePct:10,physDamagePct:5,magicDamagePct:15,
 timedShopMul:1,clanMobMul:1,clanSiegeMul:1,
 armorPen:5,magicPen:20,targetDef:50,critRoll:50
};
const before=JSON.stringify(valid);
assert.equal(originalBasicDamageReference(valid).ok,true);
assert.equal(JSON.stringify(valid),before,'Reference mutated source');

for(const change of [
 {origin:'telegram-packet'},{origin:'server-client-move'},
 {targetKind:'boss'},{targetKind:'ai-fighter'},
 {classKey:'unknown'},{atk:NaN},{atk:9999999},
 {dmgMul:Infinity},{crit:-1},{crit:101},{critDmg:50000},
 {magicPen:101},{armorPen:-1},{targetDef:-5},
 {critRoll:100},{timedShopMul:1.2},{damagePct:Infinity},
 {damage:999999},{gold:1e9},{loot:{uid:'free'}},
 {spawnGeneration:77},{position:{x:0,y:0}},{ownerId:'123'}
]){
  const verdict=originalBasicDamageReference({...valid,...change});
  assert.equal(verdict.ok,false,'Accepted forged/unverified field '+JSON.stringify(change));
  assert.equal(verdict.canAttack,false);
  assert.equal(verdict.damageReference,null);
}
const realtime=readFileSync(new URL('../src/realtime-stable.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
assert(!realtime.includes('originalBasicDamageReference'));
assert(!worker.includes('originalBasicDamageReference'));
console.log('PPA_ORIGINAL_BASIC_DAMAGE_PARITY_OK cases='+checks+
 ' crit='+crits+' fractional='+fractional+
 ' original_shop=1 original_clan=1 source_sha256='+hash.slice(0,16)+
 ' default_no_authority=1 live_damage=0 live_revenue=0');
