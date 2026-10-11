import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NATIVE_NPC_SERVICES, projectNativeNpcReadOnly } from '../src/native-npc-readonly.js';

// Offline staging rehearsal against the ACTUAL Worker route, not a made-up
// duplicate router. Every save is synthetic. No D1/Cloudflare access or writes.
const source = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const begin = source.indexOf('async function handlePhoenixGameApi(');
const end = source.indexOf('\nasync function handlePhoenixLauncherApi(', begin);
assert(begin >= 0 && end > begin, 'Worker API handler moved: audit before rollout');
const synthetic = {
  a: {
    gold: 2480, ppa: 320, gram: 8.5, arenaTokens: 12,
    stones: { normal: 4, premium: 2, rune: 1 },
    materials: { 'Серебряная руда': 15 }, feathers: { phoenix: 3 },
    pvp: { rating: 1210, wins: 4, losses: 2, attemptsRemaining: 1 },
    blackMarket: { refreshAt: Date.now() + 3600000,
      offers: [{ id: 'limited-rune', category: 'materials', price: 770,
        currency: 'ppa', limit: 2, item: { name: 'Руна PPA', stats: { attack: 2 } } }],
      bought: { 'limited-rune': 1 } },
    storage: { personal: [{ uid: 'item-a', enh: 7 }], premium: [], clan: [] }
  },
  b: {
    gold: 23, ppa: 7, gram: 0, arenaTokens: 0,
    materials: {}, pvp: { rating: 915, wins: 1, losses: 9 },
    blackMarket: { refreshAt: Date.now() - 1000,
      offers: [{ id: 'expired', price: 99 }], bought: { expired: 1 } },
    storage: { personal: [], premium: [], clan: [] }
  }
};
const original = JSON.stringify(synthetic);
const accountToTelegram = { a: '99111111', b: '99222222', absent: '' };
const telegramToAccount = { '99111111': 'a', '99222222': 'b' };
const versions = { a: 27, b: 14 };
const trace = { saves: [], auth: [], writes: 0, stateActions: 0 };
const deps = {
  ensurePhoenixAuthSchema: async () => {},
  phoenixGameSessionFromRequest: async (req) => {
    trace.auth.push(req.token);
    if (!['a', 'b', 'absent', 'missing'].includes(req.token)) {
      throw Object.assign(new Error('Not authorized'), {
        status: 401, code: 'GAME_SESSION_INVALID'
      });
    }
    return { gameId: req.game || 'phoenix-pix-arena', accountId: req.token };
  },
  phoenixAccountRow: async (_env, id) => ({
    telegram_id: accountToTelegram[id] ?? (id === 'missing' ? '99999999' : '')
  }),
  loadSave: async (_env, id) => {
    trace.saves.push(id);
    if (id === '99999999')
      return { ok: true, bootstrapFromProfile: true, state: null, version: 0 };
    const key = telegramToAccount[id];
    assert(key, 'Never read an account from client-supplied owner ID');
    return { ok: true, state: synthetic[key], version: versions[key],
      updatedAt: 1750000000000 };
  },
  saveGameState: async () => { trace.writes++; throw Error('Save write reached'); },
  NATIVE_NPC_SERVICES,
  projectNativeNpcReadOnly,
  json: (data, status = 200) => ({ status, data }),
  apiError: (message, status, code) => ({ status, data: { ok: false, code, message } }),
  console: { error: () => {} },
  sharedMerchantOperation: async () => { trace.stateActions++; throw Error('Merchant action reached'); },
  sharedForgeOperation: async () => { trace.stateActions++; throw Error('Forge action reached'); },
  sharedInventoryOperation: async () => { trace.stateActions++; throw Error('Inventory action reached'); },
  sharedStorageOperation: async () => { trace.stateActions++; throw Error('Storage action reached'); },
  sharedClanStorageOperation: async () => { trace.stateActions++; throw Error('Clan storage action reached'); },
  nativeClanOperation: async () => { trace.stateActions++; throw Error('Clan action reached'); },
  nativeAuctionReadOnly: async () => { trace.stateActions++; throw Error('Auction read reached'); },
  sharedAuctionAction: async () => { trace.stateActions++; throw Error('Auction action reached'); },
};
const handle = new Function(...Object.keys(deps),
  source.slice(begin, end) + '\nreturn handlePhoenixGameApi;')(...Object.values(deps));

