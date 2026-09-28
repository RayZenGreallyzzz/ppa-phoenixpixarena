const enc = new TextEncoder();
const dec = new TextDecoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, typeof data === 'string' ? enc.encode(data) : data);
}

async function validateInitData(initData, botToken) {
  if (!botToken) throw Object.assign(new Error('BOT_TOKEN secret is not configured'), { status: 503 });
  if (!initData || typeof initData !== 'string') throw Object.assign(new Error('Telegram initData is missing'), { status: 401 });
  const p = new URLSearchParams(initData);
  const received = p.get('hash');
  if (!received) throw Object.assign(new Error('Telegram hash is missing'), { status: 401 });
  p.delete('hash');
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort((a, b) => a.localeCompare(b)).join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const calc = hex(await hmac(new Uint8Array(secret), check));
  if (!safeEqual(calc.toLowerCase(), received.toLowerCase())) throw Object.assign(new Error('Telegram signature check failed'), { status: 401 });
  const authDate = Number(p.get('auth_date')), now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0 || authDate > now + 300 || now - authDate > 86400) {
    throw Object.assign(new Error('Telegram session expired'), { status: 401 });
  }
  let user = null;
  try { user = JSON.parse(p.get('user') || 'null'); } catch (_) {}
  if (!user || user.id == null) throw Object.assign(new Error('Telegram user missing'), { status: 401 });
  return user;
}

function b64urlEncode(bytes) {
  let s = '';
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const raw = atob(s), out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function makeTicket(payload, botToken) {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = b64urlEncode(await hmac(enc.encode(botToken), 'PPA-RT1|' + body));
  return body + '.' + sig;
}

async function readTicket(ticket, botToken) {
  const parts = String(ticket || '').split('.');
  if (parts.length !== 2) throw Object.assign(new Error('Realtime ticket invalid'), { status: 401 });
  const expected = b64urlEncode(await hmac(enc.encode(botToken), 'PPA-RT1|' + parts[0]));
  if (!safeEqual(expected, parts[1])) throw Object.assign(new Error('Realtime ticket signature invalid'), { status: 401 });
  let payload = null;
  try { payload = JSON.parse(dec.decode(b64urlDecode(parts[0]))); } catch (_) {}
  if (!payload || !payload.pid || Number(payload.exp) < Date.now()) throw Object.assign(new Error('Realtime ticket expired'), { status: 401 });
  return payload;
}

function cleanRoom(v) {
  v = String(v || 'safe').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
  return v || 'safe';
}

function cleanName(v) { return String(v || 'Игрок').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 24) || 'Игрок'; }
function cleanText(v) { return String(v || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 180); }
function lowerName(v) { return cleanName(v).toLocaleLowerCase('ru-RU'); }
function cleanPid(v) {
  v = String(v || '').trim();
  return /^(?:p:[a-f0-9]{32}|tg:\d{1,24})$/.test(v) ? v : '';
}

let realtimePidSchemaReady = false;
async function ensureRealtimePidSchema(env) {
  if (realtimePidSchemaReady) return true;
  try {
    await env.DB.prepare('ALTER TABLE players ADD COLUMN realtime_pid TEXT').run();
  } catch (_) {
    // Existing databases already have the column after the first successful migration.
  }
  await env.DB.prepare(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_players_realtime_pid ON players(realtime_pid) WHERE realtime_pid IS NOT NULL AND realtime_pid<>''"
  ).run();
  realtimePidSchemaReady = true;
  return true;
}

