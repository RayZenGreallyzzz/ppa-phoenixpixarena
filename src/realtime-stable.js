import { RealtimeHub as BaseRealtimeHub } from './realtime.js';

function attOf(ws) {
  try { return ws.deserializeAttachment() || {}; } catch (_) { return {}; }
}

function cleanRoom(v) {
  v = String(v || 'safe').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
  return v || 'safe';
}

function cleanName(v) {
  return String(v || 'Игрок').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 24) || 'Игрок';
}

function cleanPet(v) {
  return String(v || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 48);
}

function cleanClass(v) {
  v = String(v || '').trim().toLowerCase();
  return ['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'].includes(v) ? v : '';
}

function cleanMobKey(v) {
  v = String(v || '');
  return /^s\d{1,4}$/.test(v) ? v : '';
}

function finite(v, min, max, fallback = 0) {
  v = Number(v);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

const DUNGEON_CAPACITY = 40;
const DUNGEON_RESERVE_MS = 90_000;

function dungeonInfo(v) {
  const room = cleanRoom(v);
  if (!room.startsWith('dungeon-')) return null;
  const m = room.match(/^(dungeon-[a-z0-9_-]*?)-i([1-9]\d*)$/);
  if (m) return { base: m[1], room, instance: Math.max(1, Number(m[2]) || 1) };
  return { base: room, room: '', instance: 0 };
}

function dungeonRoom(base, instance) {
  const d = dungeonInfo(base);
  return d ? (d.base + '-i' + Math.max(1, Math.floor(Number(instance) || 1))) : cleanRoom(base);
}

function wsJson(ws, data) {
  try { ws.send(JSON.stringify(data)); return true; } catch (_) { return false; }
}

function packetFromAtt(a) {
  return {
    i: String(a.pid || ''),
    n: cleanName(a.name || 'Игрок'),
    c: String(a.classKey || 'ГЕРОЙ').slice(0, 24),
    g: String(a.clanId || '').slice(0, 80),
    cn: '',
    r: cleanRoom(a.room),
    x: Number(a.x) || 0,
    y: Number(a.y) || 0,
    h: Math.max(0, Number(a.h) || 0),
    m: Math.max(1, Number(a.m) || 1),
    f: Number.isFinite(Number(a.f)) ? Number(a.f) : 1,
    a: String(a.a || 'idle').slice(0, 12),
    l: Math.max(1, Math.min(999, Math.round(Number(a.l) || 1))),
    b: Math.max(0, Math.round(Number(a.b) || 0)),
    p: String(a.partyId || ''),
    pt: cleanPet(a.pet || ''),
    q: Number(a.q) || 0,
    t: Date.now(),
  };
}

export class RealtimeHub extends BaseRealtimeHub {
  ensureRoomIndex() {
    if (this._roomIndex) return this._roomIndex;
    this._roomIndex = new Map();
    for (const ws of this.sockets()) {
      const a = attOf(ws);
      const room = cleanRoom(a.room);
      let set = this._roomIndex.get(room);
      if (!set) this._roomIndex.set(room, set = new Set());
      set.add(ws);
    }
    return this._roomIndex;
  }

  roomSockets(room) {
    room = cleanRoom(room);
    const idx = this.ensureRoomIndex();
    return idx.get(room) || new Set();
  }

  indexAdd(ws, room) {
    room = cleanRoom(room);
    const idx = this.ensureRoomIndex();
    let set = idx.get(room);
    if (!set) idx.set(room, set = new Set());
    set.add(ws);
  }

  indexRemove(ws, room) {
    room = cleanRoom(room);
    const idx = this.ensureRoomIndex();
    const set = idx.get(room);
    if (!set) return;
    set.delete(ws);
    if (!set.size) idx.delete(room);
  }

  indexMove(ws, oldRoom, newRoom) {
    oldRoom = cleanRoom(oldRoom);
    newRoom = cleanRoom(newRoom);
    if (oldRoom === newRoom) {
      this.indexAdd(ws, newRoom);
      return;
    }
    this.indexRemove(ws, oldRoom);
    this.indexAdd(ws, newRoom);
  }

  hasReplacement(pid, except) {
    pid = String(pid || '');
    if (!pid) return false;
    for (const ws of this.sockets()) {
      if (ws === except) continue;
      const a = attOf(ws);
      if (String(a.pid || '') === pid) return true;
    }
    return false;
  }

  countRoom(room) {
    const ids = new Set();
    for (const ws of this.roomSockets(room)) {
      const a = attOf(ws);
      if (a.pid) ids.add(String(a.pid));
    }
    return ids.size;
  }

  roomCount(room) {
    return this.countRoom(room);
  }

  roomBroadcast(room, data, except) {
    room = cleanRoom(room);
    const raw = JSON.stringify(data);
    for (const ws of this.roomSockets(room)) {
      if (ws === except) continue;
      try { ws.send(raw); } catch (_) {}
    }
  }

  sendRoomSnapshot(ws, room) {
    room = cleanRoom(room);
    const byPid = new Map();
    for (const other of this.roomSockets(room)) {
      if (other === ws) continue;
      const a = attOf(other);
      const pid = String(a.pid || '');
      if (!pid) continue;
      if (!Number.isFinite(Number(a.x)) || !Number.isFinite(Number(a.y))) continue;
      const prev = byPid.get(pid);
      if (!prev || Number(a.lastSeenAt || 0) >= Number(prev.lastSeenAt || 0)) byPid.set(pid, a);
    }
    const players = [...byPid.values()].map(packetFromAtt);
    wsJson(ws, {
      type: 'snapshot',
      room,
      serverRoom: room,
      roomCount: this.countRoom(room),
      players,
      ts: Date.now(),
    });
  }

  dungeonReservations() {
    if (!this._dungeonReservations) this._dungeonReservations = new Map();
    return this._dungeonReservations;
  }

  partyPids(partyId) {
    partyId = String(partyId || '');
    if (!partyId) return [];
    const ids = new Set();
    for (const ws of this.sockets()) {
      const a = attOf(ws);
      if (String(a.partyId || '') === partyId && a.pid) ids.add(String(a.pid));
    }
    return [...ids];
  }

  roomPidSet(room) {
    const ids = new Set();
    for (const ws of this.roomSockets(room)) {
      const a = attOf(ws);
      if (a.pid) ids.add(String(a.pid));
    }
    return ids;
  }

  pidInRoom(pid, room) {
    pid = String(pid || '');
    if (!pid) return false;
    for (const ws of this.roomSockets(room)) if (String(attOf(ws).pid || '') === pid) return true;
    return false;
  }

  clearDungeonRoomState(room) {
    room = cleanRoom(room);
    const d = dungeonInfo(room);
    if (!d || !d.instance) return;
    const prefix = room + '|';
    const { health, dead } = this.mobStores();
    for (const key of [...health.keys()]) if (String(key).startsWith(prefix)) health.delete(key);
    for (const key of [...dead.keys()]) if (String(key).startsWith(prefix)) dead.delete(key);
  }

  roomHasReservation(room, now = Date.now()) {
    room = cleanRoom(room);
    for (const r of this.dungeonReservations().values()) {
      if (r && r.room === room && Number(r.expiresAt || 0) > now) return true;
    }
    return false;
  }

  maybeCleanupDungeon(room, now = Date.now()) {
    room = cleanRoom(room);
    const d = dungeonInfo(room);
    if (!d || !d.instance) return;
    if (this.countRoom(room) > 0 || this.roomHasReservation(room, now)) return;
    this.clearDungeonRoomState(room);
  }

  pruneDungeonReservations(now = Date.now()) {
    const map = this.dungeonReservations();
    for (const [key, r] of [...map.entries()]) {
      if (!r || !r.partyId || !r.room) {
        map.delete(key);
        continue;
      }
      const pids = this.partyPids(r.partyId);
      if (!pids.length) {
        map.delete(key);
        this.maybeCleanupDungeon(r.room, now);
        continue;
      }
      r.pids = new Set(pids);
      const inside = pids.some((pid) => this.pidInRoom(pid, r.room));
      if (inside) r.expiresAt = now + DUNGEON_RESERVE_MS;
      if (!inside && Number(r.expiresAt || 0) <= now) {
        map.delete(key);
        this.maybeCleanupDungeon(r.room, now);
      }
    }
  }

  reservedSlots(room, exceptKey = '', now = Date.now()) {
    room = cleanRoom(room);
    const occupied = this.roomPidSet(room);
    const partyNeeds = new Map();

    for (const [key, r] of this.dungeonReservations()) {
      if (key === exceptKey || !r || r.room !== room || Number(r.expiresAt || 0) <= now) continue;
      const partyId = String(r.partyId || '');
      if (!partyId) continue;
      partyNeeds.set(partyId, r.pids instanceof Set ? new Set(r.pids) : new Set(r.pids || []));
    }

    // An active party member inside an instance implicitly reserves seats for the
    // rest of the live party. This survives Durable Object hibernation because
    // partyId lives in the WebSocket attachment, not only in memory.
    for (const ws of this.roomSockets(room)) {
      const a = attOf(ws);
      const partyId = String(a.partyId || '');
      if (!partyId || exceptKey.endsWith('|' + partyId)) continue;
      if (!partyNeeds.has(partyId)) partyNeeds.set(partyId, new Set(this.partyPids(partyId)));
    }

    let count = 0;
    for (const pids of partyNeeds.values()) {
      for (const pid of pids) if (!occupied.has(String(pid))) count++;
    }
    return count;
  }

  candidateDungeonRooms(base) {
    const d = dungeonInfo(base);
    if (!d) return [];
    const out = new Set();
    const idx = this.ensureRoomIndex();
    for (const room of idx.keys()) {
      const x = dungeonInfo(room);
      if (x && x.instance && x.base === d.base) out.add(x.room);
    }
    for (const r of this.dungeonReservations().values()) {
      const x = r && dungeonInfo(r.room);
      if (x && x.instance && x.base === d.base) out.add(x.room);
    }
    return [...out];
  }

  moveSocketRoom(ws, a, targetRoom, now = Date.now()) {
    targetRoom = cleanRoom(targetRoom);
    const oldRoom = cleanRoom(a.room);
    if (oldRoom !== targetRoom) {
      this.roomBroadcast(oldRoom, { type: 'leave', id: a.pid, room: oldRoom, ts: now }, ws);
      this.indexMove(ws, oldRoom, targetRoom);
      a.room = targetRoom;
      a.lastSeenAt = now;
      ws.serializeAttachment(a);
      this.roomBroadcast(targetRoom, { type: 'join', player: packetFromAtt(a), room: targetRoom, ts: now }, ws);
      this.maybeCleanupDungeon(oldRoom, now);
    } else {
      a.room = targetRoom;
      a.lastSeenAt = now;
      this.indexAdd(ws, targetRoom);
      ws.serializeAttachment(a);
    }
    return targetRoom;
  }

  assignDungeon(ws, a, requested, now = Date.now()) {
    const info = dungeonInfo(requested);
    if (!info) return cleanRoom(a.room);
    const base = info.base;
    this.pruneDungeonReservations(now);

    const partyId = String(a.partyId || '');
    const ownPid = String(a.pid || '');
    const pids = partyId ? this.partyPids(partyId) : [ownPid];
    if (ownPid && !pids.includes(ownPid)) pids.push(ownPid);
    const unit = [...new Set(pids.filter(Boolean))];
    const resKey = partyId ? (base + '|' + partyId) : '';
    const reservations = this.dungeonReservations();
    let reservation = resKey ? reservations.get(resKey) : null;
    if (reservation) {
      reservation.pids = new Set(unit);
      reservation.expiresAt = now + DUNGEON_RESERVE_MS;
    }

    const current = dungeonInfo(a.room);
    let target = '';
    const canFit = (room) => {
      const occupied = this.roomPidSet(room);
      const otherReserved = this.reservedSlots(room, resKey, now);
      let missing = 0;
      for (const pid of unit) if (!occupied.has(pid)) missing++;
      return occupied.size + otherReserved + missing <= DUNGEON_CAPACITY;
    };

    if (reservation && dungeonInfo(reservation.room)?.base === base && canFit(reservation.room)) {
      target = reservation.room;
    } else if (!partyId && current && current.instance && current.base === base && this.countRoom(current.room) <= DUNGEON_CAPACITY) {
      target = current.room;
    }

    if (!target) {
      const rooms = this.candidateDungeonRooms(base);
      const ranked = [];
      for (const room of rooms) {
        if (!canFit(room)) continue;
        const occupied = this.roomPidSet(room);
        const otherReserved = this.reservedSlots(room, resKey, now);
        let partyInside = 0;
        for (const pid of unit) if (occupied.has(pid)) partyInside++;
        const x = dungeonInfo(room);
        ranked.push({ room, partyInside, load: occupied.size + otherReserved, instance: x ? x.instance : 999999 });
      }
      ranked.sort((x, y) => (y.partyInside - x.partyInside) || (y.load - x.load) || (x.instance - y.instance));
      if (ranked.length) target = ranked[0].room;
    }

    if (!target) {
      const used = new Set(this.candidateDungeonRooms(base).map((room) => dungeonInfo(room)?.instance).filter(Boolean));
      let instance = 1;
      while (used.has(instance)) instance++;
      target = dungeonRoom(base, instance);
    }

    if (partyId) {
      reservations.set(resKey, {
        base,
        room: target,
        partyId,
        pids: new Set(unit),
        expiresAt: now + DUNGEON_RESERVE_MS,
      });

      // If a party was created or enlarged after somebody already entered this
      // dungeon, move the members who are already in the same dungeon base to
      // the newly selected instance. Members who are still in town are not
      // teleported; their seats remain reserved until they enter normally.
      for (const peer of this.sockets()) {
        if (peer === ws) continue;
        const pa = attOf(peer);
        if (String(pa.partyId || '') !== partyId) continue;
        const pd = dungeonInfo(pa.room);
        if (!pd || !pd.instance || pd.base !== base || pd.room === target) continue;
        this.moveSocketRoom(peer, pa, target, now);
        const ti = dungeonInfo(target);
        wsJson(peer, {
          type: 'room-assigned',
          base,
          room: target,
          instance: ti ? ti.instance : 1,
          capacity: DUNGEON_CAPACITY,
          roomCount: this.countRoom(target),
          partyReserved: unit.length,
          migrated: true,
          ts: now,
        });
        this.sendRoomSnapshot(peer, target);
      }
    }

    this.moveSocketRoom(ws, a, target, now);
    const t = dungeonInfo(target);
    wsJson(ws, {
      type: 'room-assigned',
      base,
      room: target,
      instance: t ? t.instance : 1,
      capacity: DUNGEON_CAPACITY,
      roomCount: this.countRoom(target),
      partyReserved: partyId ? unit.length : 1,
      ts: now,
    });
    this.sendRoomSnapshot(ws, target);
    if (partyId) this.sendPartyState(partyId);
    return target;
  }

  mobStores() {
    if (!this._mobHealth) this._mobHealth = new Map();
    if (!this._mobDead) this._mobDead = new Map();
    if (!this._mobEvents) this._mobEvents = new Map();
    return { health: this._mobHealth, dead: this._mobDead, events: this._mobEvents };
  }

  mobCompound(room, key) {
    return cleanRoom(room) + '|' + cleanMobKey(key);
  }

  pruneMobStores(now = Date.now()) {
    const { events } = this.mobStores();
    for (const [id, at] of events) if (now - Number(at || 0) > 15000) events.delete(id);
  }

  processMobRespawns(room, now = Date.now()) {
    room = cleanRoom(room);
    if (!room.startsWith('dungeon-')) return;
    this.pruneMobStores(now);
    const { health, dead } = this.mobStores();
    for (const [ck, d] of [...dead.entries()]) {
      if (!d || d.room !== room || Number(d.at) > now) continue;
      const rec = health.get(ck);
      if (!rec) { dead.delete(ck); continue; }
      rec.hp = Math.max(1, Number(rec.mhp) || 1);
      rec.updatedAt = now;
      rec.killer = '';
      rec.party = '';
      health.set(ck, rec);
      dead.delete(ck);
      this.roomBroadcast(room, {
        type: 'mob-authority', room, key: d.key,
        hp: rec.hp, mhp: rec.mhp, respawnAt: 0,
        killer: '', party: '', ts: now,
      }, null);
    }
  }

  sendMobAuthoritySnapshot(ws, room, now = Date.now()) {
    room = cleanRoom(room);
    if (!room.startsWith('dungeon-')) return;
    this.processMobRespawns(room, now);
    const { health, dead } = this.mobStores();
    const prefix = room + '|';
    const rows = [];
    for (const [ck, rec] of health.entries()) {
      if (!String(ck).startsWith(prefix) || !rec) continue;
      const key = String(ck).slice(prefix.length);
      const d = dead.get(ck);
      rows.push([
        key,
        Math.max(0, Number(rec.hp) || 0),
        Math.max(1, Number(rec.mhp) || 1),
        d && Number(d.at) > now ? Number(d.at) : 0,
        d ? String(d.killer || '') : '',
        d ? String(d.party || '') : '',
      ]);
      if (rows.length >= 256) break;
    }
    wsJson(ws, { type: 'mob-authority-snapshot', room, rows, ts: now });
  }

  mobDeadRows(room, now = Date.now()) {
    room = cleanRoom(room);
    this.processMobRespawns(room, now);
    const { dead } = this.mobStores();
    const out = [];
    for (const d of dead.values()) {
      if (d && d.room === room && Number(d.at) > now) {
        out.push([d.key, Number(d.at), String(d.killer || ''), String(d.party || '')]);
      }
      if (out.length >= 64) break;
    }
    return out;
  }

  async fetch(request) {
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }

    const pid = String(request.headers.get('x-ppa-player-id') || '');
    const telegramId = String(request.headers.get('x-ppa-telegram-id') || '');
    const name = cleanName(request.headers.get('x-ppa-player-name') || 'Игрок');
    const clanId = String(request.headers.get('x-ppa-clan-id') || '').slice(0, 80);
    const classKey = String(request.headers.get('x-ppa-class-key') || '').slice(0, 24);
    if (!pid || !telegramId) return new Response('Unauthorized', { status: 401 });

    const oldSockets = [];
    for (const old of this.sockets()) {
      const a = attOf(old);
      if (String(a.pid || '') === pid) oldSockets.push(old);
    }

    this.ensureRoomIndex();
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      pid, telegramId, name, clanId, classKey,
      room: 'safe', partyId: '', pet: '', lastChat: 0, lastMove: 0,
      lastSeenAt: Date.now(), lastSnapshotPush: 0,
      q: 0, l: 1, b: 0,
    });
    this.indexAdd(server, 'safe');

    wsJson(server, { type: 'hello', pid, name, clanId, serverRoom: 'safe', ts: Date.now() });

    for (const old of oldSockets) {
      try { old.close(4001, 'Reconnected'); } catch (_) {}
    }

    this.sendOnlineCount();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 4096) return;
    let m = null;
    try { m = JSON.parse(message); } catch (_) { return; }
    if (!m || typeof m !== 'object') return;

    const a = attOf(ws);
    const now = Date.now();

    if (m.type === 'mob-catalog') {
      const room = cleanRoom(a.room);
      if (!room.startsWith('dungeon-') || cleanRoom(m.room || room) !== room) return;
      this.processMobRespawns(room, now);
      const { health } = this.mobStores();
      const rows = Array.isArray(m.rows) ? m.rows.slice(0, 256) : [];
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 2) continue;
        const key = cleanMobKey(row[0]);
        const mhp = Math.max(1, finite(row[1], 1, 10000000, 1));
        if (!key) continue;
        const ck = this.mobCompound(room, key);
        let rec = health.get(ck);
        if (!rec) {
          rec = { hp: mhp, mhp, updatedAt: now, killer: '', party: '' };
          health.set(ck, rec);
        } else {
          rec.mhp = mhp;
          if (!Number.isFinite(Number(rec.hp))) rec.hp = mhp;
          rec.hp = Math.max(0, Math.min(Number(rec.hp) || 0, mhp));
          rec.updatedAt = now;
          health.set(ck, rec);
        }
      }
      this.sendMobAuthoritySnapshot(ws, room, now);
      return;
    }

    if (m.type === 'mob-hit-event') {
      const room = cleanRoom(a.room);
      const key = cleanMobKey(m.key);
      const amount = finite(m.amount, 0, 10000000, 0);
      const mhp = Math.max(1, finite(m.mhp, 1, 10000000, 1));
      const event = String(m.event || '').slice(0, 96);
      if (!room.startsWith('dungeon-') || cleanRoom(m.room || room) !== room) return;
      if (!key || !(amount > 0)) return;

      this.processMobRespawns(room, now);
      const { health, dead, events } = this.mobStores();
      if (event && events.has(event)) return;
      if (event) events.set(event, now);

      const ck = this.mobCompound(room, key);
      let rec = health.get(ck);
      if (!rec) rec = { hp: mhp, mhp, updatedAt: now, killer: '', party: '' };
      rec.mhp = Math.max(1, Number(rec.mhp) || mhp);
      const existingDead = dead.get(ck);
      if (existingDead && Number(existingDead.at) > now) {
        this.sendMobAuthoritySnapshot(ws, room, now);
        return;
      }

      rec.hp = Math.max(0, Math.min(rec.mhp, Number(rec.hp) || rec.mhp) - amount);
      rec.updatedAt = now;
      rec.killer = String(a.pid || '');
      rec.party = String(a.partyId || '');
      health.set(ck, rec);

      let respawnAt = 0, killer = rec.killer, party = rec.party;
      if (rec.hp <= 0) {
        respawnAt = now + 10000;
        dead.set(ck, { room, key, at: respawnAt, killer, party });
        setTimeout(() => {
          try { this.processMobRespawns(room, Date.now()); } catch (_) {}
        }, 10050);
      }

      this.roomBroadcast(room, {
        type: 'mob-authority', room, key,
        hp: Math.round(rec.hp * 100) / 100,
        mhp: Math.round(rec.mhp * 100) / 100,
        respawnAt, killer, party, event, ts: now,
      }, null);
      return;
    }

    if (m.type === 'room-request') {
      const info = dungeonInfo(m.base || m.room || '');
      if (!info) return;
      this.assignDungeon(ws, a, info.base, now);
      return;
    }

    if (m.type === 'pet-state') {
      const room = cleanRoom(a.room);
      const pet = cleanPet(m.pet || '');
      if (pet !== cleanPet(a.pet || '')) {
        a.pet = pet;
        a.lastSeenAt = now;
        ws.serializeAttachment(a);
        this.roomBroadcast(room, { type: 'move', player: packetFromAtt(a), room }, ws);
      }
      return;
    }

    if (m.type === 'mob-state') {
      const room = cleanRoom(a.room);
      if (!room.startsWith('dungeon-') || cleanRoom(m.room || room) !== room) return;
      this.pruneMobStores(now);
      const { health, dead } = this.mobStores();
      const rows = [];
      const input = Array.isArray(m.rows) ? m.rows.slice(0, 16) : [];
      for (const row of input) {
        if (!Array.isArray(row) || row.length < 5) continue;
        const key = cleanMobKey(row[0]);
        if (!key) continue;
        const x = finite(row[1], -100000, 100000, NaN);
        const y = finite(row[2], -100000, 100000, NaN);
        const clientHp = finite(row[3], 0, 10000000, NaN);
        const mhp = Math.max(1, finite(row[4], 1, 10000000, 1));
        if (![x, y, clientHp, mhp].every(Number.isFinite)) continue;
        const ck = this.mobCompound(room, key);
        const tomb = dead.get(ck);
        let rec = health.get(ck);
        if (tomb && Number(tomb.at) > now) {
          rec = { hp: 0, mhp, updatedAt: now };
          health.set(ck, rec);
        } else if (!rec || now - Number(rec.updatedAt || 0) > 30000) {
          // A state snapshot is never allowed to manufacture a death.
          // Fresh mobs start from positive client HP (or full HP if client reported 0).
          const seedHp = clientHp > 0 ? Math.min(clientHp, mhp) : mhp;
          rec = { hp: Math.max(1, seedHp), mhp, updatedAt: now };
          health.set(ck, rec);
        } else {
          rec.mhp = Math.max(1, Number(rec.mhp) || mhp);
          rec.hp = Math.max(1, Math.min(Number(rec.hp) || rec.mhp, rec.mhp));
          rec.updatedAt = now;
        }
        rows.push([
          key, Math.round(x * 10) / 10, Math.round(y * 10) / 10,
          Math.round(rec.hp * 100) / 100, Math.round(rec.mhp * 100) / 100,
          row[5] ? 1 : 0,
          row[6] == null ? null : finite(row[6], -8, 8, 0),
          row[7] ? 1 : 0,
          row[8] == null ? null : finite(row[8], -8, 8, 0),
          row[9] ? 1 : 0,
        ]);
      }
      this.roomBroadcast(room, {
        type: 'mob-state', from: a.pid, room, rows,
        dead: this.mobDeadRows(room, now), ts: now,
      }, ws);
      return;
    }

    if (m.type === 'mob-damage') {
      const room = cleanRoom(a.room);
      if (!room.startsWith('dungeon-') || cleanRoom(m.room || room) !== room) return;
      const key = cleanMobKey(m.key);
      const amount = finite(m.amount, 0, 10000000, 0);
      const before = finite(m.before, 0, 10000000, NaN);
      const event = String(m.event || '').slice(0, 96);
      if (!key || !(amount > 0) || !Number.isFinite(before)) return;

      this.pruneMobStores(now);
      const { health, dead, events } = this.mobStores();
      const ck = this.mobCompound(room, key);
      let rec = health.get(ck);
      const killer = String(a.pid || '');
      const killerParty = String(a.partyId || '');
      if (event && events.has(event)) {
        if (rec) wsJson(ws, {
          type: 'mob-hp', room, key, hp: rec.hp, mhp: rec.mhp,
          killer, party: killerParty, event, ts: now,
        });
        return;
      }
      if (event) events.set(event, now);

      const tomb = dead.get(ck);
      if (tomb && Number(tomb.at) > now) {
        rec = rec || { hp: 0, mhp: Math.max(1, before), updatedAt: now };
        rec.hp = 0;rec.updatedAt = now;health.set(ck, rec);
      } else {
        if (!rec) rec = { hp: before, mhp: Math.max(1, before), updatedAt: now };
        let cur = Math.max(0, Number(rec.hp) || 0);
        cur = Math.min(cur, before);
        rec.hp = Math.max(0, cur - amount);
        rec.updatedAt = now;
        health.set(ck, rec);
      }

      let respawnAt = null;
      let firstDeath = false;
      let deathInfo = null;
      if (rec.hp <= 0) {
        let d = dead.get(ck);
        if (!d || Number(d.at) <= now) {
          d = { room, key, at: now + 10000, killer, party: killerParty };
          dead.set(ck, d);
          firstDeath = true;
        }
        deathInfo = d;
        respawnAt = Number(d.at);
      }

      const rewardKiller = deathInfo ? String(deathInfo.killer || '') : killer;
      const rewardParty = deathInfo ? String(deathInfo.party || '') : killerParty;
      this.roomBroadcast(room, {
        type: 'mob-hp', room, key,
        hp: Math.round(rec.hp * 100) / 100,
        mhp: Math.round((Number(rec.mhp) || Math.max(1, before)) * 100) / 100,
        respawnAt, killer: rewardKiller, party: rewardParty, event, ts: now,
      }, null);
      if (firstDeath) {
        this.roomBroadcast(room, {
          type: 'mob-dead', room, key, respawnAt,
          killer: rewardKiller, party: rewardParty, ts: now,
        }, null);
      }
      return;
    }

    if (m.type === 'ping') {
      a.lastSeenAt = now;
      ws.serializeAttachment(a);
      this.processMobRespawns(cleanRoom(a.room), now);
      wsJson(ws, {
        type: 'pong',
        ts: now,
        clientTs: Number(m.clientTs) || 0,
        room: cleanRoom(a.room),
        roomCount: this.countRoom(a.room),
      });
      return;
    }

    if (m.type === 'room') {
      const requested = cleanRoom(m.room);
      const d = dungeonInfo(requested);
      if (d) {
        const current = dungeonInfo(a.room);
        if (d.instance && current && current.instance && cleanRoom(a.room) === requested) {
          a.lastSeenAt = now;
          ws.serializeAttachment(a);
          wsJson(ws, {
            type: 'room-assigned',
            base: d.base,
            room: requested,
            instance: d.instance,
            capacity: DUNGEON_CAPACITY,
            roomCount: this.countRoom(requested),
            ts: now,
          });
          this.sendRoomSnapshot(ws, requested);
        } else {
          this.assignDungeon(ws, a, d.base, now);
        }
        return;
      }

      const room = this.moveSocketRoom(ws, a, requested, now);
      this.sendRoomSnapshot(ws, room);
      if (a.partyId) this.sendPartyState(a.partyId);
      return;
    }

    if (m.type === 'move') {
      if (now - (Number(a.lastMove) || 0) < 90) return;

      const oldRoom = cleanRoom(a.room);
      const wantedRoom = m.room != null ? cleanRoom(m.room) : oldRoom;
      const wantedDungeon = dungeonInfo(wantedRoom);
      const currentDungeon = dungeonInfo(oldRoom);
      let currentRoom = oldRoom;

      if (wantedDungeon) {
        if (currentDungeon && currentDungeon.instance && currentDungeon.base === wantedDungeon.base) {
          currentRoom = oldRoom;
        } else {
          currentRoom = this.assignDungeon(ws, a, wantedDungeon.base, now);
        }
      } else if (wantedRoom !== oldRoom) {
        currentRoom = this.moveSocketRoom(ws, a, wantedRoom, now);
        this.sendRoomSnapshot(ws, currentRoom);
      }

      a.lastMove = now;
      a.lastSeenAt = now;
      a.x = Number.isFinite(Number(m.x)) ? Math.round(Number(m.x) * 10) / 10 : Number(a.x) || 0;
      a.y = Number.isFinite(Number(m.y)) ? Math.round(Number(m.y) * 10) / 10 : Number(a.y) || 0;
      a.h = Math.max(0, Math.round(Number(m.h) || 0));
      a.m = Math.max(1, Math.round(Number(m.m) || 1));
      {
        const face = Number(m.f);
        a.f = Number.isFinite(face) ? Math.max(-8, Math.min(8, Math.round(face))) : (Number.isFinite(Number(a.f)) ? Number(a.f) : 1);
      }
      a.a = String(m.a || 'idle').slice(0, 12);
      a.l = Math.max(1, Math.min(999, Math.round(Number(m.l) || Number(a.l) || 1)));
      a.b = Math.max(0, Math.round(Number(m.b) || Number(a.b) || 0));
      {
        const liveClass = cleanClass(m.c);
        if (liveClass) a.classKey = liveClass;
      }
      a.q = (Number(a.q) || 0) + 1;
      a.room = currentRoom;

      const pushSnapshot = now - (Number(a.lastSnapshotPush) || 0) >= 1200;
      if (pushSnapshot) a.lastSnapshotPush = now;
      ws.serializeAttachment(a);

      this.roomBroadcast(currentRoom, { type: 'move', player: packetFromAtt(a), room: currentRoom }, ws);
      if (pushSnapshot) this.sendRoomSnapshot(ws, currentRoom);
      return;
    }

    return super.webSocketMessage(ws, message);
  }

  scheduleGoneCheck(ws) {
    const a = attOf(ws);
    const pid = String(a.pid || '');
    const room = cleanRoom(a.room);
    const partyId = String(a.partyId || '');
    this.indexRemove(ws, room);
    if (!pid) {
      this.maybeCleanupDungeon(room);
      this.sendOnlineCount();
      return;
    }

    setTimeout(() => {
      if (this.hasReplacement(pid, ws)) {
        this.sendOnlineCount();
        return;
      }
      this.roomBroadcast(room, { type: 'leave', id: pid, room, ts: Date.now() }, ws);
      if (partyId) this.sendPartyState(partyId);
      this.pruneDungeonReservations(Date.now());
      this.maybeCleanupDungeon(room, Date.now());
      this.sendOnlineCount();
    }, 5000);
  }

  async webSocketClose(ws) {
    this.scheduleGoneCheck(ws);
  }

  async webSocketError(ws) {
    this.scheduleGoneCheck(ws);
  }
}
