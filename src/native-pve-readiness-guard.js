// A PURE fail-closed diagnostic for future Godot PvE combat participation.
//
// We have one existing Telegram PPA realtime server. Native sockets are
// currently OBSERVERS in the safe room, not server-authorized fighters.
// In particular, a saved D1 skill rank, native position and client-supplied
// HP/MP must NEVER turn a spectator into a fighter.
//
// This module neither authorizes nor performs attacks. It makes no mutations:
// no MP spend, cooldown start, buff, mob damage, XP, loot or D1 saves.
import {ORIGINAL_CLASS_BASE} from './native-original-class-rune-parity.js';
import {ORIGINAL_ACTIVE_SKILLS} from './native-original-active-catalog.generated.js';
import {originalRankEffect} from './native-original-passive-parity.js';

const obj = x => x!==null && typeof x==='object' && !Array.isArray(x);
const finite = x => typeof x==='number' && Number.isFinite(x);
const amount = (x,max=1e9) => finite(x) && x>=0 && x<=max;
const clock = x => Number.isSafeInteger(x) && x>=0;
const blankResult = () => ({
  readOnly:true,canAttack:false,canCast:false,canReceiveRewards:false,
  combatProfileAuthoritative:false,
  checks:{
    participation:'NOT_VERIFIED',identity:'NOT_VERIFIED',
    target:'NOT_VERIFIED',position:'NOT_VERIFIED',
    distance:'NOT_VERIFIED',mana:'NOT_VERIFIED',
    cooldown:'NOT_VERIFIED',buffs:'NOT_VERIFIED',
    skill:'NOT_VERIFIED',replay:'NOT_VERIFIED'
  },
  reference:null,blockers:[]
});

