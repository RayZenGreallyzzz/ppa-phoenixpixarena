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

async function playerIdentity(env, user) {
  const id = String(user.id);
  const player = await env.DB.prepare('SELECT nickname,class_key,telegram_first_name,telegram_username FROM players WHERE telegram_id=?1').bind(id).first();
  const member = await env.DB.prepare('SELECT clan_id FROM clan_members WHERE telegram_id=?1').bind(id).first();
  return {
    telegramId: id,
    pid: 'tg:' + id,
    name: cleanName((player && player.nickname) || user.first_name || user.username || ('TG ' + id)),
    classKey: String((player && player.class_key) || '').slice(0, 24),
    clanId: member ? String(member.clan_id || '').slice(0, 80) : '',
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
    i: a.pid, n: a.name, c: a.classKey || 'ГЕРОЙ', g: a.clanId || '', cn: '',
    x: Number(a.x) || 0, y: Number(a.y) || 0,
    h: Math.max(0, Number(a.h) || 0), m: Math.max(1, Number(a.m) || 1),
    f: Number(a.f) || 1, a: String(a.a || 'idle').slice(0, 12), q: Number(a.q) || 0, t: Date.now(),
  };
}

export class RealtimeHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  sockets() { return this.ctx.getWebSockets(); }

  sendOnlineCount() {
    const ids = new Set();
    for (const ws of this.sockets()) { const a = attOf(ws); if (a.pid) ids.add(a.pid); }
    const msg = JSON.stringify({ type: 'online', count: ids.size, ts: Date.now() });
    for (const ws of this.sockets()) { try { ws.send(msg); } catch (_) {} }
  }

  sendRoomSnapshot(ws, room) {
    const players = [];
    for (const other of this.sockets()) {
      if (other === ws) continue;
      const a = attOf(other);
      if (a.room === room && a.pid && Number.isFinite(Number(a.x)) && Number.isFinite(Number(a.y))) players.push(packetFromAtt(a));
    }
    wsJson(ws, { type: 'snapshot', room, players, ts: Date.now() });
  }

  roomBroadcast(room, data, except) {
    const raw = JSON.stringify(data);
    for (const ws of this.sockets()) {
      if (ws === except) continue;
      const a = attOf(ws);
      if (a.room !== room) continue;
      try { ws.send(raw); } catch (_) {}
    }
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
    server.serializeAttachment({ pid, telegramId, name, clanId, classKey, room: 'safe', lastChat: 0, lastMove: 0, q: 0 });
    wsJson(server, { type: 'hello', pid, name, clanId, ts: Date.now() });
    this.sendOnlineCount();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 4096) return;
    let m = null;
    try { m = JSON.parse(message); } catch (_) { return; }
    if (!m || typeof m !== 'object') return;
    const a = attOf(ws), now = Date.now();

    if (m.type === 'ping') { wsJson(ws, { type: 'pong', ts: now }); return; }

    if (m.type === 'room') {
      const oldRoom = cleanRoom(a.room), room = cleanRoom(m.room);
      if (oldRoom !== room) {
        this.roomBroadcast(oldRoom, { type: 'leave', id: a.pid, room: oldRoom, ts: now }, ws);
        a.room = room;
        ws.serializeAttachment(a);
        this.roomBroadcast(room, { type: 'join', player: packetFromAtt(a), room, ts: now }, ws);
      }
      this.sendRoomSnapshot(ws, room);
      return;
    }

    if (m.type === 'move') {
      if (now - (Number(a.lastMove) || 0) < 90) return;
      a.lastMove = now;
      a.x = Number.isFinite(Number(m.x)) ? Math.round(Number(m.x) * 10) / 10 : Number(a.x) || 0;
      a.y = Number.isFinite(Number(m.y)) ? Math.round(Number(m.y) * 10) / 10 : Number(a.y) || 0;
      a.h = Math.max(0, Math.round(Number(m.h) || 0));
      a.m = Math.max(1, Math.round(Number(m.m) || 1));
      a.f = Math.max(1, Math.min(8, Math.round(Number(m.f) || 1)));
      a.a = String(m.a || 'idle').slice(0, 12);
      a.q = (Number(a.q) || 0) + 1;
      ws.serializeAttachment(a);
      this.roomBroadcast(cleanRoom(a.room), { type: 'move', player: packetFromAtt(a) }, ws);
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
        else if (channel === 'party') ok = !!a.room && a.room === b.room;
        else if (channel === 'private') ok = !!target && lowerName(b.name) === lowerName(target);
        if (ok && wsJson(other, payload)) delivered++;
      }
      if (channel === 'clan' && !a.clanId) wsJson(ws, { type: 'chat-error', channel, message: 'Ты не состоишь в клане.' });
      else if (channel === 'private' && delivered === 0) wsJson(ws, { type: 'chat-error', channel, message: 'Игрок «' + target + '» сейчас не в сети.' });
      return;
    }
  }

  async webSocketClose(ws) {
    const a = attOf(ws);
    if (a && a.room && a.pid) this.roomBroadcast(cleanRoom(a.room), { type: 'leave', id: a.pid, room: cleanRoom(a.room), ts: Date.now() }, ws);
    this.sendOnlineCount();
  }

  async webSocketError(ws) {
    const a = attOf(ws);
    if (a && a.room && a.pid) this.roomBroadcast(cleanRoom(a.room), { type: 'leave', id: a.pid, room: cleanRoom(a.room), ts: Date.now() }, ws);
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
      const id = env.REALTIME.idFromName('ppa-global-v1');
      const stub = env.REALTIME.get(id);
      const h = new Headers(request.headers);
      h.set('x-ppa-player-id', p.pid);
      h.set('x-ppa-telegram-id', p.telegramId);
      h.set('x-ppa-player-name', p.name);
      h.set('x-ppa-clan-id', p.clanId || '');
      h.set('x-ppa-class-key', p.classKey || '');
      return stub.fetch(new Request(request, { headers: h }));
    } catch (e) {
      return new Response(String((e && e.message) || 'Realtime auth error'), { status: Number(e && e.status) || 401 });
    }
  }
  return null;
}
