// Original Telegram PPA combat-stat parity: audited, read-only subformulas.
//
// Exact enhancement scaling/awakening/pet logic is ALREADY ported for the
// blacksmith in shared-sharpen.js and SHA-locked to the original Telegram
// source. Reuse it on a CLONE rather than implement a second calculator.
// Do NOT conflate gear formulas with fully-authoritative runtime combat stats.
import { applyOriginalEnhancementStats } from './shared-sharpen.js';

const POINT_KEYS = Object.freeze(['hp','mp','atk','def','spd','atkspd','critdmg','crit','dodge']);
const GEAR_SLOTS = Object.freeze([
  'weapon','helmet','armor','gloves','ring','legs','boots','necklace',
  'artifact','cloak','wings','pet'
]);
const OBJECT = x => x!==null && typeof x==='object' && !Array.isArray(x);
const NUMBER = x => typeof x==='number' && Number.isFinite(x);
const pointCap = key => ['hp','mp','atk'].includes(key) ? 200 : 100;
const safeNumber = x => NUMBER(x) && Math.abs(x) <= 1000000000;

export function auditOriginalStatAllocation(statAlloc) {
  if (!OBJECT(statAlloc)) return {
    source:'telegram-ppa-build:per-stat-character-point-caps',
    status:'ALLOCATIONS_UNAVAILABLE', perStat:null,
    allStaticCapsSatisfied:false,dodgeRuntimeCapVerified:false
  };
  const perStat = {};
  let staticOk = true;
  for (const key of POINT_KEYS) {
    const raw = statAlloc[key] ?? 0;
    const max = pointCap(key);
    const safe = Number.isSafeInteger(raw) && raw>=0 && raw<=max;
    perStat[key] = { allocated:Number.isSafeInteger(raw) && raw>=0 ? raw:null,
      staticCap:max, status:safe?'WITHIN_STATIC_CAP':'INVALID_OR_EXCEEDS_CAP' };
    if (!safe) staticOk=false;
  }
  // The real dodge cap depends on CLASS_BASE, gearBonus(), runeBonus()
  // and STAT_POINT_GAIN.dodge. Static 100 points is only an upper bound.
  return {source:'telegram-ppa-build:per-stat-character-point-caps',
    status:staticOk?'STATIC_CAPS_MATCH':'STATIC_CAP_CONFLICT',
    perStat,allStaticCapsSatisfied:staticOk,
    dodgeRuntimeCapVerified:false};
}

function numbersMatch(expected, current) {
  if (!OBJECT(expected) || !OBJECT(current)) return false;
  const ks = new Set([...Object.keys(expected),...Object.keys(current)]);
  for(const key of ks) {
    const a=expected[key],b=current[key];
    if (!safeNumber(a) || !safeNumber(b)) return false;
    if (Math.abs(a-b)>0.011) return false;
  }
  return true;
}

function auditOne(slot, item) {
  if (item===null || item===undefined) return {status:'EMPTY',enhance:null};
  if (!OBJECT(item) || item.slot!==slot ||
      !Number.isSafeInteger(item.enh) || item.enh<0 || item.enh>7) {
    return {status:'INVALID_ITEM_OR_SLOT',enhance:null};
  }
  const enhance=item.enh;
  if (!OBJECT(item.stats)) return {status:'STATS_MISSING',enhance};
  if (item.stellarGuardian===true || item.petName==='Звёздный Хранитель')
    return {status:'SPECIAL_CLASS_ADAPTIVE_UNVERIFIED',enhance};
  if (enhance===0) return {status:'UNENHANCED_NO_RECALC',enhance};
  // For gear at +1..+7 the pre-sharpening base is REQUIRED. Inferring it
  // from already-multiplied stats silently compounds bonuses and can turn
  // an actual +7 weapon into a fictitious +7 power value.
  if (!OBJECT(item.enhBaseStats) || !Object.keys(item.enhBaseStats).length)
    return {status:'ENHANCEMENT_BASE_MISSING',enhance};
  if (Object.values(item.enhBaseStats).some(x=>!safeNumber(x)) ||
      Object.values(item.stats).some(x=>!safeNumber(x)))
    return {status:'NONFINITE_OR_UNSAFE_STATS',enhance};
  let expected;
  try {
    expected=applyOriginalEnhancementStats(structuredClone(item));
  } catch {
    return {status:'UNSUPPORTED_ENHANCEMENT',enhance};
  }
  if (!numbersMatch(expected.stats,item.stats))
    return {status:'SAVED_STATS_DIFFER_FROM_FORGE',enhance};
  return {status:'VERIFIED_AGAINST_ORIGINAL_FORGE',enhance,
    awakeningConfirmed:Object.keys(expected.awakeningBonuses||{}).length>0,
    petBonusConfirmed:slot==='pet' && !!expected.petEnhancementBonuses};
}

export function auditOriginalEquippedEnhancements(equipped) {
  if (!OBJECT(equipped)) return {
    source:'telegram-ppa:shared-sharpen-original',
    status:'LOADOUT_UNAVAILABLE',perSlot:null,verified:0,unverified:0
  };
  const perSlot={};
  let verified=0,unverified=0;
  for(const slot of GEAR_SLOTS) {
    const result=auditOne(slot,equipped[slot]);
    perSlot[slot]=result;
    if (result.status==='VERIFIED_AGAINST_ORIGINAL_FORGE') verified++;
    else if (result.status!=='EMPTY' && result.status!=='UNENHANCED_NO_RECALC') unverified++;
  }
  return {source:'telegram-ppa:shared-sharpen-original',
    status:unverified?'PARTIAL_OR_CONFLICT':'AVAILABLE_WITH_LIMITATIONS',
    perSlot,verified,unverified};
}
