// In-memory, server-only shadow actor for PPA Godot's FUTURE shared dungeon.
// This is NOT a fighter, combat profile, authorization token or reward ledger.
// No HP/MP or position is ever taken from a client, a saved Telegram profile,
// or the movement-only socket. Missing canonical live vitals remain NULL.
// Loss of Durable Object memory deliberately loses this diagnostic lease.
const ROOM=/^dungeon-(?:1-20|21-40|41-60)-i[1-9][0-9]{0,5}$/;
const PID=/^p:[a-f0-9]{32}$/;
const OWNER=/^\d{1,24}$/;
const RID=/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const LEASE_MS=30_000;
const MAX_IDS=64;
const clock=n=>Number.isSafeInteger(n)&&n>=0;
const blocked=code=>Object.freeze({ok:false,code,canJoin:false,canAttack:false,canReceiveRewards:false});

export class NativeDungeonShadowActors {
  #byOwner=new Map();
  #bySocket=new WeakMap();

  #valid(socket, evidence, now) {
    if(!socket || typeof socket!=='object' || !evidence || !clock(now) ||
       evidence.signedNative!==true || !PID.test(evidence.pid || '') ||
       !OWNER.test(evidence.ownerId || '') || evidence.currentRoom!=='safe' ||
       !ROOM.test(evidence.observerRoom || '')) return false;
    return true;
  }

  stage(socket, evidence, admission, now) {
    if(!this.#valid(socket,evidence,now) ||
       !admission || admission.code!=='SERVER_COMBAT_RUNTIME_REQUIRED' ||
       admission.eligibleForFutureRuntime!==true ||
       admission.canJoin!==false || admission.canAttack!==false ||
       admission.readOnly!==true || admission.room!==evidence.observerRoom) {
      this.revoke(socket);
      return blocked('SHADOW_ADMISSION_DENIED');
    }
    const prior=this.#byOwner.get(evidence.ownerId);
    if(prior && prior.socket===socket && prior.pid===evidence.pid &&
       prior.room===evidence.observerRoom && now<prior.expiresAt)
      return this.inspect(socket,evidence,now);
    if(prior) this.revoke(prior.socket);
    // One shadow candidate per signed owner. WebSocket object is private,
    // never serialized into socket attachments or returned to the player.
    const record={socket,pid:evidence.pid,ownerId:evidence.ownerId,
      room:evidence.observerRoom,createdAt:now,expiresAt:now+LEASE_MS,
      seenIds:new Set()};
    this.#byOwner.set(record.ownerId,record);
    this.#bySocket.set(socket,record);
    return this.inspect(socket,evidence,now);
  }

  inspect(socket,evidence,now) {
    if(!this.#valid(socket,evidence,now)) return blocked('SHADOW_SESSION_INVALID');
    const record=this.#bySocket.get(socket);
    if(!record || this.#byOwner.get(record.ownerId)!==record ||
       now>=record.expiresAt || record.ownerId!==evidence.ownerId ||
       record.pid!==evidence.pid || record.room!==evidence.observerRoom) {
      this.revoke(socket);
      return blocked('SHADOW_EXPIRED_OR_REPLACED');
    }
    // Deliberately do not invent current vitals from the original D1 save.
    return Object.freeze({ok:true,code:'SHADOW_OBSERVER_ONLY',
      room:record.room,ownerBound:true,
      origin:'server-dungeon-shadow-v1',participating:false,observer:true,
      hp:null,maxHp:null,mp:null,maxMp:null,
      position:null,cooldownUntil:null,statusEffects:null,
      canJoin:false,canAttack:false,canCast:false,canReceiveRewards:false,
      readOnly:true,expiresAt:record.expiresAt});
  }

  recordRequest(socket,evidence,requestId,now) {
    const current=this.inspect(socket,evidence,now);
    if(!current.ok) return current;
    if(typeof requestId!=='string' || !RID.test(requestId))
      return blocked('INVALID_REQUEST_ID');
    const record=this.#bySocket.get(socket);
    if(record.seenIds.has(requestId)) return blocked('REPLAYED_SHADOW_REQUEST');
    // Diagnostic deduplication ONLY; not durable replay protection for XP,
    // actual damage, loot, payment, or any other real combat action.
    if(record.seenIds.size>=MAX_IDS) return blocked('SHADOW_REQUEST_LIMIT');
    record.seenIds.add(requestId);
    return blocked('SERVER_COMBAT_RUNTIME_REQUIRED');
  }

  revoke(socket) {
    if(!socket || typeof socket!=='object') return false;
    const record=this.#bySocket.get(socket);
    if(!record) return false;
    if(this.#byOwner.get(record.ownerId)===record)
      this.#byOwner.delete(record.ownerId);
    this.#bySocket.delete(socket);
    return true;
  }
}
