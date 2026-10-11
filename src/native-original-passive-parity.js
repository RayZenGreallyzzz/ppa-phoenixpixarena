// Original Telegram PPA V189 + ranked-grimoire V compatibility.
// Only produces a read-only numerical reference. It does NOT grant any
// skill, cast, cooldown, passive ownership, HP update, rewards or combat hit.
// Canonical original skill data was extracted from the checksummed PPA build.
import {ORIGINAL_PASSIVE_SKILLS} from './native-original-passive-catalog.generated.js';

const finite=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e8;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const ratioForRank=rank=>rank===4?160/140:180/140;

// Exact original V189 rv() with the current build.mjs rank IV-V patch:
// r<=3 => array indexed at I/II/III; IV/V scale the III effect by 160/140,
// 180/140 for improvements and divide for "lower is stronger" values.
export function originalRankEffect(referenceValues, rank) {
  if(!Array.isArray(referenceValues)||referenceValues.length!==3||
     referenceValues.some(v=>!finite(v))||
     !Number.isSafeInteger(rank)||rank<1||rank>5) return null;
  if(rank<=3)return referenceValues[rank-1];
  const [,,third]=referenceValues,second=referenceValues[1];
  if(third===second)return third;
  const mul=ratioForRank(rank);
  return third>second?third*mul:third/mul;
}

export function auditOriginalPassiveSkills(state,classKey) {
  const failed=(status)=>({
    source:'telegram-ppa-original-v189-passives',
    status,readOnly:true,canAttack:false,canCast:false,
    effectiveCombatStats:null,passiveBonuses:null
  });
  if(!plain(state)||typeof classKey!=='string'||
     !Object.hasOwn(ORIGINAL_PASSIVE_SKILLS,classKey))
    return failed('REGISTERED_CLASS_UNVERIFIED');
  const skillRanks=state.skillRanks;
  if(!plain(skillRanks))return failed('SKILL_RANKS_UNVERIFIED');
  const totals={};
  const activePassives=[];
  for(const descriptor of ORIGINAL_PASSIVE_SKILLS[classKey]){
    const raw=skillRanks[descriptor.id]??0;
    if(!Number.isSafeInteger(raw)||raw<0||raw>5)
      return failed('PASSIVE_RANK_UNVERIFIED');
    if(raw===0)continue;
    const value=originalRankEffect(descriptor.v,raw);
    if(!finite(value))return failed('PASSIVE_EFFECT_OVERFLOW');
    totals[descriptor.k]=(totals[descriptor.k]||0)+value;
    activePassives.push({id:descriptor.id,rank:raw,
      stat:descriptor.k,value});
  }
  if(Object.values(totals).some(v=>!finite(v)))return failed('PASSIVE_TOTAL_OVERFLOW');
  // Passive effects are not the whole combat picture: some are multiplied
  // after the original base recompute and after dynamic clan HP/MP multipliers.
  // Never expose preview values as effective ATK/HP/etc.
  return {
    source:'telegram-ppa-original-v189-passives',
    status:'REFERENCE_PASSIVE_ONLY',
    readOnly:true,canAttack:false,canCast:false,effectiveCombatStats:null,
    passiveBonuses:totals,activePassives,
    classKey,rankMax:5,classBound:true,
    liveClanMultipliersVerified:false,
    activeSkillsAndCooldownsVerified:false,
    runtimeHpMpVerified:false
  };
}
