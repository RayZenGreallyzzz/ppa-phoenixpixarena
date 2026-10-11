// Exact arithmetic port for ORIGINAL Telegram PPA basicAttackRoll(target)
// against an ordinary (non-boss, non-AI) mob. The source is independently
// checksum-locked in tools/test-native-pve-basic-damage-parity.mjs.
// SYNTHETIC REFERENCE ONLY: no server-authenticated live gear, buffs, crit RNG,
// target defense or PvE actor yet. Never import into Worker or realtime, and
// NEVER use this number to authorize mob damage, XP, Gold, PPA or loot.
const CLASSES=new Set(['gnome','tank','barbarian','paladin','archer','mage','assassin','priest']);
const OBJ=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const FIELDS=new Set(['origin','classKey','atk','crit','critDmg','dmgMul',
  'damagePct','physDamagePct','magicDamagePct','timedShopMul',
  'clanMobMul','clanSiegeMul','armorPen','magicPen','targetDef',
  'critRoll','targetKind']);
const fail=code=>Object.freeze({ok:false,code,
  readOnly:true,canAttack:false,canCast:false,canReceiveRewards:false,
  damageReference:null});

export function originalBasicDamageReference(sample) {
  if(!OBJ(sample)||Object.keys(sample).some(k=>!FIELDS.has(k))||
     sample.origin!=='synthetic-original-basic-damage-only'||
     !CLASSES.has(sample.classKey)||sample.targetKind!=='ordinary-mob'||
     !finite(sample.atk,0,1000000)||!finite(sample.crit,0,100)||
     !finite(sample.critDmg,100,1000)||!finite(sample.dmgMul,0,100)||
     !finite(sample.damagePct,0,10000)||
     !finite(sample.physDamagePct,0,10000)||
     !finite(sample.magicDamagePct,0,10000)||
     !finite(sample.timedShopMul,1,1.05)||
     !finite(sample.clanMobMul,0,100)||
     !finite(sample.clanSiegeMul,0,100)||
     !finite(sample.armorPen,0,100)||!finite(sample.magicPen,0,100)||
     !finite(sample.targetDef,0,1000000)||
     !finite(sample.critRoll,0,99.999999999))
    return fail('UNVERIFIED_SYNTHETIC_DAMAGE_INPUT');

  const magic=sample.classKey==='mage'||sample.classKey==='priest';
  const critical=sample.critRoll<sample.crit;
  const critMul=critical?sample.critDmg/100:1;
  // Original shopDamageMul(): timed 1.05 when applicable, all damage%,
  // then physical/magic percentage. No forced integer rounding here.
  const shopMul=sample.timedShopMul*
    (1+sample.damagePct/100)*
    (1+(magic?sample.magicDamagePct:sample.physDamagePct)/100);
  // Ordinary mob path from clanDamageMulFor(target), NOT boss/AI path.
  const clanMul=sample.clanMobMul*sample.clanSiegeMul;
  const raw=(10+(sample.atk||12))*sample.dmgMul*shopMul*
    clanMul*critMul;
  const penPct=(magic?sample.magicPen:sample.armorPen)/100;
  const effectiveDefense=(sample.targetDef||0)*
    (1-Math.max(0,Math.min(.60,penPct)));
  // Original basicAttackRoll: Math.max(1,Math.floor(raw)-effDef).
  // Preserve fractional result after subtracting effDef; rounding it
  // to integer would silently change Telegram PvE damage.
  const damage=Math.max(1,Math.floor(raw)-effectiveDefense);
  if(!Number.isFinite(damage))return fail('REFERENCE_DAMAGE_OVERFLOW');
  return Object.freeze({
    ok:true,code:'ORIGINAL_BASIC_DAMAGE_PARITY_REFERENCE_ONLY',
    readOnly:true,canAttack:false,canCast:false,
    canReceiveRewards:false,critical,
    damageReference:damage,
    classKey:sample.classKey,targetKind:'ordinary-mob',
    // This result MUST NOT be used in mob-hit-event / settlement.
    combatAuthorityVerified:false,serverCritRollVerified:false,
    targetDefenseVerified:false,buffsVerified:false,
    spawnGenerationVerified:false
  });
}