async function realtimePidFor(env, telegramId) {
  telegramId = String(telegramId || '').trim();
  if (!telegramId) throw Object.assign(new Error('Telegram user missing'), { status: 401 });
  await ensureRealtimePidSchema(env);

  let row = await env.DB.prepare('SELECT realtime_pid FROM players WHERE telegram_id=?1 LIMIT 1').bind(telegramId).first();
  let pid = cleanPid(row && row.realtime_pid);
  if (pid && pid.startsWith('p:')) return pid;

  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = 'p:' + crypto.randomUUID().replace(/-/g, '').toLowerCase();
    try {
      await env.DB.prepare(
        "UPDATE players SET realtime_pid=?1 WHERE telegram_id=?2 AND (realtime_pid IS NULL OR realtime_pid='')"
      ).bind(candidate, telegramId).run();
    } catch (_) {
      continue;
    }
    row = await env.DB.prepare('SELECT realtime_pid FROM players WHERE telegram_id=?1 LIMIT 1').bind(telegramId).first();
    pid = cleanPid(row && row.realtime_pid);
    if (pid && pid.startsWith('p:')) return pid;
  }

  throw Object.assign(new Error('Realtime player ID unavailable'), { status: 503 });
}
function cleanClass(v) {
  v = String(v || '').trim().toLowerCase();
  return ['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'].includes(v) ? v : '';
}

async function playerIdentity(env, user) {
  const id = String(user.id);
  const pid = await realtimePidFor(env, id);
  const player = await env.DB.prepare('SELECT nickname,class_key,telegram_first_name,telegram_username FROM players WHERE telegram_id=?1').bind(id).first();
  const member = await env.DB.prepare(
    'SELECT cm.clan_id,c.name AS clan_name FROM clan_members cm LEFT JOIN clans c ON c.id=cm.clan_id WHERE cm.telegram_id=?1'
  ).bind(id).first();
  return {
    pid,
    name: cleanName((player && player.nickname) || user.first_name || user.username || 'Игрок'),
    classKey: String((player && player.class_key) || '').slice(0, 24),
    clanId: member ? String(member.clan_id || '').slice(0, 80) : '',
    clanName: member ? String(member.clan_name || '').trim().slice(0, 24) : '',
  };
}

function wsJson(ws, data) {
  try { ws.send(JSON.stringify(data)); return true; } catch (_) { return false; }
}

function attOf(ws) {
  try { return ws.deserializeAttachment() || {}; } catch (_) { return {}; }
}

function packetFromAtt(a) {
  return {
    i: a.pid, n: a.name, c: a.classKey || 'ГЕРОЙ', g: a.clanId || '', cn: String(a.clanName || '').slice(0, 24),
    x: Number(a.x) || 0, y: Number(a.y) || 0,
    h: Math.max(0, Number(a.h) || 0), m: Math.max(1, Number(a.m) || 1),
    f: Number.isFinite(Number(a.f)) ? Number(a.f) : 1, a: String(a.a || 'idle').slice(0, 12),
    l: Math.max(1, Math.min(999, Math.round(Number(a.l) || 1))),
    b: Math.max(0, Math.round(Number(a.b) || 0)),
    p: String(a.partyId || ''), q: Number(a.q) || 0, t: Date.now(),
  };
}

