import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Tests the actual server route without Cloudflare or touching player data.
const src = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const start = src.indexOf('async function handlePhoenixGameApi(');
const end = src.indexOf('\nasync function handlePhoenixLauncherApi(', start);
assert(start >= 0 && end > start, 'Native game handler missing');
const code = src.slice(start, end);
const playerId = '987654321';
const seen = [];
function harness({ telegramId = playerId, unauthorized = false, gameId = 'phoenix-pix-arena', account = true } = {}) {
  const deps = {
    ensurePhoenixAuthSchema: async () => {},
    phoenixGameSessionFromRequest: async () => {
      if (unauthorized) throw Object.assign(new Error('Missing'), { status: 401, code: 'GAME_SESSION_MISSING' });
      return { accountId: 'px_account', gameId };
    },
    phoenixAccountRow: async (_, id) => {
      assert.equal(id, 'px_account');
      return account ? { telegram_id: telegramId } : null;
    },
    nativeRealtimeTicketForLinkedTelegram: async (_env, id) => {
      seen.push(id);
      return { ok: true, ticket: 'FAKE_TEST_TICKET', user: { id: 'p:0123456789abcdef0123456789abcdef' }, expiresIn: 90 };
    },
    json: (data, status = 200) => ({ status, data }),
    apiError: (message, status, code) => ({ status, data: { ok: false, code, message } }),
    console: { error() {} },
  };
  return new Function(...Object.keys(deps), code + '\nreturn handlePhoenixGameApi;')(...Object.values(deps));
}
const url = new URL('https://example.test/api/game/realtime/ticket?telegramId=malicious');
const fake = { method: 'POST', json: async () => ({ telegramId: 'attacker' }) };
const disabled = await harness()(fake, {}, url);
assert.equal(disabled.status, 404);
assert.deepEqual(seen, []);
const env = { PPA_GODOT_REALTIME_ENABLED: '1' };
const h = harness();
const valid = await h(fake, env, url);
assert.equal(valid.status, 200);
assert.equal(valid.data.ticket, 'FAKE_TEST_TICKET');
assert.deepEqual(seen, [playerId], 'Never take client-supplied Telegram ID');
assert.equal((await h({ method: 'GET' }, env, url)).status, 405);
assert.equal((await harness({ unauthorized: true })(fake, env, url)).status, 401);
assert.equal((await harness({ gameId: 'another-game' })(fake, env, url)).status, 403);
assert.equal((await harness({ telegramId: '' })(fake, env, url)).data.code, 'TELEGRAM_NOT_LINKED');
assert.equal((await harness({ account: false })(fake, env, url)).status, 404);
assert.deepEqual(seen, [playerId]);

// Share the same realtime_pid and existing WebSocket/DO with Telegram.
const rt = readFileSync(new URL('../src/realtime.js', import.meta.url), 'utf8');
assert(rt.includes('export async function nativeRealtimeTicketForLinkedTelegram('));
const native = rt.slice(rt.indexOf('export async function nativeRealtimeTicketForLinkedTelegram('), rt.indexOf('\nfunction wsJson('));
assert(native.includes('realtimePidFor(env, id)'));
assert(native.includes('makeTicket(payload, env.BOT_TOKEN)'));
assert(native.includes('SELECT nickname,class_key FROM players WHERE telegram_id=?1'));
assert(!native.includes('ensureRealtimePlayerRow('), 'Native must not overwrite Telegram profile');
assert(rt.includes("env.REALTIME.idFromName('ppa-global-v1')"));
assert(rt.includes("if (a.pid === pid) { try { old.close(4001, 'Reconnected')"));
console.log('PPA_NATIVE_SHARED_REALTIME_CONTRACT_OK signed_session=1 original_pid=1 original_hub=1 closed_by_default=1 spoof_denied=1 writes_to_save=0');
