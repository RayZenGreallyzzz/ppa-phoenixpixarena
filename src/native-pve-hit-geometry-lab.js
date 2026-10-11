// ISOLATED PPA PvE hit geometry laboratory: NO live authority, damage or rewards.
// Uses the synthetic-only server actor lab and private synthetic mob generations.
// Never import in Worker/realtime, seed from a client packet or convert its
// reference verdict into permission to apply damage.
import {NativePveAuthorityStateLab} from './native-pve-authority-state-lab.js';
import {ORIGINAL_CLASS_BASE} from './native-original-class-rune-parity.js';
import {validateNativePveIntent} from './native-pve-combat-intent.js';

const ROOM=/^dungeon-(?:1-20|21-40|41-60)-i[1-9][0-9]{0,5}$/;
const KEY=/^(?:s(?:0|[1-9][0-9]{0,3})|p20|b40|b60)$/;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const uint=(x,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const point=p=>p&&typeof p==='object'&&!Array.isArray(p)&&
  finite(p.x)&&finite(p.y)&&p.x>=0&&p.x<=2822&&p.y>=0&&p.y<=2822;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const only=(o,keys)=>Object.keys(o).every(k=>keys.includes(k));
const seedKeys=['origin','room','key','generation','revision','hp','maxHp','position','radius','barriers'];
const tickKeys=['origin','room','key','generation','revision','hp','position'];
const deny=(code)=>Object.freeze({ok:false,code,readOnly:true,
  canAttack:false,canCast:false,canReceiveRewards:false,damage:null});

function validBarrier(b) {
  return object(b)&&only(b,['minX','minY','maxX','maxY'])&&
    [b.minX,b.minY,b.maxX,b.maxY].every(finite)&&
    b.minX>=0&&b.minY>=0&&b.maxX<=2822&&b.maxY<=2822&&
    b.maxX>b.minX&&b.maxY>b.minY;
}
// Liang-Barsky segment clipping; touching any wall edge counts as blocked.
// This models ONLY synthetic rectangles, not the real PPA tile collision map.
function segmentHitsRect(a,b,r) {
  const dx=b.x-a.x,dy=b.y-a.y;
  let lo=0,hi=1;
  for(const [p,q] of [
    [-dx,a.x-r.minX],[dx,r.maxX-a.x],
    [-dy,a.y-r.minY],[dy,r.maxY-a.y]
  ]) {
    if(Math.abs(p)<1e-10) {if(q<0)return false;continue;}
    const t=q/p;
    if(p<0) lo=Math.max(lo,t);
    else hi=Math.min(hi,t);
    if(lo>hi)return false;
  }
  return true;
}

export class NativePveHitGeometryLab {
  #actors;
  #mobs=new Map();
  #requests=new WeakMap();

  constructor(actors) {
    if(!(actors instanceof NativePveAuthorityStateLab))
      throw new TypeError('Synthetic actor authority laboratory required');
    this.#actors=actors;
  }

  seedSyntheticMob(seed,now) {
    if(!object(seed)||!only(seed,seedKeys)||
       seed.origin!=='synthetic-server-mob-only'||
       !ROOM.test(seed.room||'')||!KEY.test(seed.key||'')||
       !uint(seed.generation)||seed.generation<1||
       !uint(seed.revision)||!uint(seed.hp,10_000_000)||
       !uint(seed.maxHp,10_000_000)||seed.maxHp<1||
       seed.hp>seed.maxHp||!point(seed.position)||
       !uint(seed.position.serverAt)||!uint(now)||
       seed.position.serverAt>now||
       !finite(seed.radius)||seed.radius<0||seed.radius>150||
       !Array.isArray(seed.barriers)||seed.barriers.length>32||
       seed.barriers.some(b=>!validBarrier(b)))return deny('UNVERIFIED_SYNTHETIC_MOB');
    const id=seed.room+'|'+seed.key;
    const old=this.#mobs.get(id);
    if(old && seed.generation<=old.generation)
      return deny('MOB_GENERATION_REPLAYED');
    const record={room:seed.room,key:seed.key,
      generation:seed.generation,revision:seed.revision,
      hp:seed.hp,maxHp:seed.maxHp,radius:seed.radius,
      position:{x:seed.position.x,y:seed.position.y,serverAt:seed.position.serverAt},
      barriers:seed.barriers.map(b=>({...b}))};
    this.#mobs.set(id,record);
    return Object.freeze({ok:true,code:'SYNTHETIC_MOB_TRACKED',readOnly:true,
      canAttack:false,canReceiveRewards:false,generation:record.generation});
  }

  tickSyntheticMob(tick,now) {
    if(!object(tick)||!only(tick,tickKeys)||
       tick.origin!=='synthetic-server-mob-tick-only'||
       !ROOM.test(tick.room||'')||!KEY.test(tick.key||'')||
       !uint(now)||!uint(tick.generation)||!uint(tick.revision)||
       !point(tick.position)||!uint(tick.position.serverAt)||
       tick.position.serverAt>now)return deny('INVALID_SYNTHETIC_MOB_TICK');
    const m=this.#mobs.get(tick.room+'|'+tick.key);
    if(!m||tick.generation!==m.generation||
       tick.revision!==m.revision+1||!uint(tick.hp,m.maxHp)||
       tick.position.serverAt<m.position.serverAt)
      return deny('STALE_MOB_GENERATION_OR_REVISION');
    m.hp=tick.hp;m.revision=tick.revision;
    m.position={x:tick.position.x,y:tick.position.y,serverAt:tick.position.serverAt};
    return Object.freeze({ok:true,code:'SYNTHETIC_MOB_MOVED',readOnly:true,
      canAttack:false,canReceiveRewards:false,revision:m.revision});
  }

  referenceBasicHit(socket,evidence,command,now) {
    if(!uint(now))return deny('INVALID_SERVER_CLOCK');
    // Never ask the client to provide ATK, range, a spawn generation or HP.
    const parsed=validateNativePveIntent(command);
    if(!parsed.ok)return deny(parsed.code);
    const intent=parsed.intent;
    if(intent.action!=='basic')return deny('SKILL_GEOMETRY_NOT_PORTED');
    const actor=this.#actors.inspect(socket,evidence,now);
    if(!actor.ok||actor.origin!=='synthetic-pve-test-only')
      return deny('VERIFIED_ACTOR_NOT_PRESENT');
    if(actor.room!==intent.room||actor.position?.room!==intent.room||
       evidence?.pid!==actor.pid||actor.hp<=0)
      return deny('ACTOR_ROOM_OR_LIFE_UNVERIFIED');
    if(!uint(actor.position.serverAt)||
       actor.position.serverAt>now||now-actor.position.serverAt>1500)
      return deny('SERVER_ACTOR_POSITION_STALE');
    const mob=this.#mobs.get(intent.room+'|'+intent.key);
    if(!mob)return deny('SERVER_MOB_GENERATION_MISSING');
    if(mob.hp<=0)return deny('TARGET_DEAD');
    if(mob.position.serverAt>now||now-mob.position.serverAt>2000)
      return deny('SERVER_MOB_POSITION_STALE');
    const c=ORIGINAL_CLASS_BASE[actor.classKey];
    if(!c||!finite(c.range)||!finite(c.atkSpd)||c.atkSpd<=0)
      return deny('CLASS_ATTACK_METADATA_MISSING');
    const distance=Math.hypot(actor.position.x-mob.position.x,
      actor.position.y-mob.position.y);
    // Radius represents only the synthetic mob's hitbox; original PPA melee
    // body-edge/slack and projectile trajectories must be audited separately.
    const referenceReach=c.range+mob.radius;
    if(distance>referenceReach)return deny('OUT_OF_REFERENCE_RANGE');
    if(mob.barriers.some(r=>segmentHitsRect(actor.position,mob.position,r)))
      return deny('SYNTHETIC_LINE_OF_SIGHT_BLOCKED');

    const perSocket=this.#requests.get(socket)||{seen:new Set(),nextAt:0};
    if(perSocket.seen.has(intent.requestId))return deny('REPLAYED_HIT_INTENT');
    if(perSocket.seen.size>=64)return deny('HIT_REFERENCE_HISTORY_FULL');
    if(now<perSocket.nextAt)return deny('REFERENCE_ATTACK_COOLDOWN');

    perSocket.seen.add(intent.requestId);
    perSocket.nextAt=now+Math.max(1,Math.ceil(1000/c.atkSpd));
    this.#requests.set(socket,perSocket);
    // This is *NOT* damage authorization. There is no server-authoritative
    // ATK/DEF, original crit/dodge, real navmesh LOS, or hit settlement yet.
    const candidate=Object.freeze({room:mob.room,key:mob.key,
      generation:mob.generation,mobRevision:mob.revision,
      actorRevision:actor.revision,distance,referenceReach,
      attackIntervalMsReference:Math.ceil(1000/c.atkSpd)});
    return Object.freeze({ok:true,code:'SYNTHETIC_HIT_GEOMETRY_REFERENCE_ONLY',
      candidate,damage:null,readOnly:true,canAttack:false,canCast:false,
      canReceiveRewards:false});
  }

  clearSocket(socket) {
    if(!socket||typeof socket!=='object')return false;
    return this.#requests.delete(socket);
  }
}