export function auditNativePveReadiness(intent, serverRuntime, mob, now, signedIdentity) {
  const out=blankResult();
  const block=(key,code) => {out.checks[key]=code;out.blockers.push(code)};
  if(!obj(intent) || typeof intent.room!=='string' ||
     typeof intent.key!=='string' || !['basic','skill'].includes(intent.action) ||
     typeof intent.requestId!=='string' || !clock(now)) {
    block('participation','INVALID_PREFLIGHT_INPUT');
    return out;
  }
  // A no-runtime rejection is the ONLY reachable state from the current
  // production-style Godot spectator route. Never derive the runtime from
  // attOf(ws), a query string or the legacy client-relayed combat snapshot.
  if(!obj(serverRuntime) ||
     serverRuntime.origin!=='server-dungeon-combat-runtime-v1') {
    block('participation','SERVER_COMBAT_RUNTIME_MISSING');
    return out;
  }
  if(!obj(signedIdentity) ||
     typeof signedIdentity.pid!=='string' ||
     typeof signedIdentity.ownerId!=='string' ||
     !signedIdentity.ownerId ||
     serverRuntime.ownerId!==signedIdentity.ownerId ||
     serverRuntime.pid!==signedIdentity.pid) {
    block('identity','SIGNED_OWNER_MISMATCH');
    return out;
  }
  out.checks.identity='SIGNED_OWNER_MATCH';
  if(serverRuntime.participating!==true ||
     serverRuntime.observer===true ||
     serverRuntime.room!==intent.room ||
     signedIdentity.room!==intent.room ||
     serverRuntime.dead===true) {
    block('participation','SERVER_COMBAT_PARTICIPATION_REQUIRED');
    return out;
  }
  out.checks.participation='SERVER_PARTICIPANT_REFERENCE';
  if(!obj(mob)||!(finite(mob.hp)&&mob.hp>0) ||
     !amount(mob.x,2822) || !amount(mob.y,2822) ||
     mob.room!==intent.room || mob.key!==intent.key) {
    block('target','SERVER_MOB_UNVERIFIED');
    return out;
  }
  out.checks.target='SERVER_MOB_PRESENT';
  const pos=serverRuntime.position;
  if(!obj(pos) || !amount(pos.x,2822) || !amount(pos.y,2822) ||
     pos.room!==intent.room || !clock(pos.serverAt) ||
     pos.serverAt>now || now-pos.serverAt>1500) {
    block('position','SERVER_POSITION_STALE_OR_MISSING');
    return out;
  }
  out.checks.position='SERVER_POSITION_FRESH';
  const classKey=serverRuntime.classKey;
  if(typeof classKey!=='string'||!Object.hasOwn(ORIGINAL_CLASS_BASE,classKey)) {
    block('distance','SERVER_CLASS_UNVERIFIED');
    return out;
  }
  const dx=pos.x-mob.x,dy=pos.y-mob.y;
  const distance=Math.hypot(dx,dy);
  // Original class reach is reference evidence, not a server-verified
  // collision/line-of-sight model. Skills can have totally different shapes.
  const reach=ORIGINAL_CLASS_BASE[classKey].range;
  out.reference={distance,originalClassRange:reach, classKey,
    skillManaPercent:null,skillCooldownSeconds:null,
    activeEffects:[]};
  out.checks.distance=distance<=reach?'CLASS_RANGE_REFERENCE':'OUT_OF_CLASS_RANGE_REFERENCE';
  if(distance>reach)out.blockers.push('OUT_OF_CLASS_RANGE_REFERENCE');

  if(!Array.isArray(serverRuntime.seenRequestIds) ||
     serverRuntime.seenRequestIds.some(x=>typeof x!=='string')) {
    block('replay','SERVER_REQUEST_HISTORY_MISSING');
  } else if(serverRuntime.seenRequestIds.includes(intent.requestId)) {
    block('replay','REPLAYED_REQUEST_ID');
  } else out.checks.replay='REQUEST_ID_REFERENCE_UNSEEN';

  // Trust no client-reported buff duration, mana or cooldown state:
  // serverRuntime is reserved for a future server-minted combat actor.
  if(!Array.isArray(serverRuntime.statusEffects) ||
     !clock(serverRuntime.buffsVersion) ||
     serverRuntime.statusEffects.some(v=>!obj(v) ||
       typeof v.id!=='string' || v.id.length>64 || v.id.length<1 ||
       !clock(v.expiresAt))) {
    block('buffs','SERVER_BUFF_STATE_MISSING');
  } else {
    out.checks.buffs='SERVER_BUFF_TIMELINE_REFERENCE';
    out.reference.activeEffects=serverRuntime.statusEffects
      .filter(v=>v.expiresAt>now).map(v=>({id:v.id,expiresAt:v.expiresAt}));
  }

  if(!amount(serverRuntime.mp)||!amount(serverRuntime.maxMp) ||
     serverRuntime.maxMp<1 || serverRuntime.mp>serverRuntime.maxMp) {
    block('mana','SERVER_MANA_MISSING');
  } else out.checks.mana='SERVER_MANA_REFERENCE';

  if(!obj(serverRuntime.cooldownUntil) ||
     Object.values(serverRuntime.cooldownUntil)
       .some(v=>!clock(v))) {
    block('cooldown','SERVER_COOLDOWNS_MISSING');
  } else out.checks.cooldown='SERVER_COOLDOWNS_REFERENCE';

  if(intent.action==='skill') {
    const catalog=ORIGINAL_ACTIVE_SKILLS[classKey];
    const item=catalog.find(s=>s.id===intent.skillId);
    const rank=serverRuntime.skillRanks?.[intent.skillId];
    if(!item || !Number.isSafeInteger(rank) || rank<1 || rank>5) {
      block('skill','SKILL_NOT_VERIFIED_FOR_CLASS_OR_RANK');
    } else {
      const cd=originalRankEffect(item.cd,rank);
      if(!finite(cd)||cd<=0) {
        block('skill','SKILL_COOLDOWN_REFERENCE_INVALID');
      } else {
        out.checks.skill='CLASS_SKILL_REFERENCE';
        out.reference.skillCooldownSeconds=cd;
        out.reference.skillManaPercent=item.mp;
        // Metadata labels MP as a percentage of total. We do not assume
        // effective cost/rounding until the live caster has exact parity.
        if(out.checks.mana==='SERVER_MANA_REFERENCE') {
          const estimated=serverRuntime.maxMp*item.mp/100;
          out.reference.manaCostEstimate=estimated;
          if(serverRuntime.mp<estimated)block('mana','MANA_BELOW_REFERENCE_COST');
        }
        if(out.checks.cooldown==='SERVER_COOLDOWNS_REFERENCE') {
          const until=serverRuntime.cooldownUntil[item.id];
          if(!clock(until))block('cooldown','SKILL_COOLDOWN_HISTORY_MISSING');
          else if(until>now)block('cooldown','SKILL_ON_REFERENCE_COOLDOWN');
        }
      }
    }
    block('distance','SKILL_GEOMETRY_NOT_SERVER_VERIFIED');
  } else {
    out.checks.skill='BASIC_ACTION_REFERENCE';
    // The native basic attack still needs server-owned cooldown, collision
    // checks and target visibility: the class range alone is insufficient.
    block('cooldown','BASIC_ATTACK_TIMING_NOT_SERVER_VERIFIED');
  }
  // Never mark combat ready, even with green reference diagnostics: the
  // original Telegram client resolves combat and rewards via its own path.
  out.blockers.push('SERVER_DAMAGE_AND_SETTLEMENT_NOT_READY');
  return out;
}
