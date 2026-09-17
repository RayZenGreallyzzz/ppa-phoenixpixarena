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

function wsJson(ws, data) {
  try { ws.send(JSON.stringify(data)); return true; } catch (_) { return false; }
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

    // Important: accept the replacement socket BEFORE closing the previous one.
    // Otherwise the close event can briefly announce a false leave to everybody.
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
      q: 0, l: 1, b: 0,
    });

    wsJson(server, { type: 'hello', pid, name, clanId, ts: Date.now() });

    for (const old of oldSockets) {
      try { old.close(4001, 'Reconnected'); } catch (_) {}
    }

    this.sendOnlineCount();
    return new Response(null, { status: 101, webSocket: client });
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

    // A Telegram/WebView reconnect must not make the character disappear.
    // Keep the old presence for a short grace period and only announce LEAVE
    // if no replacement socket for the same Telegram player exists.
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