export class RealtimeHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  sockets() { return this.ctx.getWebSockets(); }

  socketByPid(pid) {
    pid = cleanPid(pid);
    if (!pid) return null;
    for (const ws of this.sockets()) if (attOf(ws).pid === pid) return ws;
    return null;
  }

  roomCount(room) {
    room = cleanRoom(room);
    const ids = new Set();
    for (const ws of this.sockets()) {
      const a = attOf(ws);
      if (a.pid && cleanRoom(a.room) === room) ids.add(a.pid);
    }
    return ids.size;
  }

  syncRoom(ws, a, requested, now = Date.now()) {
    const oldRaw = String(a.room || 'safe');
    const oldRoom = cleanRoom(oldRaw);
    const room = cleanRoom(requested || oldRaw);
    const moved = oldRoom !== room;
    if (moved) this.roomBroadcast(oldRoom, { type: 'leave', id: a.pid, room: oldRoom, ts: now }, ws);
    if (moved || oldRaw !== room) {
      a.room = room;
      ws.serializeAttachment(a);
    }
    if (moved) this.roomBroadcast(room, { type: 'join', player: packetFromAtt(a), room, ts: now }, ws);
    return { room, moved };
  }

  sendOnlineCount() {
    const ids = new Set();
    for (const ws of this.sockets()) { const a = attOf(ws); if (a.pid) ids.add(a.pid); }
    const count = ids.size, ts = Date.now();
    for (const ws of this.sockets()) {
      const a = attOf(ws), room = cleanRoom(a.room);
      wsJson(ws, { type: 'online', count, room, roomCount: this.roomCount(room), ts });
    }
  }

  sendRoomSnapshot(ws, room) {
    room = cleanRoom(room);
    const players = [];
    for (const other of this.sockets()) {
      if (other === ws) continue;
      const a = attOf(other);
      if (cleanRoom(a.room) === room && a.pid && Number.isFinite(Number(a.x)) && Number.isFinite(Number(a.y))) players.push(packetFromAtt(a));
    }
    wsJson(ws, { type: 'snapshot', room, players, roomCount: players.length + 1, ts: Date.now() });
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

  partyLeaders() {
    if (!this._partyLeaders) this._partyLeaders = new Map();
    return this._partyLeaders;
  }

  partyLeader(partyId, preferred = '') {
    partyId = String(partyId || '');
    if (!partyId) return '';
    const live = [];
    for (const ws of this.sockets()) {
      const a = attOf(ws);
      if (String(a.partyId || '') === partyId && a.pid) live.push(String(a.pid));
    }
    if (!live.length) {
      this.partyLeaders().delete(partyId);
      return '';
    }
    let leader = String(this.partyLeaders().get(partyId) || '');
    const pref = String(preferred || '');
    if (pref && live.includes(pref)) leader = pref;
    if (!leader || !live.includes(leader)) leader = live[0];
    this.partyLeaders().set(partyId, leader);
    return leader;
  }

  sendPartyState(partyId) {
    partyId = String(partyId || '');
    if (!partyId) return;
    const live = [];
    for (const ws of this.sockets()) {
      const a = attOf(ws);
      if (a.partyId === partyId) live.push({ ws, a });
    }
    if (!live.length) {
      this.partyLeaders().delete(partyId);
      return;
    }
    const leaderId = this.partyLeader(partyId);
    const members = live.map(({ a }) => ({
      id: a.pid,
      name: a.name,
      cls: a.classKey || '',
      level: Math.max(1, Number(a.l) || 1),
      bm: Math.max(0, Number(a.b) || 0),
      room: cleanRoom(a.room),
      hp: Math.max(0, Number(a.h) || 0),
      mhp: Math.max(1, Number(a.m) || 1),
      leader: String(a.pid || '') === leaderId,
    }));
    for (const x of live) wsJson(x.ws, { type: 'party-state', partyId, leaderId, members, ts: Date.now() });
  }

  async fetch(request) {
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const pid = String(request.headers.get('x-ppa-player-id') || '');
    const telegramId = String(request.headers.get('x-ppa-telegram-id') || '');
    const name = cleanName(request.headers.get('x-ppa-player-name') || 'Игрок');
    const clanId = String(request.headers.get('x-ppa-clan-id') || '').slice(0, 80);
    const classKey = String(request.headers.get('x-ppa-class-key') || '').slice(0, 24);
    if (!pid || !telegramId) return new Response('Unauthorized', { status: 401 });

    for (const old of this.sockets()) {
      const a = attOf(old);
      if (a.pid === pid) { try { old.close(4001, 'Reconnected'); } catch (_) {} }
    }

    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pid, telegramId, name, clanId, classKey, room: 'safe', partyId: '', lastChat: 0, lastMove: 0, q: 0, l: 1, b: 0 });
    wsJson(server, { type: 'hello', pid, name, clanId, room: 'safe', ts: Date.now() });
    this.sendOnlineCount();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 4096) return;
    let m = null;
    try { m = JSON.parse(message); } catch (_) { return; }
    if (!m || typeof m !== 'object') return;
    const a = attOf(ws), now = Date.now();

    if (m.type === 'ping') {
      const sr = this.syncRoom(ws, a, m.room || a.room, now);
      if (sr.moved) this.sendOnlineCount();
      this.sendRoomSnapshot(ws, sr.room);
      wsJson(ws, { type: 'pong', room: sr.room, roomCount: this.roomCount(sr.room), ts: now });
      return;
    }

    if (m.type === 'room') {
      const sr = this.syncRoom(ws, a, m.room, now);
      // Always serialize the canonical room, even when it only differed in formatting.
      a.room = sr.room;
      ws.serializeAttachment(a);
      this.sendRoomSnapshot(ws, sr.room);
      if (sr.moved) this.sendOnlineCount();
      if (a.partyId) this.sendPartyState(a.partyId);
      return;
    }

    if (m.type === 'move') {
      const sr = this.syncRoom(ws, a, m.room || a.room, now);
      if (sr.moved) {
        this.sendOnlineCount();
        this.sendRoomSnapshot(ws, sr.room);
      }
      if (now - (Number(a.lastMove) || 0) < 90) return;
      a.lastMove = now;
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
      a.room = sr.room;
      ws.serializeAttachment(a);
      this.roomBroadcast(sr.room, { type: 'move', player: packetFromAtt(a), room: sr.room }, ws);
      return;
    }

    if (m.type === 'party-invite') {
      const targetPid = cleanPid(m.target);
      const targetWs = this.socketByPid(targetPid);
      if (!targetWs) { wsJson(ws, { type: 'party-notice', ok: false, message: 'Игрок уже не в сети.' }); return; }
      if (targetPid === a.pid) { wsJson(ws, { type: 'party-notice', ok: false, message: 'Себя пригласить нельзя.' }); return; }
      if (a.partyId) {
        let count = 0;
        for (const x of this.sockets()) if (attOf(x).partyId === a.partyId) count++;
        if (count >= 5) { wsJson(ws, { type: 'party-notice', ok: false, message: 'В группе уже 5 игроков.' }); return; }
      }
      const ta = attOf(targetWs);
      if (a.partyId && ta.partyId && a.partyId === ta.partyId) { wsJson(ws, { type: 'party-notice', ok: false, message: 'Игрок уже в твоей группе.' }); return; }
      wsJson(targetWs, { type: 'party-invite', from: { id: a.pid, name: a.name, level: Math.max(1, Number(a.l) || 1), bm: Math.max(0, Number(a.b) || 0) }, ts: now });
      wsJson(ws, { type: 'party-notice', ok: true, message: 'Приглашение отправлено игроку ' + ta.name + '.' });
      return;
    }

    if (m.type === 'party-accept') {
      const fromPid = cleanPid(m.from);
      const inviterWs = this.socketByPid(fromPid);
      if (!inviterWs) { wsJson(ws, { type: 'party-notice', ok: false, message: 'Пригласивший игрок уже не в сети.' }); return; }
      const ia = attOf(inviterWs);
      if (a.partyId && ia.partyId && a.partyId !== ia.partyId) { wsJson(ws, { type: 'party-notice', ok: false, message: 'Сначала покинь текущую группу.' }); return; }
      const partyId = ia.partyId || a.partyId || ('party_' + crypto.randomUUID());
      let members = 0;
      for (const x of this.sockets()) if (attOf(x).partyId === partyId) members++;
      const addCount = (ia.partyId === partyId ? 0 : 1) + (a.partyId === partyId ? 0 : 1);
      if (members + addCount > 5) { wsJson(ws, { type: 'party-notice', ok: false, message: 'В группе уже 5 игроков.' }); return; }
      ia.partyId = partyId; a.partyId = partyId;
      inviterWs.serializeAttachment(ia); ws.serializeAttachment(a);
      this.partyLeader(partyId, ia.pid);
      this.sendPartyState(partyId);
      wsJson(inviterWs, { type: 'party-notice', ok: true, message: a.name + ' вступил(а) в группу.' });
      wsJson(ws, { type: 'party-notice', ok: true, message: 'Ты вступил(а) в группу.' });
      return;
    }

    if (m.type === 'party-kick') {
      const partyId = String(a.partyId || '');
      const targetPid = cleanPid(m.target);
      if (!partyId || !targetPid) { wsJson(ws, { type: 'party-notice', ok: false, message: 'Группа не найдена.' }); return; }
      const leaderId = this.partyLeader(partyId);
      if (leaderId !== String(a.pid || '')) { wsJson(ws, { type: 'party-notice', ok: false, message: 'Исключать игроков может только лидер группы.' }); return; }
      if (targetPid === String(a.pid || '')) { wsJson(ws, { type: 'party-notice', ok: false, message: 'Используй «Покинуть группу».' }); return; }
      const targetWs = this.socketByPid(targetPid);
      if (!targetWs) { wsJson(ws, { type: 'party-notice', ok: false, message: 'Игрок уже не в сети.' }); return; }
      const ta = attOf(targetWs);
      if (String(ta.partyId || '') !== partyId) { wsJson(ws, { type: 'party-notice', ok: false, message: 'Игрок уже не в этой группе.' }); return; }
      ta.partyId = '';
      targetWs.serializeAttachment(ta);
      wsJson(targetWs, { type: 'party-state', partyId: '', leaderId: '', members: [], ts: now });
      wsJson(targetWs, { type: 'party-notice', ok: false, message: 'Ты исключён(а) из группы.' });
      wsJson(ws, { type: 'party-notice', ok: true, message: ta.name + ' исключён(а) из группы.' });
      this.sendPartyState(partyId);
      return;
    }

    if (m.type === 'party-decline') {
      const fromPid = cleanPid(m.from), inviterWs = this.socketByPid(fromPid);
      if (inviterWs) wsJson(inviterWs, { type: 'party-notice', ok: false, message: a.name + ' отклонил(а) приглашение.' });
      return;
    }

    if (m.type === 'party-leave') {
      const oldParty = String(a.partyId || '');
      if (!oldParty) { wsJson(ws, { type: 'party-state', partyId: '', members: [], ts: now }); return; }
      const wasLeader = this.partyLeader(oldParty) === String(a.pid || '');
      a.partyId = ''; ws.serializeAttachment(a);
      wsJson(ws, { type: 'party-state', partyId: '', leaderId: '', members: [], ts: now });
      if (wasLeader) this.partyLeaders().delete(oldParty);
      this.sendPartyState(oldParty);
      return;
    }

    if (m.type === 'chat') {
      if (now - (Number(a.lastChat) || 0) < 450) { wsJson(ws, { type: 'chat-error', channel: String(m.channel || 'general'), message: 'Слишком быстро.' }); return; }
      const text = cleanText(m.text);
      if (!text) return;
      const channel = ['general', 'clan', 'party', 'private'].includes(m.channel) ? m.channel : 'general';
      const target = cleanName(m.target || '');
      a.lastChat = now; ws.serializeAttachment(a);
      const payload = { type: 'chat', channel, from: a.name, fromId: a.pid, text, target: channel === 'private' ? target : '', ts: now };
      let delivered = 0;
      for (const other of this.sockets()) {
        if (other === ws) continue;
        const b = attOf(other);
        let ok = false;
        if (channel === 'general') ok = true;
        else if (channel === 'clan') ok = !!a.clanId && a.clanId === b.clanId;
        else if (channel === 'party') ok = !!a.partyId && a.partyId === b.partyId;
        else if (channel === 'private') ok = !!target && lowerName(b.name) === lowerName(target);
        if (ok && wsJson(other, payload)) delivered++;
      }
      if (channel === 'clan' && !a.clanId) wsJson(ws, { type: 'chat-error', channel, message: 'Ты не состоишь в клане.' });
      else if (channel === 'party' && !a.partyId) wsJson(ws, { type: 'chat-error', channel, message: 'Сначала создай группу или прими приглашение.' });
      else if (channel === 'private' && delivered === 0) wsJson(ws, { type: 'chat-error', channel, message: 'Игрок «' + target + '» сейчас не в сети.' });
      return;
    }
  }

  async webSocketClose(ws) {
    const a = attOf(ws);
    if (a && a.room && a.pid) this.roomBroadcast(cleanRoom(a.room), { type: 'leave', id: a.pid, room: cleanRoom(a.room), ts: Date.now() }, ws);
    const partyId = String((a && a.partyId) || '');
    if (partyId) setTimeout(() => this.sendPartyState(partyId), 0);
    this.sendOnlineCount();
  }

  async webSocketError(ws) {
    const a = attOf(ws);
    if (a && a.room && a.pid) this.roomBroadcast(cleanRoom(a.room), { type: 'leave', id: a.pid, room: cleanRoom(a.room), ts: Date.now() }, ws);
    const partyId = String((a && a.partyId) || '');
    if (partyId) setTimeout(() => this.sendPartyState(partyId), 0);
    this.sendOnlineCount();
  }
}

