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

function cleanMobKey(v) {
  v = String(v || '');
  return /^s\d{1,4}$/.test(v) ? v : '';
}

function finite(v, min, max, fallback = 0) {
  v = Number(v);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
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
    f: Number(a.f) || 1,
    a: String(a.a || 'idle').slice(0, 12),
    l: Math.max(1, Math.min(999, Math.round(Number(a.l) || 1))),
    b: Math.max(0, Math.round(Number(a.b) || 0)),
    p: String(a.partyId || ''),
    q: Number(a.q) || 0,
    t: Date.now(),
  };
}

export class RealtimeHub extends BaseRealtimeHub {
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
    room = cleanRoom(room);
    const ids = new Set();
    for (const ws of this.sockets()) {
      const a = attOf(ws);
      if (a.pid && cleanRoom(a.room) === room) ids.add(String(a.pid));
    }
    return ids.size;
  }

  roomBroadcast(room, data, except) {
    room = cleanRoom(room);
    const raw = JSON.stringify(data);
    for (const ws of this.sockets()) {
      if (ws === except) continue;
      const a = attOf(ws);
      if (cleanRoom(a.room) !== room) continue;
      try { ws.send(raw); } catch (_) {}
    }
  }

  sendRoomSnapshot(ws, room) {
    room = cleanRoom(room);
    const byPid = new Map();
    for (const other of this.sockets()) {
      if (other === ws) continue;
      const a = attOf(other);
      const pid = String(a.pid || '');
      if (!pid || cleanRoom(a.room) !== room) continue;
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
    const { health, dead, events } = this.mobStores();
    for (const [ck, d] of dead) {
      if (!d || Number(d.at) <= now) {
        dead.delete(ck);
        health.delete(ck);
      }
    }
    for (const [id, at] of events) if (now - Number(at || 0) > 15000) events.delete(id);
  }

  mobDeadRows(room, now = Date.now()) {
    room = cleanRoom(room);
    this.pruneMobStores(now);
    const { dead } = this.mobStores();
    const out = [];
    for (const d of dead.values()) {
      if (d && d.room === room && Number(d.at) > now) out.push([d.key, Number(d.at)]);
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

    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      pid, telegramId, name, clanId, classKey,
      room: 'safe', partyId: '', lastChat: 0, lastMove: 0,
      lastSeenAt: Date.now(), lastSnapshotPush: 0,
      q: 0, l: 1, b: 0,
    });

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
          rec = { hp: Math.min(clientHp, mhp), mhp, updatedAt: now };
          health.set(ck, rec);
        } else {
          rec.mhp = Math.max(1, Number(rec.mhp) || mhp);
          rec.hp = Math.max(0, Math.min(Number(rec.hp) || 0, rec.mhp));
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
      if (event && events.has(event)) {
        if (rec) wsJson(ws, { type: 'mob-hp', room, key, hp: rec.hp, mhp: rec.mhp, event, ts: now });
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
      if (rec.hp <= 0) {
        let d = dead.get(ck);
        if (!d || Number(d.at) <= now) {
          d = { room, key, at: now + 10000 };
          dead.set(ck, d);
          firstDeath = true;
        }
        respawnAt = Number(d.at);
      }

      this.roomBroadcast(room, {
        type: 'mob-hp', room, key,
        hp: Math.round(rec.hp * 100) / 100,
        mhp: Math.round((Number(rec.mhp) || Math.max(1, before)) * 100) / 100,
        respawnAt, event, ts: now,
      }, null);
      if (firstDeath) {
        this.roomBroadcast(room, { type: 'mob-dead', room, key, respawnAt, ts: now }, null);
      }
      return;
    }

    if (m.type === 'ping') {
      a.lastSeenAt = now;
      ws.serializeAttachment(a);
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
      const oldRoom = cleanRoom(a.room);
      const room = cleanRoom(m.room);
      if (oldRoom !== room) {
        this.roomBroadcast(oldRoom, { type: 'leave', id: a.pid, room: oldRoom, ts: now }, ws);
        a.room = room;
        this.roomBroadcast(room, { type: 'join', player: packetFromAtt(a), room, ts: now }, ws);
      } else {
        a.room = room;
      }
      a.lastSeenAt = now;
      ws.serializeAttachment(a);
      this.sendRoomSnapshot(ws, room);
      if (a.partyId) this.sendPartyState(a.partyId);
      return;
    }

    if (m.type === 'move') {
      if (now - (Number(a.lastMove) || 0) < 90) return;

      const oldRoom = cleanRoom(a.room);
      const wantedRoom = m.room != null ? cleanRoom(m.room) : oldRoom;
      if (wantedRoom !== oldRoom) {
        this.roomBroadcast(oldRoom, { type: 'leave', id: a.pid, room: oldRoom, ts: now }, ws);
        a.room = wantedRoom;
      }

      a.lastMove = now;
      a.lastSeenAt = now;
      a.x = Number.isFinite(Number(m.x)) ? Math.round(Number(m.x) * 10) / 10 : Number(a.x) || 0;
      a.y = Number.isFinite(Number(m.y)) ? Math.round(Number(m.y) * 10) / 10 : Number(a.y) || 0;
      a.h = Math.max(0, Math.round(Number(m.h) || 0));
      a.m = Math.max(1, Math.round(Number(m.m) || 1));
      a.f = Math.max(1, Math.min(8, Math.round(Number(m.f) || 1)));
      a.a = String(m.a || 'idle').slice(0, 12);
      a.l = Math.max(1, Math.min(999, Math.round(Number(m.l) || Number(a.l) || 1)));
      a.b = Math.max(0, Math.round(Number(m.b) || Number(a.b) || 0));
      a.q = (Number(a.q) || 0) + 1;

      const pushSnapshot = now - (Number(a.lastSnapshotPush) || 0) >= 1200;
      if (pushSnapshot) a.lastSnapshotPush = now;
      ws.serializeAttachment(a);

      const currentRoom = cleanRoom(a.room);
      if (wantedRoom !== oldRoom) {
        this.roomBroadcast(currentRoom, { type: 'join', player: packetFromAtt(a), room: currentRoom, ts: now }, ws);
      }
      this.roomBroadcast(currentRoom, { type: 'move', player: packetFromAtt(a) }, ws);
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
    if (!pid) {
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
