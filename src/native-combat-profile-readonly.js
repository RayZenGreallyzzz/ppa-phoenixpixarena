import { auditOriginalStatAllocation, auditOriginalEquippedEnhancements } from './native-combat-stat-parity.js';
import { auditOriginalClassRuneReference } from './native-original-class-rune-parity.js';
import { auditOriginalPassiveSkills } from './native-original-passive-parity.js';
import { auditOriginalActiveSkillRanks } from './native-original-active-parity.js';

// Staging-only audit of the ORIGINAL Telegram PPA D1 save for native combat.
//
// Do not call this an executable combat profile. Legacy Telegram runtime
// derives effective ATK/DEF/HP/MP/crit, cooldowns, buffs and skills in JS,
// and some older save fields were authored by the web client. A D1 record is
// evidence of a saved loadout, not a certified damage or rewards formula.
const CLASSES = new Set([
  'gnome','tank','barbarian','paladin','archer','mage','assassin','priest'
]);
const SLOTS = [
  'weapon','helmet','armor','gloves','ring','legs','boots','necklace',
  'artifact','cloak','wings','pet'
];
const STAT_KEYS = [
  'hp','mp','atk','def','spd','atkspd','critdmg','crit','dodge'
];
const safeObject = v => v && typeof v === 'object' && !Array.isArray(v) ? v : null;
const unsigned = (v,max) => Number.isSafeInteger(v) && v>=0 && v<=max ? v : null;
const id = v => typeof v==='string' && /^[A-Za-z0-9:_-]{1,96}$/.test(v) ? v : null;

export function projectNativeCombatProfileReadOnly(saved) {
  if (!saved || !safeObject(saved.state) || saved.bootstrapFromProfile) return null;
  const state = saved.state, profile = safeObject(saved.profile);
  const profileClass = String(profile?.classKey || '').trim().toLowerCase();
  const saveClass = String(state.classKey || state.cls || '').trim().toLowerCase();
  // A signed account is mapped to the same existing Telegram owner in
  // worker.js. Class in the registered players table outranks save.cls.
  const classKey = CLASSES.has(profileClass) ? profileClass : null;
  const classMatches = !!classKey && (!saveClass || saveClass===classKey);
  const level = unsigned(state.lvl ?? state.level, 999);
  const allocations = safeObject(state.statAlloc);
  const allocatedStats = Object.fromEntries(STAT_KEYS.map(k =>
    [k,allocations ? unsigned(allocations[k] ?? 0,100000) : null]));
  const equipment = safeObject(state.equipped);
  const equipped = Object.fromEntries(SLOTS.map(slot => {
    const item = equipment ? safeObject(equipment[slot]) : null;
    if (!item) return [slot,null];
    return [slot,{
      uid:id(item.uid),slot,
      enhance:unsigned(item.enh ?? item.enhance ?? 0,100),
      classKey: typeof item.classKey==='string'?item.classKey.slice(0,32):null
    }];
  }));
  // skillRanks is original Telegram progression, NOT proof that an ability
  // may be cast: no server-runnable skill registry yet exists.
  const ranks = safeObject(state.skillRanks);
  const skillRanks = ranks
    ? Object.fromEntries(Object.entries(ranks).filter(([k])=>id(k))
        .slice(0,100).map(([k,v])=>[k,unsigned(v,5)]))
    : null;
  const failures = [];
  if (!classKey) failures.push('REGISTERED_CLASS_MISSING');
  if (!classMatches) failures.push('CLASS_SAVE_CONFLICT');
  if (level===null || level<1) failures.push('LEVEL_NOT_VERIFIED');
  if (!allocations) failures.push('STAT_ALLOCATIONS_NOT_PRESENT');
  if (!equipment) failures.push('EQUIPPED_LOADOUT_NOT_PRESENT');
  if (!ranks) failures.push('SKILL_RANKS_NOT_PRESENT');
  const allocationParity = auditOriginalStatAllocation(allocations);
  const equippedEnhancementParity = auditOriginalEquippedEnhancements(equipment);
  const classRuneParity = auditOriginalClassRuneReference(state,classKey);
  const passiveParity = auditOriginalPassiveSkills(state,classKey);
  const activeSkillParity = auditOriginalActiveSkillRanks(state,classKey);
  if (!allocationParity.allStaticCapsSatisfied) failures.push('STAT_ALLOCATION_CAPS_NOT_VERIFIED');
  if (equippedEnhancementParity.unverified) failures.push('EQUIPPED_ENHANCEMENTS_PARTIALLY_UNVERIFIED');
  if (classRuneParity.status !== 'REFERENCE_PARITY_ONLY') failures.push('CLASS_RUNE_'+classRuneParity.status);
  if (passiveParity.status !== 'REFERENCE_PASSIVE_ONLY') failures.push('PASSIVE_'+passiveParity.status);
  if (activeSkillParity.status !== 'REFERENCE_ACTIVE_ONLY') failures.push('ACTIVE_SKILL_'+activeSkillParity.status);
  failures.push('SERVER_CLAN_MEMBERSHIP_AND_BUFF_RANKS_NOT_VERIFIED');
  // Even when all saved fields are present: cannot attack from this record.
  failures.push('TELEGRAM_RUNTIME_STAT_FORMULAS_NOT_PORTED');
  failures.push('SERVER_SKILL_REGISTRY_AND_COOLDOWNS_NOT_PORTED');
  failures.push('SIGNED_DUNGEON_COMBAT_PARTICIPATION_NOT_READY');
  failures.push('SERVER_DAMAGE_AND_REWARD_SETTLEMENT_NOT_READY');
  return {
    readOnly:true, actionsEnabled:false, canAttack:false, canCast:false,
    canReceiveRewards:false, authoritativeCombatStats:null,
    source:'original-telegram-ppa-d1-save',
    version: saved.version,
    updatedAt: Number.isSafeInteger(saved.updatedAt) ? saved.updatedAt : null,
    candidate:{
      registeredClass:classKey, classMatchesSave:classMatches,
      level, statPointsRemaining:unsigned(state.statPts,100000),
      allocatedStats, equipped, skillRanks,
      // Audit statuses only. These are NOT effective or executable combat
      // stats, and cannot be trusted to compute actual damage yet.
      allocationParity, equippedEnhancementParity, classRuneParity, passiveParity, activeSkillParity,
      clanBonusStatus:'SERVER_CLAN_MEMBERSHIP_AND_BUFF_RANKS_NOT_VERIFIED'
    },
    blockedReasons:failures
  };
}
