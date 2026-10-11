// PPA shared PvE: OFFLINE server-owned combat-state prototype.
// This module has NO WebSocket route, D1 writer, or rewards side effects.
// NEVER populate it from a Telegram client move, Godot position, saved D1
// hp/mp/atk fields, or any packet. Only synthetic fixtures are accepted until
// a real authoritative world/profile provider exists for BOTH clients.
import {ORIGINAL_CLASS_BASE} from './native-original-class-rune-parity.js';
import {ORIGINAL_ACTIVE_SKILLS} from './native-original-active-catalog.generated.js';
import {originalRankEffect} from './native-original-passive-parity.js';

const PID=/^p:[a-f0-9]{32}$/;
const OWNER=/^\d{1,24}$/;
const ROOM=/^dungeon-(?:1-20|21-40|41-60)-i[1-9][0-9]{0,5}$/;
const finite=x=>typeof x==='number' && Number.isFinite(x);
const uint=(x,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const point=(x)=>x && typeof x==='object' && !Array.isArray(x) &&
  finite(x.x) && finite(x.y) && x.x>=0 && x.x<=2822 && x.y>=0 && x.y<=2822;
const object=x=>x!==null && typeof x==='object' && !Array.isArray(x);
const deny=code=>Object.freeze({ok:false,code,canAttack:false,canCast:false,canReceiveRewards:false});
const MAX_LEASE_MS=30_000;
const MAX_EFFECTS=32;
const MAX_COOLDOWNS=32;
const SEED_KEYS=new Set(['origin','room','pid','ownerId','classKey','saveVersion',
  'revision','maxHp','maxMp','hp','mp','position','skillRanks','cooldownUntil',
  'statusEffects']);
const TICK_KEYS=new Set(['origin','revision','hp','mp','position','cooldownUntil',
  'statusEffects']);
const onlyKeys=(value,allowed)=>Object.keys(value).every(k=>allowed.has(k));

// A testable contract for the future actual server-side combat state.
// The fixture-only provenance is intentional: do not accidentally treat
// the legacy client's values as server-verified runtime facts.
export class NativePveAuthorityStateLab {
  #byOwner=new Map();
  #bySocket=new WeakMap();

  #lookup(socket,evidence,now) {
    if(!socket||typeof socket!=='object'||!object(evidence)||!uint(now)||
       evidence.signedNative!==true||!PID.test(evidence.pid||'')||
       !OWNER.test(evidence.ownerId||'')||!ROOM.test(evidence.room||''))return null;
    const entry=this.#bySocket.get(socket);
    if(!entry||this.#byOwner.get(entry.ownerId)!==entry||
       entry.pid!==evidence.pid||entry.ownerId!==evidence.ownerId||
       entry.room!==evidence.room||now>=entry.expiresAt)return null;
    return entry;
  }

  startFixture(socket,evidence,fixture,now) {
    if(!socket||typeof socket!=='object'||!object(evidence)||!uint(now)||
       evidence.signedNative!==true||!PID.test(evidence.pid||'')||
       !OWNER.test(evidence.ownerId||'')||!ROOM.test(evidence.room||'')||
       !object(fixture)||!onlyKeys(fixture,SEED_KEYS)||
       fixture.origin!=='synthetic-pve-test-only'||
       fixture.room!==evidence.room||fixture.pid!==evidence.pid||
       fixture.ownerId!==evidence.ownerId||
       !Object.hasOwn(ORIGINAL_CLASS_BASE,fixture.classKey)||
       !uint(fixture.saveVersion)||!uint(fixture.revision)||
       !uint(fixture.maxHp,1e9)||fixture.maxHp<1||
       !uint(fixture.maxMp,1e9)||fixture.maxMp<1||
       !uint(fixture.hp,fixture.maxHp)||!uint(fixture.mp,fixture.maxMp)||
       !point(fixture.position)||!uint(fixture.position.serverAt)||
       fixture.position.serverAt>now||
       !object(fixture.skillRanks)||
       Object.entries(fixture.skillRanks).some(([k,v])=>
         !/^[a-z][a-z0-9_]{1,39}$/.test(k) || !uint(v,5))||
       !object(fixture.cooldownUntil)||
       Object.keys(fixture.cooldownUntil).length>MAX_COOLDOWNS||
       Object.entries(fixture.cooldownUntil).some(([k,v])=>
         !/^[a-z][a-z0-9_]{1,39}$/.test(k)||!uint(v))||
       !Array.isArray(fixture.statusEffects)||
       fixture.statusEffects.length>MAX_EFFECTS||
       fixture.statusEffects.some(x=>!object(x)||
         typeof x.id!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(x.id)||
         !uint(x.expiresAt)))return deny('UNVERIFIED_SYNTHETIC_SEED');
    if(!ORIGINAL_ACTIVE_SKILLS[fixture.classKey] ||
       Object.keys(fixture.skillRanks).some(k=>
         !ORIGINAL_ACTIVE_SKILLS[fixture.classKey].some(skill=>skill.id===k)))
      return deny('SKILL_CLASS_MISMATCH');
    const old=this.#byOwner.get(evidence.ownerId);
    if(old)this.revoke(old.socket);
    const entry={
      socket,ownerId:evidence.ownerId,pid:evidence.pid,room:evidence.room,
      classKey:fixture.classKey,saveVersion:fixture.saveVersion,
      revision:fixture.revision,serverAt:now,expiresAt:now+MAX_LEASE_MS,
      hp:fixture.hp,maxHp:fixture.maxHp,mp:fixture.mp,maxMp:fixture.maxMp,
      position:{x:fixture.position.x,y:fixture.position.y,serverAt:fixture.position.serverAt},
      skillRanks:{...fixture.skillRanks},
      cooldownUntil:{...fixture.cooldownUntil},
      statusEffects:fixture.statusEffects.map(x=>({id:x.id,expiresAt:x.expiresAt}))
    };
    this.#byOwner.set(entry.ownerId,entry);
    this.#bySocket.set(socket,entry);
    return this.inspect(socket,evidence,now);
  }

  // This transition is deliberately server-internal: it accepts a complete
  // later simulator tick, NOT attack intent and NOT a client-reported delta.
  // Never invoke from a WebSocket payload or call it on the live Durable Object.
  applySyntheticServerTick(socket,evidence,tick,now) {
    const entry=this.#lookup(socket,evidence,now);
    if(!entry)return deny('SERVER_STATE_ABSENT_OR_STALE');
    if(!object(tick)||!onlyKeys(tick,TICK_KEYS)||
       tick.origin!=='synthetic-server-tick-only'||
       tick.revision!==entry.revision+1||
       !uint(tick.hp,entry.maxHp)||!uint(tick.mp,entry.maxMp)||
       !point(tick.position)||!uint(tick.position.serverAt)||
       tick.position.serverAt<entry.position.serverAt||
       tick.position.serverAt>now||
       !object(tick.cooldownUntil)||
       Object.keys(tick.cooldownUntil).length>MAX_COOLDOWNS||
       Object.entries(tick.cooldownUntil).some(([k,v])=>
         !/^[a-z][a-z0-9_]{1,39}$/.test(k)||!uint(v))||
       !Array.isArray(tick.statusEffects)||
       tick.statusEffects.length>MAX_EFFECTS||
       tick.statusEffects.some(x=>!object(x)||typeof x.id!=='string'||
         !/^[a-z][a-z0-9_-]{0,63}$/.test(x.id)||!uint(x.expiresAt))) {
      return deny('INVALID_OR_REPLAYED_SERVER_TICK');
    }
    // The only mutation is to this private memory-only synthetic record.
    entry.hp=tick.hp;entry.mp=tick.mp;entry.revision=tick.revision;
    entry.position={x:tick.position.x,y:tick.position.y,serverAt:tick.position.serverAt};
    entry.cooldownUntil={...tick.cooldownUntil};
    entry.statusEffects=tick.statusEffects.map(x=>({id:x.id,expiresAt:x.expiresAt}));
    entry.serverAt=now;
    return this.inspect(socket,evidence,now);
  }

  inspect(socket,evidence,now) {
    const entry=this.#lookup(socket,evidence,now);
    if(!entry)return deny('SERVER_STATE_ABSENT_OR_STALE');
    const position={...entry.position,room:entry.room};
    return Object.freeze({ok:true,code:'SYNTHETIC_STATE_ONLY',
      origin:'synthetic-pve-test-only',ownerBound:true,
      room:entry.room,pid:entry.pid,classKey:entry.classKey,
      saveVersion:entry.saveVersion,revision:entry.revision,
      hp:entry.hp,maxHp:entry.maxHp,mp:entry.mp,maxMp:entry.maxMp,
      position:Object.freeze(position),
      cooldownUntil:Object.freeze({...entry.cooldownUntil}),
      statusEffects:Object.freeze(entry.statusEffects.map(x=>Object.freeze({...x}))),
      dead:entry.hp===0,expiresAt:entry.expiresAt,
      participating:false,observer:true,readOnly:true,
      canJoin:false,canAttack:false,canCast:false,canReceiveRewards:false
    });
  }

  checkAbilityReference(socket,evidence,skillId,now) {
    const entry=this.#lookup(socket,evidence,now);
    if(!entry)return deny('SERVER_STATE_ABSENT_OR_STALE');
    if(entry.hp===0)return deny('SERVER_ACTOR_DEAD');
    if(!uint(entry.position.serverAt)||now-entry.position.serverAt>1500)
      return deny('SERVER_POSITION_STALE');
    const skill=ORIGINAL_ACTIVE_SKILLS[entry.classKey].find(x=>x.id===skillId);
    const rank=entry.skillRanks[skillId];
    if(!skill||!uint(rank,5)||rank<1)return deny('SKILL_CLASS_OR_RANK_UNVERIFIED');
    const cd=originalRankEffect(skill.cd,rank);
    if(!finite(cd)||cd<=0)return deny('SKILL_REFERENCE_UNVERIFIED');
    const cooldown=entry.cooldownUntil[skillId];
    if(!uint(cooldown))return deny('SERVER_COOLDOWN_MISSING');
    if(cooldown>now)return deny('SERVER_SKILL_ON_COOLDOWN');
    // MP percent is reference metadata; the original caster's rounding
    // and effect geometry have NOT been verified for live settlement.
    const mpEstimate=entry.maxMp*skill.mp/100;
    if(entry.mp<mpEstimate)return deny('SERVER_MANA_INSUFFICIENT_REFERENCE');
    return Object.freeze({ok:true,code:'REFERENCE_ONLY_NOT_CASTABLE',
      skillId,rank,cooldownSecondsReference:cd,mpCostEstimate:mpEstimate,
      canAttack:false,canCast:false,canReceiveRewards:false,readOnly:true});
  }

  revoke(socket) {
    if(!socket||typeof socket!=='object')return false;
    const entry=this.#bySocket.get(socket);
    if(!entry)return false;
    if(this.#byOwner.get(entry.ownerId)===entry)
      this.#byOwner.delete(entry.ownerId);
    this.#bySocket.delete(socket);
    return true;
  }
}
