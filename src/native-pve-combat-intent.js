// PPA Godot PvE stage 1: strict, pure combat-intent contract.
//
// This module NEVER calculates HP/damage/drops and never accepts a client
// damage number. Executing combat needs a later signed server combat profile,
// authoritative position, ability registry and shared Telegram economy path.
export const NATIVE_PVE_INTENT_TYPE = 'dungeon-combat-intent';

const BASES = new Set(['dungeon-1-20','dungeon-21-40','dungeon-41-60']);
const INSTANCE_ROOM = /^(dungeon-(?:1-20|21-40|41-60))-i([1-9][0-9]{0,5})$/;
const TARGET = /^(?:s(?:0|[1-9][0-9]{0,3})|p20|b40|b60)$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const SKILL_ID = /^[a-z][a-z0-9_]{1,39}$/;
const ALLOWED_KEYS = new Set(['type','room','key','action','skillId','requestId']);

export function validateNativePveIntent(value) {
  const deny = code => ({ ok:false, code });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return deny('INVALID_INTENT');
  if (value.type !== NATIVE_PVE_INTENT_TYPE) return deny('INVALID_INTENT');
  // Never silently ignore a forged value of damage, stats, level, mana,
  // price, reward, cooldown, position or client timestamp.
  if (Object.keys(value).some(key => !ALLOWED_KEYS.has(key))) return deny('UNTRUSTED_FIELD');
  if (typeof value.room !== 'string' || !INSTANCE_ROOM.test(value.room)) return deny('INVALID_ROOM');
  const match = value.room.match(INSTANCE_ROOM);
  if (!match || !BASES.has(match[1])) return deny('INVALID_ROOM');
  if (typeof value.key !== 'string' || !TARGET.test(value.key)) return deny('INVALID_TARGET');
  if (typeof value.requestId !== 'string' || !REQUEST_ID.test(value.requestId)) return deny('INVALID_REQUEST_ID');
  if (value.action !== 'basic' && value.action !== 'skill') return deny('INVALID_ACTION');
  if (value.action === 'basic' && Object.hasOwn(value, 'skillId')) return deny('UNTRUSTED_FIELD');
  if (value.action === 'skill' && (typeof value.skillId !== 'string' || !SKILL_ID.test(value.skillId))) {
    return deny('INVALID_SKILL_ID');
  }
  return { ok:true, intent: Object.freeze({
    room:value.room, key:value.key, action:value.action,
    skillId:value.action==='skill'?value.skillId:null,
    requestId:value.requestId,
  }) };
}