const readOnly = {
  PPA_GODOT_STATE_READ_ENABLED: '1',
  PPA_GODOT_NPC_READ_ENABLED: '1',
  PPA_GODOT_CLAN_READ_ENABLED: '1',
  PPA_MERCHANT_READ_ENABLED: '1',
  PPA_FORGE_READ_ENABLED: '1',
  PPA_INVENTORY_READ_ENABLED: '1',
  PPA_PERSONAL_STORAGE_READ_ENABLED: '1',
  PPA_CLAN_STORAGE_READ_ENABLED: '1',
  PPA_AUCTION_READ_ENABLED: '1',
};
const req = (token = 'a', method = 'GET', action = 'buy') => ({
  method, token,
  json: async () => ({ action, ownerId: '99222222', telegramId: '99222222',
    id: 'forged-gold', qty: 999, price: 0, version: 1000 })
});
const route = (path) => ({ pathname: path,
  searchParams: new URLSearchParams({ telegramId: '99222222',
    ownerId: '99222222', price: '0', qty: '999' }) });
const call = (path, env = readOnly, request = req()) => handle(request, env, route(path));

const npc = '/api/game/npc/merchant';
const savesBeforeOff = trace.saves.length;
for (const env of [{}, { PPA_GODOT_STATE_READ_ENABLED: '1' },
  { PPA_GODOT_NPC_READ_ENABLED: '1' }]) {
  const result = await call(npc, env);
  assert.equal(result.status, 404, 'Both explicit read flags required');
  assert.equal(result.data.code, 'NOT_FOUND');
}
assert.equal(trace.saves.length, savesBeforeOff, 'Default OFF read any existing PPA save');

for (const token of ['a', 'b']) {
  const account = token === 'a' ? '99111111' : '99222222';
  const state = synthetic[token];
  for (const service of NATIVE_NPC_SERVICES) {
    const result = await call('/api/game/npc/' + service, readOnly, req(token));
    assert.equal(result.status, 200, service + ' read rejected');
    const response = result.data;
    assert.equal(response.ownerId, account, 'Owner must come from signed account');
    assert.equal(response.gameId, 'phoenix-pix-arena');
    assert.equal(response.service, service);
    assert.equal(response.readOnly, true);
    assert.equal(response.version, versions[token]);
    assert.equal(response.data.actionsEnabled, false);
    assert.equal(response.data.currency.ppa, state.ppa);
    assert.equal(response.data.currency.gram, state.gram);
    if (service === 'arena') {
      assert.equal(response.data.rating, state.pvp.rating);
      assert.equal(response.data.wins, state.pvp.wins);
    }
    if (service === 'forge' && token === 'a') {
      assert.equal(response.data.materials['Серебряная руда'], 15);
      assert.equal(response.data.feathers.phoenix, 3);
    }
    if (service === 'blackmarket') {
      if (token === 'a') {
        assert.equal(response.data.offers[0].bought, 1);
        assert.equal(response.data.offers[0].item.name, 'Руна PPA');
        assert.equal(response.data.offers[0].limit, 2);
      } else {
        assert.deepEqual(response.data.offers, [], 'Expired stock cannot be sold');
      }
    }
  }
}
const after = trace.saves.length;
assert.equal(after - savesBeforeOff, NATIVE_NPC_SERVICES.length * 2,
  'Each NPC GET must read exactly one signed character');
assert.equal((await call('/api/game/state')).data.state, synthetic.a,
  'Native GET must show same source as Telegram legacy D1 save');
assert.equal((await call('/api/game/npc/arena', readOnly, req('b'))).data.ownerId, '99222222');
for (const [token, want] of [
  ['absent', 409], ['missing', 409], ['invalid', 401]
]) assert.equal((await call(npc, readOnly, req(token))).status, want);
assert.equal((await call(npc, readOnly, { ...req('a'), game: 'unrelated-game' })).status, 403);
assert.equal((await call('/api/game/npc/not-a-service')).status, 404);
assert.equal((await call(npc, readOnly, req('a', 'POST'))).status, 405);

const disabledWrites = [
  ['/api/game/clan/action', 'create'],
  ['/api/game/merchant/action', 'buy'],
  ['/api/game/forge/action', 'craft'],
  ['/api/game/forge/action', 'enhance'],
  ['/api/game/inventory/action', 'equip'],
  ['/api/game/storage/personal/action', 'put'],
  ['/api/game/storage/clan/action', 'take'],
  ['/api/game/auction/action', 'buy'],
];
const beforeActions = trace.saves.length;
for (const [path, action] of disabledWrites) {
  const result = await call(path, readOnly, req('a', 'POST', action));
  assert.equal(result.status, 404, path + ' write unexpectedly opened');
  assert.equal(result.data.code, 'NOT_FOUND');
}
assert.equal(trace.saves.length, beforeActions, 'Blocked writes must not even load a save');
assert.equal(trace.writes, 0, 'No source of PPA money or items changed');
assert.equal(trace.stateActions, 0, 'No shared economy operation was invoked');
assert.equal(JSON.stringify(synthetic), original, 'A read-only rollout mutated Telegram saves');
console.log('PPA_NPC_ROLLOUT_MATRIX_OK owners=2 services=9 legacy_D1=shared valid_stock=1 expired_stock=blocked actions=8=no-write off_by_default=1');