export async function handleRealtimeRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/realtime/ticket') {
    if (request.method !== 'POST') return json({ ok: false, message: 'POST required' }, 405);
    try {
      let body = {}; try { body = await request.json(); } catch (_) {}
      const user = await validateInitData(body.initData || request.headers.get('x-telegram-init-data') || '', env.BOT_TOKEN);
      if (!env.DB || !env.REALTIME) throw Object.assign(new Error('Realtime server is not configured'), { status: 503 });
      const ident = await playerIdentity(env, user);
      const payload = { ...ident, exp: Date.now() + 90_000, nonce: crypto.randomUUID() };
      return json({ ok: true, ticket: await makeTicket(payload, env.BOT_TOKEN), user: { id: ident.pid, name: ident.name }, expiresIn: 90 });
    } catch (e) {
      return json({ ok: false, message: String((e && e.message) || 'Realtime auth error') }, Number(e && e.status) || 500);
    }
  }

  if (url.pathname === '/api/realtime/ws') {
    try {
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
      if (!env.REALTIME) return new Response('Realtime binding missing', { status: 503 });
      const p = await readTicket(url.searchParams.get('ticket') || '', env.BOT_TOKEN);
      const pid = cleanPid(p.pid);
      if (!pid) throw Object.assign(new Error('Realtime player ID invalid'), { status: 401 });

      // New tickets expose only the opaque realtime pid. Telegram ID is resolved
      // server-side at websocket upgrade and is never broadcast as the player id.
      let telegramId = '';
      if (pid.startsWith('p:')) {
        await ensureRealtimePidSchema(env);
        const row = await env.DB.prepare(
          'SELECT telegram_id FROM players WHERE realtime_pid=?1 LIMIT 1'
        ).bind(pid).first();
        telegramId = String((row && row.telegram_id) || '');
      } else {
        // 90-second rolling compatibility for tickets issued before this deploy.
        telegramId = String(p.telegramId || '');
      }
      if (!telegramId) throw Object.assign(new Error('Realtime account not found'), { status: 401 });

      const id = env.REALTIME.idFromName('ppa-global-v1');
      const stub = env.REALTIME.get(id);
      const h = new Headers(request.headers);
      h.set('x-ppa-player-id', pid);
      h.set('x-ppa-telegram-id', telegramId);
      h.set('x-ppa-player-name', p.name);
      h.set('x-ppa-clan-id', p.clanId || '');
      h.set('x-ppa-clan-name', p.clanName || '');
      h.set('x-ppa-class-key', p.classKey || '');
      return stub.fetch(new Request(request, { headers: h }));
    } catch (e) {
      return new Response(String((e && e.message) || 'Realtime auth error'), { status: Number(e && e.status) || 401 });
    }
  }
  return null;
}