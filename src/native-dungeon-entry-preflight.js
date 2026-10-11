// Server-side, read-only admission diagnosis for the NEXT Godot dungeon stage.
//
// NOT a combat entitlement. Even a fully eligible response MUST NOT move the
// socket, reserve a dungeon slot, create a combat actor, alter HP/MP, or pay loot.
// The caller supplies only facts from the authenticated Durable Object session
// and existing Telegram room membership, never from the request packet.
const BASES = new Set(['dungeon-1-20','dungeon-21-40','dungeon-41-60']);
const ROOM = /^(dungeon-(?:1-20|21-40|41-60))-i([1-9][0-9]{0,5})$/;
const PID = /^p:[a-f0-9]{32}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const KEYS = new Set(['type','base','requestId']);

export function inspectNativeDungeonEntry(request, evidence) {
  const response = (code, eligibleForFutureRuntime = false, room = '') => Object.freeze({
    type:'dungeon-entry-check', code, room,
    eligibleForFutureRuntime, canJoin:false, canAttack:false,
    canCast:false, canReceiveRewards:false, readOnly:true,
    requestId: typeof request?.requestId === 'string' && REQUEST_ID.test(request.requestId)
      ? request.requestId : ''
  });
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).some(key => !KEYS.has(key)) ||
      request.type !== 'dungeon-entry-check' ||
      !BASES.has(request.base) ||
      typeof request.requestId !== 'string' ||
      !REQUEST_ID.test(request.requestId)) return response('INVALID_ENTRY_CHECK');
  if (!evidence || evidence.enabled !== true) return response('ENTRY_CHECK_DISABLED');

  // These values MUST come from a verified upstream ticket and the server-side
  // WebSocket attachment. A socket cannot become a native participant by
  // supplying its own pid, Telegram ID, party, position, room, HP or role.
  if (evidence.signedNative !== true ||
      typeof evidence.pid !== 'string' || !PID.test(evidence.pid) ||
      typeof evidence.ownerId !== 'string' || !/^\d{1,24}$/.test(evidence.ownerId)) {
    return response('SIGNED_NATIVE_SESSION_REQUIRED');
  }
  if (evidence.currentRoom !== 'safe' || evidence.deadLocked === true ||
      evidence.arenaMatchId || evidence.partyId) return response('ACTOR_NOT_READY');

  const room = evidence.observerRoom;
  const match = typeof room === 'string' ? room.match(ROOM) : null;
  if (!match || match[1] !== request.base) return response('SERVER_DUNGEON_ASSIGNMENT_REQUIRED');
  if (!Number.isSafeInteger(evidence.activeTelegramCount) ||
      evidence.activeTelegramCount < 1) return response('DUNGEON_NOT_ACTIVE');
  if (!Number.isSafeInteger(evidence.occupiedSeats) ||
      !Number.isSafeInteger(evidence.reservedSeats) ||
      evidence.occupiedSeats < 1 || evidence.reservedSeats < 0 ||
      evidence.occupiedSeats + evidence.reservedSeats + 1 > 40) {
    return response('DUNGEON_CAPACITY_UNCONFIRMED');
  }
  // A signed identity + a matching populated instance is necessary but NOT
  // sufficient: authoritative actor, attack, death and loot runtime are absent.
  return response('SERVER_COMBAT_RUNTIME_REQUIRED', true, room);
}
