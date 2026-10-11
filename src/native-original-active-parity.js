// Exact V189 active skill rank metadata read-only reference.
// This module does NOT cast abilities, start cooldowns, consume MP, deal
// damage, heal, resurrect, apply any status effect or issue rewards.
import {ORIGINAL_ACTIVE_SKILLS} from './native-original-active-catalog.generated.js';
import {originalRankEffect} from './native-original-passive-parity.js';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

export function auditOriginalActiveSkillRanks(state,registeredClass) {
  const fail=(status)=>({
    source:'telegram-ppa-original-v189-active-skill',
    status,readOnly:true,canCast:false,canAttack:false,
    activeSkills:null,authoritativeCooldowns:null
  });
  if(!object(state)||typeof registeredClass!=='string'||
     !Object.hasOwn(ORIGINAL_ACTIVE_SKILLS,registeredClass))
    return fail('CLASS_UNVERIFIED');
  if(!object(state.skillRanks))return fail('SKILL_RANKS_MISSING');
  const entries=[];
  for(const spec of ORIGINAL_ACTIVE_SKILLS[registeredClass]){
    const r=state.skillRanks[spec.id]??0;
    if(!Number.isSafeInteger(r)||r<0||r>5)
      return fail('SKILL_RANK_INVALID');
    const cdReference=r===0?null:originalRankEffect(spec.cd,r);
    if(r>0 && (cdReference===null||!Number.isFinite(cdReference)||cdReference<=0))
      return fail('SKILL_COOLDOWN_UNVERIFIED');
    entries.push({id:spec.id,rank:r,unlockedInSave:r>0,
      cooldownSecondsReference:cdReference,
      manaPctReference:spec.mp});
  }
  return {
    source:'telegram-ppa-original-v189-active-skill',
    status:'REFERENCE_ACTIVE_ONLY',
    readOnly:true,canCast:false,canAttack:false,
    activeSkills:entries,authoritativeCooldowns:null,
    serverManaVerified:false,serverCastingPositionVerified:false,
    statusEffectsVerified:false,serverCooldownStateVerified:false
  };
}
