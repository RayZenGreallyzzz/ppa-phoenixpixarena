const encoder = new TextEncoder();

const PPA_TON_TREASURY = 'UQCMgQWdxCPSkC87_JTUpCLMowIr4Ol4qYg3kZBWzNcH61Dx';
const PPA_TON_TREASURY_RAW = '0:8c81059dc423d2902f3bfc94d4a422cca3022be0e978a98837919056ccd707eb';

function tonRawAddress(v) {
  v = String(v || '').trim();
  if (/^(?:-1|0):[0-9a-fA-F]{64}$/.test(v)) return v.toLowerCase();
  if (!/^(?:EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(v)) return '';
  try {
    let s = v.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    if (bin.length !== 36) return '';
    let wc = bin.charCodeAt(1);
    if (wc > 127) wc -= 256;
    if (wc !== 0 && wc !== -1) return '';
    let h = '';
    for (let i = 2; i < 34; i++) h += bin.charCodeAt(i).toString(16).padStart(2, '0');
    return String(wc) + ':' + h;
  } catch (_) {
    return '';
  }
}

function tonHashToHex(v) {
  v = String(v || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return v.toLowerCase();
  try {
    let s = v.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    if (bin.length !== 32) return '';
    let h = '';
    for (let i = 0; i < bin.length; i++) h += bin.charCodeAt(i).toString(16).padStart(2, '0');
    return h;
  } catch (_) {
    return '';
  }
}

function tonAmountToNano(v) {
  let s = String(v == null ? '' : v).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,9})?$/.test(s)) return null;
  let [whole, frac = ''] = s.split('.');
  whole = whole.replace(/^0+(?=\d)/, '');
  frac = (frac + '000000000').slice(0, 9);
  try {
    const n = BigInt(whole || '0') * 1000000000n + BigInt(frac || '0');
    if (n <= 0n || n > 1000000000000000000000000n) return null;
    return n;
  } catch (_) {
    return null;
  }
}

function tonApiHeaders(env) {
  const h = { accept: 'application/json' };
  if (env && env.TONAPI_KEY) h.authorization = 'Bearer ' + String(env.TONAPI_KEY);
  return h;
}

async function tonMessageHashFromBoc(boc, env) {
  boc = String(boc || '').trim();
  if (!boc || boc.length > 250000) throw Object.assign(new Error('Некорректная TON-транзакция'), { status: 400, code: 'TON_BOC_INVALID' });
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (env && env.TONCENTER_API_KEY) headers['X-API-Key'] = String(env.TONCENTER_API_KEY);
  const r = await fetch('https://toncenter.com/api/v2/sendBocReturnHash', {
    method: 'POST',
    headers,
    body: JSON.stringify({ boc })
  });
  let d = null; try { d = await r.json(); } catch (_) {}
  if (!r.ok || !d || d.ok !== true) {
    if (r.status === 429 || r.status >= 500) return { pending: true, messageHash: '' };
    throw Object.assign(new Error('TON Center не принял подписанную транзакцию'), { status: 502, code: 'TON_BROADCAST_FAILED' });
  }
  const messageHash = tonHashToHex(d && d.result && (d.result.hash_norm || d.result.hash));
  if (!messageHash) throw Object.assign(new Error('TON Center не вернул hash транзакции'), { status: 502, code: 'TON_HASH_MISSING' });
  return { pending: false, messageHash };
}

async function tonLookupTransaction(messageHash, env) {
  messageHash = tonHashToHex(messageHash);
  if (!messageHash) throw Object.assign(new Error('Некорректный TON message hash'), { status: 400, code: 'TON_HASH_INVALID' });
  const r = await fetch('https://tonapi.io/v2/blockchain/messages/' + encodeURIComponent(messageHash) + '/transaction', {
    headers: tonApiHeaders(env)
  });
  if (r.status === 404 || r.status === 429 || r.status >= 500) return null;
  let d = null; try { d = await r.json(); } catch (_) {}
  if (!r.ok || !d) throw Object.assign(new Error('Не удалось проверить TON-транзакцию'), { status: 502, code: 'TON_VERIFY_FAILED' });
  return d;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
function hex(bytes) { return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function safeEqualHex(a,b){a=String(a||'').toLowerCase();b=String(b||'').toLowerCase();if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function hmac(keyBytes,data){const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);return crypto.subtle.sign('HMAC',key,typeof data==='string'?encoder.encode(data):data)}
async function validateInitData(initData, botToken){
  if(!botToken)throw Object.assign(new Error('BOT_TOKEN secret is not configured'),{status:503,code:'BOT_TOKEN_MISSING'});
  if(!initData||typeof initData!=='string')throw Object.assign(new Error('Telegram initData is missing'),{status:401,code:'INIT_DATA_MISSING'});
  const params=new URLSearchParams(initData),received=params.get('hash');
  if(!received)throw Object.assign(new Error('Telegram hash is missing'),{status:401,code:'HASH_MISSING'});
  params.delete('hash');
  const check=[...params.entries()].map(([k,v])=>`${k}=${v}`).sort((a,b)=>a.localeCompare(b)).join('\n');
  const secret=await hmac(encoder.encode('WebAppData'),botToken);
  const calc=hex(await hmac(new Uint8Array(secret),check));
  if(!safeEqualHex(calc,received))throw Object.assign(new Error('Telegram signature check failed'),{status:401,code:'INVALID_TELEGRAM_SIGNATURE'});
  const authDate=Number(params.get('auth_date')),now=Math.floor(Date.now()/1000);
  if(!Number.isFinite(authDate)||authDate<=0||authDate>now+300||now-authDate>86400)throw Object.assign(new Error('Telegram session has expired. Reopen the Mini App.'),{status:401,code:'INIT_DATA_EXPIRED'});
  let user=null;try{user=JSON.parse(params.get('user')||'null')}catch(_){}
  if(!user||user.id==null)throw Object.assign(new Error('Telegram user is missing'),{status:401,code:'TELEGRAM_USER_MISSING'});
  return user;
}
async function ensurePlayerOnline(env,user){
  const id=String(user.id),now=Date.now();
  await env.DB.prepare(`INSERT INTO players(telegram_id,telegram_username,telegram_first_name,telegram_last_name,nickname,nickname_key,class_key,created_at,updated_at,last_auth_at)
    VALUES(?1,?2,?3,?4,NULL,NULL,NULL,?5,?5,?5)
    ON CONFLICT(telegram_id) DO UPDATE SET telegram_username=excluded.telegram_username,telegram_first_name=excluded.telegram_first_name,telegram_last_name=excluded.telegram_last_name,last_auth_at=excluded.last_auth_at`)
    .bind(id,String(user.username||''),String(user.first_name||''),String(user.last_name||''),now).run();
  return env.DB.prepare('SELECT * FROM players WHERE telegram_id=?1').bind(id).first();
}

let schemaReady = false;

async function ensureOnlineSchema(env) {
  if (schemaReady) return;
  if (!env.DB) throw Object.assign(new Error('D1 database is not connected'), { status: 503, code: 'DB_MISSING' });
  const sql = [
    `CREATE TABLE IF NOT EXISTS clans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      leader_id TEXT NOT NULL,
      storage_unlocked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS clan_members (
      clan_id TEXT NOT NULL,
      telegram_id TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (clan_id, telegram_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id)`,
    `CREATE TABLE IF NOT EXISTS auction_lots (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      seller_name TEXT NOT NULL,
      item_json TEXT NOT NULL,
      ui_json TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    )`,
    `CREATE INDEX IF NOT EXISTS idx_auction_lots_active ON auction_lots(status, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_auction_lots_seller ON auction_lots(seller_id, status)`,
    `CREATE TABLE IF NOT EXISTS auction_credits (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      lot_id TEXT NOT NULL,
      sold_qty INTEGER NOT NULL,
      currency TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at INTEGER NOT NULL,
      acked INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_auction_credits_seller ON auction_credits(seller_id, acked)`,
    `CREATE TABLE IF NOT EXISTS wallets (
      telegram_id TEXT PRIMARY KEY,
      address TEXT NOT NULL DEFAULT '',
      connected INTEGER NOT NULL DEFAULT 0,
      history_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ton_deposits (
      message_hash TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      treasury_address TEXT NOT NULL,
      amount_nano TEXT NOT NULL,
      amount_gram REAL NOT NULL,
      tx_hash TEXT NOT NULL DEFAULT '',
      credited INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      credited_at INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ton_deposits_user ON ton_deposits(telegram_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS wallet_sync_state (
      telegram_id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL DEFAULT '',
      last_scan_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS withdraw_requests (
      id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      wallet_address TEXT NOT NULL,
      amount_gram REAL NOT NULL,
      fee_gram REAL NOT NULL,
      payout_gram REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewer_id TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      reviewed_at INTEGER NOT NULL DEFAULT 0,
      paid_at INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_withdraw_requests_status_created ON withdraw_requests(status, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_withdraw_requests_user ON withdraw_requests(telegram_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS admin_event_reward_grants (
      telegram_id TEXT NOT NULL,
      grant_key TEXT NOT NULL,
      claimed_at INTEGER NOT NULL,
      PRIMARY KEY (telegram_id, grant_key)
    )`,
    `CREATE TABLE IF NOT EXISTS stat_chest_open_requests (
      telegram_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (telegram_id, request_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_stat_chest_open_user_created ON stat_chest_open_requests(telegram_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS player_visit_stats (
      telegram_id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL DEFAULT '',
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      login_count INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS player_visit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      entered_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_player_visit_stats_last_seen ON player_visit_stats(last_seen_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_player_visit_log_entered ON player_visit_log(entered_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_player_visit_log_user_entered ON player_visit_log(telegram_id, entered_at DESC)`
  ];
  for (const q of sql) await env.DB.prepare(q).run();
  schemaReady = true;
}

function out(data, status = 200) { return { data, status }; }
function cleanName(v, max = 24) { return String(v || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function clanKey(v) { return cleanName(v).toLocaleLowerCase('ru-RU'); }
function safeJson(v, fallback) { try { return JSON.parse(v); } catch (_) { return fallback; } }

const STAT_CHEST_CONFIG = Object.freeze({
  emerald: Object.freeze({
    tier:'emerald',name:'Изумрудный сундук ОХ',refId:'stat_chest_emerald',
    min:2,max:50,jackpot:50,minGram:3,minPpa:3000,
    buckets:[[55,2,2],[25,3,5],[12,6,10],[5,11,20],[2,21,30],[0.8,31,49],[0.2,50,50]]
  }),
  sapphire: Object.freeze({
    tier:'sapphire',name:'Сапфировый сундук ОХ',refId:'stat_chest_sapphire',
    min:5,max:80,jackpot:80,minGram:7,minPpa:7000,
    buckets:[[55,5,5],[20,6,10],[12,11,20],[7,21,35],[3,36,50],[2.6,51,79],[0.4,80,80]]
  }),
  amethyst: Object.freeze({
    tier:'amethyst',name:'Аметистовый сундук ОХ',refId:'stat_chest_amethyst',
    min:10,max:110,jackpot:110,minGram:17,minPpa:17000,
    buckets:[[49,10,10],[15,11,20],[12,21,35],[9,36,50],[6,51,70],[4,71,90],[4.5,91,109],[0.5,110,110]]
  })
});

function normalizeStatChestTier(v) {
  v = String(v || '').trim().toLowerCase();
  if (v.startsWith('stat_chest_')) v = v.slice('stat_chest_'.length);
  return STAT_CHEST_CONFIG[v] ? v : '';
}
function statChestConfigFromItem(item) {
  item = item && typeof item === 'object' ? item : null;
  if (!item) return null;
  const x = item.gear && typeof item.gear === 'object' ? item.gear : item;
  const looksLikeChest = x.statChest === true || String(x.refId || '').startsWith('stat_chest_') || String(x.uid || '').startsWith('stat_chest_');
  if (!looksLikeChest) return null;
  const tier = normalizeStatChestTier(x.statChestTier || x.refId || x.uid);
  return tier ? STAT_CHEST_CONFIG[tier] : null;
}
function secureRandomUnit() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}
function secureRandomInt(min, max) {
  min = Math.ceil(Number(min) || 0);
  max = Math.floor(Number(max) || min);
  if (max <= min) return min;
  return min + Math.floor(secureRandomUnit() * (max - min + 1));
}
function rollStatChest(tier) {
  const cfg = STAT_CHEST_CONFIG[normalizeStatChestTier(tier)];
  if (!cfg) return null;
  const r = secureRandomUnit() * 100;
  let edge = 0;
  let chosen = cfg.buckets[cfg.buckets.length - 1];
  for (const b of cfg.buckets) {
    edge += Number(b[0]) || 0;
    if (r < edge) { chosen = b; break; }
  }
  const amount = secureRandomInt(chosen[1], chosen[2]);
  return { tier:cfg.tier, amount, jackpot:amount === cfg.jackpot, min:cfg.min, max:cfg.max };
}
function statChestStackCount(it) {
  return Math.max(0, Math.floor(Number(it && (it.count ?? it.qty ?? it.amount)) || 0));
}
function setStatChestStackCount(it, n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  it.count = n; it.qty = n; it.amount = n;
  return n;
}

function makeServerStatChestItem(tier, count) {
  const cfg = STAT_CHEST_CONFIG[normalizeStatChestTier(tier)];
  if (!cfg) return null;
  const rarity = cfg.tier === 'emerald' ? 'uncommon' : (cfg.tier === 'sapphire' ? 'rare' : 'epic');
  const rarityName = cfg.tier === 'emerald' ? 'Необычный' : (cfg.tier === 'sapphire' ? 'Редкий' : 'Эпический');
  const img = '/assets/stat-chest-' + cfg.tier + '.svg';
  const eventRewardId = 'admin_qa_stat_chest_' + cfg.tier + '_100_v2';
  const n = Math.max(1, Math.floor(Number(count) || 1));
  return {
    uid:cfg.refId,
    refId:cfg.refId,
    eventRewardId,
    eventRewardTemplate:true,
    eventRewardStock:true,
    rewardSource:'admin-qa',
    name:cfg.name,
    kind:'resource',
    rarity,
    rarityName,
    icon:'🎁',
    ic:'🎁',
    img,
    count:n,
    qty:n,
    amount:n,
    stackable:true,
    sell:0,
    stats:{},
    bound:false,
    tradeLocked:false,
    blackMarket:false,
    statChest:true,
    statChestTier:cfg.tier,
    statChestMin:cfg.min,
    statChestMax:cfg.max,
    statChestJackpot:cfg.jackpot,
    auctionMinGram:cfg.minGram,
    auctionMinPpa:cfg.minPpa,
    bonusText:'Сундук ОХ · ' + cfg.min + '–' + cfg.max + ' ОХ · ' + cfg.jackpot + ' ОХ — джекпот'
  };
}

function stateHasAdminStatChest(state, tier) {
  const cfg = STAT_CHEST_CONFIG[normalizeStatChestTier(tier)];
  if (!cfg || !state || typeof state !== 'object') return false;
  const id = 'admin_qa_stat_chest_' + cfg.tier + '_100_v2';
  const all = [];
  if (Array.isArray(state.bag)) all.push(...state.bag);
  if (state.storage && typeof state.storage === 'object') {
    for (const k of ['personal','clan','premium']) if (Array.isArray(state.storage[k])) all.push(...state.storage[k]);
  }
  if (Array.isArray(state.auctionLots)) {
    for (const lot of state.auctionLots) {
      const item = lot && lot.item && (lot.item.gear || lot.item);
      if (item) all.push(item);
    }
  }
  return all.some((it) => it && (
    String(it.eventRewardId || '') === id ||
    (it.statChest === true && normalizeStatChestTier(it.statChestTier || it.refId || it.uid) === cfg.tier && statChestStackCount(it) >= 100)
  ));
}

async function ensureAdminStatChestQaGrant(env, telegramId) {
  const save = await loadSaveRow(env, telegramId);
  if (!save) return { granted:false, addedTiers:[] };
  const state = save.state && typeof save.state === 'object' ? save.state : {};
  state.bag = Array.isArray(state.bag) ? state.bag : [];
  state.storage = state.storage && typeof state.storage === 'object' ? state.storage : {};
  state.storage.personal = Array.isArray(state.storage.personal) ? state.storage.personal : [];
  state.storage.clan = Array.isArray(state.storage.clan) ? state.storage.clan : [];
  state.storage.premium = Array.isArray(state.storage.premium) ? state.storage.premium : [];

  const addedTiers = [];
  for (const tier of ['emerald','sapphire','amethyst']) {
    if (stateHasAdminStatChest(state, tier)) continue;
    const item = makeServerStatChestItem(tier, 100);
    if (!item) continue;
    if (state.storage.premium.length < 50) state.storage.premium.push(item);
    else if (state.bag.length < 100) state.bag.push(item);
    else continue;
    addedTiers.push(tier);
  }
  if (!addedTiers.length) return { granted:false, addedTiers:[] };

  const raw = JSON.stringify(state);
  if (new TextEncoder().encode(raw).byteLength > 1_800_000) {
    throw Object.assign(new Error('Сейв слишком большой для выдачи тестовых сундуков.'), { status:413, code:'SAVE_TOO_LARGE' });
  }
  const oldVersion = Number(save.row.version) || 0;
  const nextVersion = oldVersion + 1;
  const r = await env.DB.prepare('UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4 AND version=?5')
    .bind(nextVersion, raw, Date.now(), telegramId, oldVersion).run();
  if (!r.meta || !r.meta.changes) {
    throw Object.assign(new Error('Сейв изменился во время выдачи сундуков. Повтори вход.'), { status:409, code:'SAVE_VERSION_CONFLICT' });
  }
  return { granted:true, addedTiers, version:nextVersion };
}

function accountActivatedFromState(s) {
  if (!s || typeof s !== 'object') return false;
  if (Number(s.lifetimePaidGram) >= 1) return true;
  const b = s.premiumShop && s.premiumShop.purchasedBundles;
  return !!(b && Object.keys(b).some((k) => !!b[k]));
}

async function loadSaveRow(env, telegramId) {
  const row = await env.DB.prepare('SELECT version,state_json,updated_at FROM saves WHERE telegram_id=?1').bind(telegramId).first();
  if (!row) return null;
  return { row, state: safeJson(row.state_json || '{}', {}) };
}

async function clanState(env, telegramId, player) {
  const membership = await env.DB.prepare('SELECT clan_id,role,joined_at FROM clan_members WHERE telegram_id=?1').bind(telegramId).first();
  const selfName = cleanName((player && player.nickname) || (player && player.telegram_first_name) || ('ID ' + telegramId), 24);
  const base = {
    connected: true,
    clan: null,
    self: { id: telegramId, name: selfName, role: '' },
    members: [], permissions: {}, applications: [], authority: {},
    storageUnlocked: false, storage: { used: 0, max: 500, items: [] },
    history: [], events: [], bosses: [], wars: [], tradeSession: null,
    tradeEligible: false
  };
  const save = await loadSaveRow(env, telegramId);
  base.tradeEligible = accountActivatedFromState(save && save.state);
  if (!membership) return base;
  const clan = await env.DB.prepare('SELECT * FROM clans WHERE id=?1').bind(membership.clan_id).first();
  if (!clan) {
    await env.DB.prepare('DELETE FROM clan_members WHERE telegram_id=?1').bind(telegramId).run();
    return base;
  }
  const rows = await env.DB.prepare(`
    SELECT cm.telegram_id,cm.role,cm.joined_at,p.nickname,p.telegram_first_name,p.telegram_username
    FROM clan_members cm LEFT JOIN players p ON p.telegram_id=cm.telegram_id
    WHERE cm.clan_id=?1 ORDER BY cm.joined_at ASC
  `).bind(clan.id).all();
  const members = (rows.results || []).map((m) => ({
    id: String(m.telegram_id),
    name: cleanName(m.nickname || m.telegram_first_name || m.telegram_username || ('ID ' + m.telegram_id), 24),
    role: m.role === 'leader' ? 'Глава' : 'Участник',
    joinedAt: Number(m.joined_at) || 0,
    tradeEligible: true,
    activated: true
  }));
  base.clan = { id: clan.id, name: clan.name, leaderId: String(clan.leader_id), createdAt: Number(clan.created_at) || 0 };
  base.members = members;
  base.self = members.find((m) => m.id === telegramId) || base.self;
  base.storageUnlocked = !!clan.storage_unlocked;
  return base;
}

async function handleClanAction(env, telegramId, player, body) {
  const action = String(body.action || '');
  if (action === 'create') {
    const name = cleanName(body.name, 24);
    if (name.length < 3) return out({ ok: false, message: 'Название клана — минимум 3 символа.' }, 400);
    if (!(player && player.nickname)) return out({ ok: false, message: 'Сначала создай персонажа и закрепи ник.' }, 409);
    const save = await loadSaveRow(env, telegramId);
    const blocked = Number(save && save.state && save.state.clanJoinBlockedUntil) || 0;
    if (blocked > Date.now()) return out({ ok: false, message: 'После выхода из клана действует задержка 24 часа.' }, 409);
    const exists = await env.DB.prepare('SELECT clan_id FROM clan_members WHERE telegram_id=?1').bind(telegramId).first();
    if (exists) return out({ ok: false, message: 'Ты уже состоишь в клане.' }, 409);
    const key = clanKey(name);
    const occupied = await env.DB.prepare('SELECT id FROM clans WHERE name_key=?1').bind(key).first();
    if (occupied) return out({ ok: false, message: 'Клан с таким названием уже существует.' }, 409);
    const now = Date.now();
    const id = 'clan_' + crypto.randomUUID();
    await env.DB.prepare('INSERT INTO clans(id,name,name_key,leader_id,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5)')
      .bind(id, name, key, telegramId, now).run();
    await env.DB.prepare("INSERT INTO clan_members(clan_id,telegram_id,role,joined_at) VALUES(?1,?2,'leader',?3)")
      .bind(id, telegramId, now).run();
    return out({ ok: true, state: await clanState(env, telegramId, player), message: 'Клан «' + name + '» создан.' });
  }
  if (action === 'leaveClan') {
    const membership = await env.DB.prepare('SELECT clan_id,role FROM clan_members WHERE telegram_id=?1').bind(telegramId).first();
    if (!membership) return out({ ok: false, message: 'Ты не состоишь в клане.' }, 409);
    const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM clan_members WHERE clan_id=?1').bind(membership.clan_id).first();
    const n = Number(cnt && cnt.n) || 0;
    if (membership.role === 'leader' && n > 1) return out({ ok: false, message: 'Сначала передай права главы другому игроку.' }, 409);
    await env.DB.prepare('DELETE FROM clan_members WHERE telegram_id=?1').bind(telegramId).run();
    if (n <= 1) await env.DB.prepare('DELETE FROM clans WHERE id=?1').bind(membership.clan_id).run();
    return out({ ok: true, state: await clanState(env, telegramId, player), message: 'Ты вышел из клана.' });
  }
  return out({ ok: false, message: 'Это клановое действие ещё не подключено к серверу.' }, 501);
}

function sanitizeLotId(v) {
  v = String(v || '').trim();
  return /^[A-Za-z0-9_-]{4,120}$/.test(v) ? v : '';
}
function sanitizeCurrency(v) { return v === 'gram' ? 'gram' : 'ppa'; }
function auctionSlotsFromPremiumSpend(spent) {
  spent = Math.max(0, Number(spent) || 0);
  if (spent < 1) return 0;
  if (spent < 4) return 1;
  if (spent < 9) return 3;
  if (spent < 16) return 5;
  if (spent < 25) return 7;
  if (spent < 36) return 9;
  return 10;
}
function activeSlots(state) {
  state = state && typeof state === 'object' ? state : {};
  const ps = state.premiumShop && typeof state.premiumShop === 'object' ? state.premiumShop : {};
  const b = ps.purchasedBundles && typeof ps.purchasedBundles === 'object' ? ps.purchasedBundles : {};

  // Auction ladder is based only on cumulative qualifying Premium-shop spend:
  // 1 Gram => 1 slot; +3 Gram (4 total) => 3 slots;
  // +5 Gram (9 total) => 5; +7 (16 total) => 7;
  // +9 (25 total) => 9; +11 (36 total) => 10 max.
  let premiumSpent = Math.max(0, Number(ps.auctionSlotGram) || 0);

  // Legacy recovery: older test saves tracked Premium purchases in the generic
  // Gram-spend counter before auctionSlotGram existed. If Premium evidence is
  // present, use the larger value so repeated old subscriptions are not lost.
  const hasPremiumEvidence =
    !!ps.lastPremiumPlan ||
    Number(ps.lastPremiumPurchaseAt) > 0 ||
    Number(ps.premiumTier) > 0 ||
    Number(ps.premiumUntil) > 0 ||
    Object.keys(b).some((k) => !!b[k]);

  if (hasPremiumEvidence) {
    premiumSpent = Math.max(premiumSpent, Math.max(0, Number(state.gramSpentLifetime) || 0));
  }

  return auctionSlotsFromPremiumSpend(premiumSpent);
}
function payloadToUi(item) {
  item = item && typeof item === 'object' ? item : {};
  const g = item.gear && typeof item.gear === 'object' ? item.gear : {};
  return {
    uid: item.uid || g.uid || '', name: item.name || g.name || 'Предмет', img: item.img || g.img || '',
    icon: item.icon || g.icon || g.ic || '◆', slot: item.slot || g.slot || '', rarity: item.rarity || g.rarity || 'common',
    rarityName: item.rarityName || '', level: Number(item.level || g.level || g.lvl) || 0, enh: Number(item.enh || g.enh) || 0,
    kind: item.kind || 'gear', refId: item.refId || '', category: item.category || '', stats: item.stats || g.stats || {},
    bonusText: item.bonusText || g.bonusText || '', bm: Number(item.bm || g.bm) || 0,
    classKey: item.classKey || g.classKey || '', className: item.className || g.className || '', petName: item.petName || g.petName || '', desc: item.desc || g.desc || '',
    statChest: item.statChest === true || g.statChest === true,
    statChestTier: item.statChestTier || g.statChestTier || '',
    statChestMin: Number(item.statChestMin || g.statChestMin) || 0,
    statChestMax: Number(item.statChestMax || g.statChestMax) || 0,
    statChestJackpot: Number(item.statChestJackpot || g.statChestJackpot) || 0,
    count: Math.max(0, Math.floor(Number(item.count || g.count || item.qty || g.qty) || 0))
  };
}
async function expireAuction(env) {
  await env.DB.prepare("UPDATE auction_lots SET status='expired' WHERE status='active' AND expires_at<=?1").bind(Date.now()).run();
}
async function auctionList(env, telegramId) {
  await expireAuction(env);
  const lots = await env.DB.prepare(`SELECT id,seller_id,seller_name,ui_json,qty,price,currency,created_at,expires_at
    FROM auction_lots WHERE status='active' AND expires_at>?1 AND seller_id<>?2 ORDER BY created_at DESC LIMIT 100`)
    .bind(Date.now(), telegramId).all();
  const resultLots = (lots.results || []).map((r) => {
    const ui = safeJson(r.ui_json || '{}', {});
    const item = ui.item || ui || {};
    return { id: r.id, item, qty: Number(r.qty) || 1, price: Number(r.price) || 0, currency: r.currency,
      sellerName: r.seller_name || 'Игрок', sellerId: String(r.seller_id), isOwn: false, canBuy: true, expiresAt: Number(r.expires_at) || 0 };
  });
  const credits = await env.DB.prepare(`SELECT id,lot_id,sold_qty,currency,amount,created_at FROM auction_credits
    WHERE seller_id=?1 AND acked=0 ORDER BY created_at ASC LIMIT 100`).bind(telegramId).all();
  return { ok: true, lots: resultLots, credits: credits.results || [] };
}
async function auctionPlace(env, telegramId, player, body) {
  const lot = body.lot && typeof body.lot === 'object' ? body.lot : {};
  const id = sanitizeLotId(lot.id);
  if (!id || !lot.item) return out({ ok: false, message: 'Некорректный лот.' }, 400);
  const save = await loadSaveRow(env, telegramId);
  if (!save) return out({ ok: false, message: 'Сначала синхронизируй персонажа с облаком.' }, 409);
  const max = activeSlots(save.state);
  if (max <= 0) return out({ ok: false, message: 'Продажа откроется после подтверждённой покупки от 1 Gram.' }, 403);
  await expireAuction(env);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM auction_lots WHERE seller_id=?1 AND status='active' AND expires_at>?2").bind(telegramId, Date.now()).first();
  if ((Number(count && count.n) || 0) >= max) return out({ ok: false, message: 'Все серверные слоты аукциона заняты.' }, 409);
  const qty = Math.max(1, Math.min(999, Math.floor(Number(lot.qty) || 1)));
  const price = Number(lot.price);
  if (!Number.isFinite(price) || price <= 0) return out({ ok: false, message: 'Некорректная цена.' }, 400);
  const currency = sanitizeCurrency(lot.currency);
  const chestCfg = statChestConfigFromItem(lot.item);
  if (chestCfg) {
    const minimum = currency === 'gram' ? chestCfg.minGram : chestCfg.minPpa;
    if (price + 1e-9 < minimum) {
      return out({
        ok:false,
        code:'STAT_CHEST_MIN_PRICE',
        message:'Минимальная цена для «' + chestCfg.name + '» — ' + minimum + ' ' + currency.toUpperCase() + '.',
        minimum,
        currency,
        tier:chestCfg.tier
      }, 400);
    }
  }
  const now = Date.now();
  const expiresAt = Math.max(now + 60_000, Math.min(now + 48 * 3600_000, Number(lot.expiresAt) || (now + 24 * 3600_000)));
  const itemRaw = JSON.stringify(lot.item);
  if (new TextEncoder().encode(itemRaw).byteLength > 140_000) return out({ ok: false, message: 'Этот предмет слишком большой для аукциона.' }, 413);
  const ui = body.uiLot && typeof body.uiLot === 'object' ? body.uiLot : { item: payloadToUi(lot.item) };
  const uiRaw = JSON.stringify(ui);
  const sellerName = cleanName((player && player.nickname) || 'Игрок', 24);
  try {
    await env.DB.prepare(`INSERT INTO auction_lots(id,seller_id,seller_name,item_json,ui_json,qty,price,currency,created_at,expires_at,status)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'active')`)
      .bind(id, telegramId, sellerName, itemRaw, uiRaw, qty, price, currency, now, expiresAt).run();
  } catch (_) { return out({ ok: false, message: 'Лот уже существует или не может быть размещён.' }, 409); }
  return out({ ok: true, message: 'Лот опубликован на сервере.' });
}
async function auctionCancel(env, telegramId, body) {
  const id = sanitizeLotId(body.lotId);
  if (!id) return out({ ok: false, message: 'Лот не найден.' }, 400);
  const r = await env.DB.prepare("UPDATE auction_lots SET status='cancelled' WHERE id=?1 AND seller_id=?2 AND status='active'").bind(id, telegramId).run();
  if (!r.meta || !r.meta.changes) return out({ ok: false, message: 'Лот уже продан, истёк или не принадлежит тебе.' }, 409);
  return out({ ok: true, message: 'Лот снят с сервера.' });
}
function addAuctionPayload(state, item, qty) {
  state.bag = Array.isArray(state.bag) ? state.bag : [];
  state.materials = state.materials && typeof state.materials === 'object' ? state.materials : {};
  state.stones = state.stones && typeof state.stones === 'object' ? state.stones : {};
  state.feathers = state.feathers && typeof state.feathers === 'object' ? state.feathers : {};
  state.consumables = state.consumables && typeof state.consumables === 'object' ? state.consumables : {};
  state.grimoires = state.grimoires && typeof state.grimoires === 'object' ? state.grimoires : {};
  const chestCfg = statChestConfigFromItem(item);
  if (chestCfg) {
    const src = item.gear && typeof item.gear === 'object' ? item.gear : item;
    let existing = state.bag.find((x) => x && statChestConfigFromItem(x) && normalizeStatChestTier(x.statChestTier || x.refId || x.uid) === chestCfg.tier);
    if (!existing) {
      if (state.bag.length >= 100) return 'Сумка заполнена.';
      existing = { ...src };
      existing.uid = chestCfg.refId;
      existing.refId = chestCfg.refId;
      existing.name = chestCfg.name;
      existing.kind = 'resource';
      existing.statChest = true;
      existing.statChestTier = chestCfg.tier;
      existing.statChestMin = chestCfg.min;
      existing.statChestMax = chestCfg.max;
      existing.statChestJackpot = chestCfg.jackpot;
      existing.stackable = true;
      existing.bound = false;
      existing.tradeLocked = false;
      setStatChestStackCount(existing, qty);
      state.bag.push(existing);
    } else {
      setStatChestStackCount(existing, statChestStackCount(existing) + qty);
    }
    return '';
  }
  if (item.kind === 'gear') {
    if (state.bag.length >= 100) return 'Сумка заполнена.';
    if (!item.gear) return 'Повреждённый предмет.';
    state.bag.push(item.gear); return '';
  }
  if (item.kind === 'material') { state.materials[item.refId] = (Number(state.materials[item.refId]) || 0) + qty; return ''; }
  if (item.kind === 'stone') { state.stones[item.refId] = (Number(state.stones[item.refId]) || 0) + qty; return ''; }
  if (item.kind === 'feather') { state.feathers.phoenix = (Number(state.feathers.phoenix) || 0) + qty; return ''; }
  if (item.kind === 'consumable') { state.consumables[item.refId] = (Number(state.consumables[item.refId]) || 0) + qty; return ''; }
  if (item.kind === 'grimoire') { state.grimoires[item.refId] = (Number(state.grimoires[item.refId]) || 0) + qty; return ''; }
  return 'Этот тип предмета пока нельзя купить через сервер.';
}
async function auctionBuy(env, telegramId, body) {
  await expireAuction(env);
  const id = sanitizeLotId(body.lotId);
  const qtyWanted = Math.max(1, Math.min(999, Math.floor(Number(body.qty) || 1)));
  const lot = await env.DB.prepare("SELECT * FROM auction_lots WHERE id=?1 AND status='active' AND expires_at>?2").bind(id, Date.now()).first();
  if (!lot) return out({ ok: false, message: 'Лот уже недоступен.' }, 409);
  if (String(lot.seller_id) === telegramId) return out({ ok: false, message: 'Нельзя купить свой лот.' }, 409);
  const currency = sanitizeCurrency(body.currency);
  if (currency !== lot.currency || Math.abs(Number(body.expectedUnitPrice) - Number(lot.price)) > 0.0001) return out({ ok: false, message: 'Цена лота изменилась. Обнови аукцион.' }, 409);
  const qty = Math.min(qtyWanted, Number(lot.qty) || 1);
  const gross = Math.round(Number(lot.price) * qty * 100) / 100;
  const save = await loadSaveRow(env, telegramId);
  if (!save) return out({ ok: false, message: 'Облачный сейв покупателя не найден.' }, 409);
  const state = save.state;
  const balance = Math.max(0, Number(state[currency]) || 0);
  if (balance + 1e-9 < gross) return out({ ok: false, message: 'Недостаточно ' + currency.toUpperCase() + '.' }, 409);
  const item = safeJson(lot.item_json || '{}', null);
  if (!item) return out({ ok: false, message: 'Предмет лота повреждён.' }, 500);
  const addErr = addAuctionPayload(state, item, qty);
  if (addErr) return out({ ok: false, message: addErr }, 409);
  state[currency] = Math.round((balance - gross) * 100) / 100;
  const raw = JSON.stringify(state);
  if (new TextEncoder().encode(raw).byteLength > 1_800_000) return out({ ok: false, message: 'Сейв после покупки слишком большой.' }, 413);
  const nextQty = (Number(lot.qty) || 1) - qty;
  const status = nextQty <= 0 ? 'sold' : 'active';
  const credit = Math.round(gross * 0.90 * 100) / 100;
  const creditId = 'credit_' + crypto.randomUUID();
  const now = Date.now();
  const nextSaveVersion=(Number(save.row.version) || 0) + 1;
  await env.DB.prepare('UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4')
    .bind(nextSaveVersion, raw, now, telegramId).run();
  await env.DB.prepare('UPDATE auction_lots SET qty=?1,status=?2 WHERE id=?3').bind(Math.max(0, nextQty), status, id).run();
  await env.DB.prepare('INSERT INTO auction_credits(id,seller_id,lot_id,sold_qty,currency,amount,created_at,acked) VALUES(?1,?2,?3,?4,?5,?6,?7,0)')
    .bind(creditId, lot.seller_id, id, qty, lot.currency, credit, now).run();
  return out({ ok: true, message: 'Покупка подтверждена сервером.', item, qty, total: gross, currency: lot.currency,
    version:nextSaveVersion,
    balances: { gram: Math.max(0, Number(state.gram) || 0), ppa: Math.max(0, Number(state.ppa) || 0) } });
}
async function openStatChest(env, telegramId, body) {
  const tier = normalizeStatChestTier(body && body.tier);
  const cfg = tier && STAT_CHEST_CONFIG[tier];
  if (!cfg) return out({ ok:false, code:'STAT_CHEST_TIER', message:'Неизвестный сундук ОХ.' }, 400);

  const requestId = String(body && body.requestId || '').trim();
  if (!/^[A-Za-z0-9:_-]{8,140}$/.test(requestId)) {
    return out({ ok:false, code:'STAT_CHEST_REQUEST_ID', message:'Некорректный запрос открытия сундука.' }, 400);
  }

  const prior = await env.DB.prepare('SELECT result_json FROM stat_chest_open_requests WHERE telegram_id=?1 AND request_id=?2 LIMIT 1')
    .bind(telegramId, requestId).first();
  if (prior && prior.result_json) {
    const saved = safeJson(prior.result_json, null);
    if (saved) return out(saved);
  }

  const save = await loadSaveRow(env, telegramId);
  if (!save) return out({ ok:false, code:'SAVE_MISSING', message:'Облачный сейв не найден.' }, 409);
  const state = save.state && typeof save.state === 'object' ? save.state : {};
  state.bag = Array.isArray(state.bag) ? state.bag : [];

  const idx = state.bag.findIndex((it) => {
    const c = statChestConfigFromItem(it);
    return !!c && c.tier === tier && statChestStackCount(it) > 0;
  });
  if (idx < 0) return out({ ok:false, code:'STAT_CHEST_MISSING', message:'Этот сундук уже отсутствует в инвентаре.' }, 409);

  const roll = rollStatChest(tier);
  if (!roll) return out({ ok:false, code:'STAT_CHEST_ROLL', message:'Не удалось открыть сундук.' }, 500);

  const stack = state.bag[idx];
  const remaining = statChestStackCount(stack) - 1;
  if (remaining > 0) setStatChestStackCount(stack, remaining);
  else state.bag.splice(idx, 1);

  state.statPts = Math.max(0, Math.floor(Number(state.statPts) || 0)) + roll.amount;
  state.premiumShop = state.premiumShop && typeof state.premiumShop === 'object' ? state.premiumShop : { purchasedBundles:{} };
  state.premiumShop.statPointsPurchased = Math.max(0, Math.floor(Number(state.premiumShop.statPointsPurchased) || 0)) + roll.amount;
  state.premiumShop.statChestOpened = Math.max(0, Math.floor(Number(state.premiumShop.statChestOpened) || 0)) + 1;

  const raw = JSON.stringify(state);
  if (new TextEncoder().encode(raw).byteLength > 1_800_000) {
    return out({ ok:false, code:'SAVE_TOO_LARGE', message:'Сейв после открытия сундука слишком большой.' }, 413);
  }

  const oldVersion = Number(save.row.version) || 0;
  const nextVersion = oldVersion + 1;
  const now = Date.now();
  const result = {
    ok:true,
    tier,
    name:cfg.name,
    amount:roll.amount,
    jackpot:roll.jackpot,
    remaining:Math.max(0, remaining),
    statPts:state.statPts,
    statPointsPurchased:state.premiumShop.statPointsPurchased,
    version:nextVersion,
    message:(roll.jackpot ? 'ДЖЕКПОТ! ' : '') + '+' + roll.amount + ' ОХ'
  };
  const resultRaw = JSON.stringify(result);

  const updateSave = env.DB.prepare('UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4 AND version=?5')
    .bind(nextVersion, raw, now, telegramId, oldVersion);
  const insertRequest = env.DB.prepare(`INSERT INTO stat_chest_open_requests(telegram_id,request_id,result_json,created_at)
    SELECT ?1,?2,?3,?4
    WHERE EXISTS(SELECT 1 FROM saves WHERE telegram_id=?1 AND version=?5 AND state_json=?6)`)
    .bind(telegramId, requestId, resultRaw, now, nextVersion, raw);
  await env.DB.batch([updateSave, insertRequest]);

  const stored = await env.DB.prepare('SELECT result_json FROM stat_chest_open_requests WHERE telegram_id=?1 AND request_id=?2 LIMIT 1')
    .bind(telegramId, requestId).first();
  if (!stored || !stored.result_json) {
    return out({ ok:false, code:'STAT_CHEST_RETRY', message:'Сейв изменился. Нажми открыть ещё раз.' }, 409);
  }
  return out(safeJson(stored.result_json, result));
}

async function auctionAck(env, telegramId, body) {
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 100).map(String) : [];
  for (const id of ids) await env.DB.prepare('UPDATE auction_credits SET acked=1 WHERE id=?1 AND seller_id=?2').bind(id, telegramId).run();
  return out({ ok: true });
}

function validTonAddress(v) {
  v = String(v || '').trim();
  return /^(?:EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(v) || /^(?:-1|0):[0-9a-fA-F]{64}$/.test(v);
}
async function walletState(env, telegramId) {
  const row = await env.DB.prepare('SELECT * FROM wallets WHERE telegram_id=?1').bind(telegramId).first();
  if (!row) return { ok: true, connected: false, address: '', walletGram: null, history: [] };
  return { ok: true, connected: !!row.connected, address: row.address || '', walletGram: null, history: safeJson(row.history_json || '[]', []) };
}
async function walletWrite(env, telegramId, connected, address, text) {
  const prior = await walletState(env, telegramId);
  const hist = Array.isArray(prior.history) ? prior.history.slice(-99) : [];
  hist.push({ time: Date.now(), text, amountText: '' });
  await env.DB.prepare(`INSERT INTO wallets(telegram_id,address,connected,history_json,updated_at) VALUES(?1,?2,?3,?4,?5)
    ON CONFLICT(telegram_id) DO UPDATE SET address=excluded.address,connected=excluded.connected,history_json=excluded.history_json,updated_at=excluded.updated_at`)
    .bind(telegramId, address || '', connected ? 1 : 0, JSON.stringify(hist), Date.now()).run();
  return walletState(env, telegramId);
}

async function creditTonDeposit(env, telegramId, wallet, messageHash, txHash, amountNano, createdAt, historyText) {
  messageHash = tonHashToHex(messageHash);
  if (!messageHash) return { ok: false, credited: 0, gameGram: null, reason: 'hash' };
  let nano;
  try { nano = BigInt(String(amountNano)); } catch (_) { return { ok: false, credited: 0, gameGram: null, reason: 'amount' }; }
  if (nano <= 0n) return { ok: false, credited: 0, gameGram: null, reason: 'amount' };

  let row = await env.DB.prepare('SELECT * FROM ton_deposits WHERE message_hash=?1').bind(messageHash).first();
  if (row) {
    if (String(row.telegram_id) !== telegramId) return { ok: false, credited: 0, gameGram: null, reason: 'owner' };
    if (String(row.amount_nano) !== nano.toString()) return { ok: false, credited: 0, gameGram: null, reason: 'amount_mismatch' };
    if (Number(row.credited) === 1) {
      const save = await loadSaveRow(env, telegramId);
      return { ok: true, credited: 0, already: true, gameGram: Math.max(0, Number(save && save.state && save.state.gram) || 0) };
    }
  } else {
    const amountGram = Number(nano) / 1e9;
    await env.DB.prepare(`INSERT OR IGNORE INTO ton_deposits(message_hash,telegram_id,wallet_address,treasury_address,amount_nano,amount_gram,tx_hash,credited,created_at,credited_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7,0,?8,0)`)
      .bind(messageHash, telegramId, String(wallet.address || ''), PPA_TON_TREASURY, nano.toString(), amountGram, String(txHash || ''), Number(createdAt) || Date.now()).run();
    row = await env.DB.prepare('SELECT * FROM ton_deposits WHERE message_hash=?1').bind(messageHash).first();
    if (!row || String(row.telegram_id) !== telegramId || String(row.amount_nano) !== nano.toString()) {
      return { ok: false, credited: 0, gameGram: null, reason: 'claim_conflict' };
    }
  }

  const save = await loadSaveRow(env, telegramId);
  if (!save) return { ok: false, credited: 0, gameGram: null, reason: 'save_missing' };
  const state = save.state && typeof save.state === 'object' ? save.state : {};
  const amountGram = Number(nano) / 1e9;
  if (!Number.isFinite(amountGram) || amountGram <= 0) return { ok: false, credited: 0, gameGram: null, reason: 'amount' };
  state.gram = Math.round(((Math.max(0, Number(state.gram) || 0) + amountGram) + Number.EPSILON) * 1e9) / 1e9;
  const raw = JSON.stringify(state);
  if (new TextEncoder().encode(raw).byteLength > 1_800_000) return { ok: false, credited: 0, gameGram: null, reason: 'save_size' };

  const now = Date.now();
  const nextVersion = (Number(save.row.version) || 0) + 1;
  const updateSave = env.DB.prepare(`UPDATE saves SET version=?1,state_json=?2,updated_at=?3
    WHERE telegram_id=?4 AND version=?5
      AND EXISTS(SELECT 1 FROM ton_deposits WHERE message_hash=?6 AND telegram_id=?4 AND amount_nano=?7 AND credited=0)`)
    .bind(nextVersion, raw, now, telegramId, Number(save.row.version) || 0, messageHash, nano.toString());
  const markCredited = env.DB.prepare(`UPDATE ton_deposits SET credited=1,credited_at=?1,tx_hash=?2
    WHERE message_hash=?3 AND telegram_id=?4 AND amount_nano=?7 AND credited=0
      AND EXISTS(SELECT 1 FROM saves WHERE telegram_id=?4 AND version=?5 AND updated_at=?1 AND state_json=?6)`)
    .bind(now, String(txHash || ''), messageHash, telegramId, nextVersion, raw, nano.toString());
  await env.DB.batch([updateSave, markCredited]);

  const finalDeposit = await env.DB.prepare('SELECT credited FROM ton_deposits WHERE message_hash=?1 AND telegram_id=?2').bind(messageHash, telegramId).first();
  if (!finalDeposit || Number(finalDeposit.credited) !== 1) {
    return { ok: false, credited: 0, gameGram: null, retry: true, reason: 'save_race' };
  }

  const hist = Array.isArray(wallet.history) ? wallet.history.slice(-99) : [];
  hist.push({ time: now, text: historyText || 'Пополнение через TON', amountText: '+' + String(amountGram).replace('.', ',') + ' Gram' });
  await env.DB.prepare('UPDATE wallets SET history_json=?1,updated_at=?2 WHERE telegram_id=?3')
    .bind(JSON.stringify(hist), now, telegramId).run();

  return { ok: true, credited: amountGram, gameGram: state.gram };
}

async function walletSyncIncoming(env, telegramId) {
  const wallet = await walletState(env, telegramId);
  if (!wallet.connected || !wallet.address) return { credited: 0, gameGram: null };
  const linkedRaw = tonRawAddress(wallet.address);
  if (!linkedRaw) return { credited: 0, gameGram: null };

  const sync = await env.DB.prepare('SELECT * FROM wallet_sync_state WHERE telegram_id=?1').bind(telegramId).first();
  const now = Date.now();
  const sameWallet = !!(sync && tonRawAddress(sync.wallet_address) === linkedRaw);
  const lastScanAt = sameWallet ? Math.max(0, Number(sync.last_scan_at) || 0) : 0;
  // Avoid hammering the public indexer when the wallet UI refreshes repeatedly.
  if (lastScanAt && now - lastScanAt < 15000) return { credited: 0, gameGram: null };

  const startUtime = lastScanAt
    ? Math.max(0, Math.floor(lastScanAt / 1000) - 120)
    : Math.max(0, Math.floor(now / 1000) - 86400);
  const url = 'https://toncenter.com/api/v3/transactions?account=' + encodeURIComponent(PPA_TON_TREASURY) +
    '&start_utime=' + encodeURIComponent(startUtime) + '&limit=200&sort=asc';
  const headers = { accept: 'application/json' };
  if (env && env.TONCENTER_API_KEY) headers['X-API-Key'] = String(env.TONCENTER_API_KEY);

  let data = null;
  try {
    const r = await fetch(url, { headers });
    if (!r.ok) {
      if (r.status === 429 || r.status >= 500) return { credited: 0, gameGram: null, pending: true };
      throw new Error('TON index HTTP ' + r.status);
    }
    data = await r.json();
  } catch (err) {
    console.warn('PPA wallet incoming sync:', err);
    return { credited: 0, gameGram: null, pending: true };
  }

  const txs = Array.isArray(data && data.transactions) ? data.transactions : [];
  let credited = 0;
  let gameGram = null;
  for (const tx of txs) {
    const msg = tx && tx.in_msg;
    if (!msg) continue;
    const sourceRaw = tonRawAddress(msg.source);
    const destRaw = tonRawAddress(msg.destination);
    if (!sourceRaw || sourceRaw !== linkedRaw || destRaw !== PPA_TON_TREASURY_RAW) continue;
    if (msg.bounced === true || (tx.description && tx.description.aborted === true) || tx.emulated === true) continue;

    let nano;
    try { nano = BigInt(String(msg.value || '0')); } catch (_) { continue; }
    // PPA rule: future deposits below 1 TON are not credited.
    if (nano < 1000000000n) continue;
    const messageHash = tonHashToHex(msg.hash_norm || msg.hash);
    if (!messageHash) continue;

    const result = await creditTonDeposit(
      env,
      telegramId,
      wallet,
      messageHash,
      String(tx.hash || ''),
      nano,
      (Number(tx.now) || Math.floor(now / 1000)) * 1000,
      'Входящий TON на казну PPA'
    );
    if (result && result.ok && Number(result.credited) > 0) {
      credited += Number(result.credited) || 0;
      gameGram = result.gameGram;
      wallet.history = (await walletState(env, telegramId)).history;
    }
  }

  await env.DB.prepare(`INSERT INTO wallet_sync_state(telegram_id,wallet_address,last_scan_at,updated_at) VALUES(?1,?2,?3,?3)
    ON CONFLICT(telegram_id) DO UPDATE SET wallet_address=excluded.wallet_address,last_scan_at=excluded.last_scan_at,updated_at=excluded.updated_at`)
    .bind(telegramId, wallet.address, now).run();

  return { credited, gameGram };
}

async function walletDeposit(env, telegramId, body) {
  let expectedNano = null;
  if (body.nanoAmount != null && /^\d+$/.test(String(body.nanoAmount).trim())) {
    try { expectedNano = BigInt(String(body.nanoAmount).trim()); } catch (_) {}
  }
  if (expectedNano == null) expectedNano = tonAmountToNano(body.amount);
  if (expectedNano == null || expectedNano <= 0n) return out({ ok: false, message: 'Введите корректную сумму TON.' }, 400);
  if (expectedNano < 1000000000n) return out({ ok: false, code: 'DEPOSIT_MIN_1_TON', message: 'Минимальное пополнение — 1 Gram (1 TON).' }, 400);

  const wallet = await walletState(env, telegramId);
  if (!wallet.connected || !wallet.address) return out({ ok: false, message: 'Сначала подключи TON Wallet через TON Connect.' }, 409);
  const linkedRaw = tonRawAddress(wallet.address);
  if (!linkedRaw) return out({ ok: false, message: 'Серверный TON-адрес повреждён. Перепривяжи кошелёк.' }, 409);

  let messageHash = tonHashToHex(body.messageHash);
  if (!messageHash) {
    const hashResult = await tonMessageHashFromBoc(body.boc, env);
    if (hashResult.pending) return out({ ok: false, pending: true, messageHash: '', message: 'Транзакция отправлена. Ждём сеть TON…' });
    messageHash = hashResult.messageHash;
  }

  const previous = await env.DB.prepare('SELECT * FROM ton_deposits WHERE message_hash=?1').bind(messageHash).first();
  if (previous) {
    if (String(previous.telegram_id) !== telegramId) return out({ ok: false, message: 'Эта TON-транзакция уже привязана к другому аккаунту.' }, 409);
    if (String(previous.amount_nano) !== expectedNano.toString()) return out({ ok: false, message: 'Сумма TON-транзакции не совпадает с заявленной.' }, 409);
    if (Number(previous.credited) === 1) {
      const save = await loadSaveRow(env, telegramId);
      return out({ ok: true, alreadyCredited: true, messageHash, gameGram: Math.max(0, Number(save && save.state && save.state.gram) || 0), message: 'Пополнение уже было зачислено.' });
    }
  }

  const tx = await tonLookupTransaction(messageHash, env);
  if (!tx) return out({ ok: false, pending: true, messageHash, message: 'TON-транзакция подтверждается в сети…' });

  const txAccountRaw = tonRawAddress(tx.account);
  if (!txAccountRaw || txAccountRaw !== linkedRaw) return out({ ok: false, message: 'TON-транзакция подписана не тем подключённым кошельком.' }, 409);
  if (tx.description && (tx.description.aborted === true || (tx.description.compute_ph && tx.description.compute_ph.success === false) || (tx.description.action && tx.description.action.success === false))) {
    return out({ ok: false, message: 'TON-транзакция завершилась с ошибкой.' }, 409);
  }

  const outs = Array.isArray(tx.out_msgs) ? tx.out_msgs : [];
  const payment = outs.find((m) => {
    try {
      const dest = tonRawAddress(m && m.destination);
      const value = BigInt(String(m && m.value != null ? m.value : '0'));
      return dest === PPA_TON_TREASURY_RAW && value === expectedNano && !(m && m.bounced === true);
    } catch (_) {
      return false;
    }
  });
  if (!payment) return out({ ok: false, message: 'В подтверждённой транзакции нет перевода нужной суммы в казну PPA.' }, 409);

  const credited = await creditTonDeposit(
    env,
    telegramId,
    wallet,
    messageHash,
    String(tx.hash || ''),
    expectedNano,
    (Number(tx.now) || Math.floor(Date.now() / 1000)) * 1000,
    'Пополнение через TON Connect'
  );
  if (credited && credited.ok) {
    return out({
      ok: true,
      alreadyCredited: !!credited.already,
      messageHash,
      txHash: String(tx.hash || ''),
      amount: Number(expectedNano) / 1e9,
      gameGram: credited.gameGram,
      treasury: PPA_TON_TREASURY,
      message: credited.already ? 'Пополнение уже было зачислено.' : 'TON подтверждён · +' + String(Number(expectedNano) / 1e9).replace('.', ',') + ' Gram'
    });
  }
  if (credited && credited.retry) return out({ ok: false, pending: true, messageHash, message: 'TON подтверждён. Синхронизирую игровой баланс…' });
  return out({ ok: false, message: 'Не удалось зачислить подтверждённый TON-платёж.' }, 409);
}

export async function handleOnlineRoute(path, ctx) {
  if (!path.startsWith('/api/clan/') && !path.startsWith('/api/auction/') && !path.startsWith('/api/wallet/') && !path.startsWith('/api/admin/') && !path.startsWith('/api/stat-chest/')) return null;
  const { env, body, auth, player } = ctx;
  const telegramId = String(auth.user.id);
  await ensureOnlineSchema(env);

  if (path === '/api/admin/player-visits') {
    const ids = String(env.WITHDRAW_ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!ids.includes(telegramId)) return out({ ok: false, code: 'ADMIN_ONLY', message: 'Admin only' }, 403);
    const since24h = Date.now() - 24 * 60 * 60 * 1000;
    const [total, unique24h, sessions24h, recent] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS n FROM player_visit_stats').first(),
      env.DB.prepare('SELECT COUNT(DISTINCT telegram_id) AS n FROM player_visit_log WHERE entered_at>=?1').bind(since24h).first(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM player_visit_log WHERE entered_at>=?1').bind(since24h).first(),
      env.DB.prepare(`
        SELECT s.telegram_id,
               COALESCE(NULLIF(p.nickname,''),NULLIF(s.nickname,''),NULLIF(p.telegram_first_name,''),NULLIF(p.telegram_username,''),'ID '||s.telegram_id) AS nickname,
               s.first_seen_at,s.last_seen_at,s.login_count
        FROM player_visit_stats s
        LEFT JOIN players p ON p.telegram_id=s.telegram_id
        ORDER BY s.last_seen_at DESC
        LIMIT 50
      `).all()
    ]);
    return out({
      ok: true,
      totalUnique: Number(total && total.n) || 0,
      unique24h: Number(unique24h && unique24h.n) || 0,
      sessions24h: Number(sessions24h && sessions24h.n) || 0,
      recent: (recent.results || []).map((r) => ({
        telegramId: String(r.telegram_id || ''),
        nickname: cleanName(r.nickname || ('ID ' + r.telegram_id), 24),
        firstSeenAt: Number(r.first_seen_at) || 0,
        lastSeenAt: Number(r.last_seen_at) || 0,
        loginCount: Math.max(0, Number(r.login_count) || 0)
      }))
    });
  }

  if (path === '/api/admin/event-reward-stock-access') {
    const ids = String(env.WITHDRAW_ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!ids.includes(telegramId)) return out({ ok: false, code: 'ADMIN_ONLY', message: 'Admin only' }, 403);
    const grantKey = 'event-reward-stock-v662-stat-chests';
    if (String(body && body.action || '') === 'ack') {
      await env.DB.prepare('INSERT OR IGNORE INTO admin_event_reward_grants(telegram_id,grant_key,claimed_at) VALUES(?1,?2,?3)')
        .bind(telegramId, grantKey, Date.now()).run();
      return out({ ok: true, authorized: true, seedRequired: false, grantKey });
    }
    const claimed = await env.DB.prepare('SELECT 1 AS ok FROM admin_event_reward_grants WHERE telegram_id=?1 AND grant_key=?2 LIMIT 1')
      .bind(telegramId, grantKey).first();
    if (claimed) return out({ ok: true, authorized: true, seedRequired: false, grantKey });

    // Give the three QA chest stacks directly in the authoritative cloud save.
    // The existing client-side reward seed then runs after one reload and ACKs
    // the grant key without duplicating these stacks.
    const chestGrant = await ensureAdminStatChestQaGrant(env, telegramId);
    return out({
      ok: true,
      authorized: true,
      seedRequired: true,
      grantKey,
      serverChestGranted: !!chestGrant.granted,
      serverChestAddedTiers: chestGrant.addedTiers || [],
      version: chestGrant.version == null ? null : chestGrant.version
    });
  }

  if (path === '/api/clan/state') return out({ ok: true, state: await clanState(env, telegramId, player) });
  if (path === '/api/clan/action') return handleClanAction(env, telegramId, player, body);

  if (path === '/api/auction/list') return out(await auctionList(env, telegramId));
  if (path === '/api/auction/place') return auctionPlace(env, telegramId, player, body);
  if (path === '/api/auction/cancel') return auctionCancel(env, telegramId, body);
  if (path === '/api/auction/buy') return auctionBuy(env, telegramId, body);
  if (path === '/api/auction/ack-credits') return auctionAck(env, telegramId, body);

  if (path === '/api/stat-chest/open') return openStatChest(env, telegramId, body);

  if (path === '/api/wallet/state') {
    const sync = await walletSyncIncoming(env, telegramId);
    const state = await walletState(env, telegramId);
    return out({ ...state, syncCredited: Math.max(0, Number(sync && sync.credited) || 0), gameGram: sync && sync.gameGram != null ? Number(sync.gameGram) : null });
  }
  if (path === '/api/wallet/link') {
    const address = String(body.address || '').trim();
    if (!validTonAddress(address)) return out({ ok: false, message: 'Введите корректный TON-адрес Gram Wallet.' }, 400);
    const s = await walletWrite(env, telegramId, true, address, 'Gram Wallet привязан к Telegram ID');
    return out({ ...s, message: 'Gram Wallet привязан к серверу.' });
  }
  if (path === '/api/wallet/unlink') {
    const s = await walletWrite(env, telegramId, false, '', 'Gram Wallet отвязан');
    return out({ ...s, message: 'Gram Wallet отвязан.' });
  }
  if (path === '/api/wallet/deposit') return walletDeposit(env, telegramId, body);
  if (path === '/api/wallet/withdraw') {
    const amount = Math.round((Number(body && body.amount) + Number.EPSILON) * 1e9) / 1e9;
    if (!Number.isFinite(amount) || amount < 15) {
      return out({ ok: false, code: 'WITHDRAW_MIN_15_TON', message: 'Минимальный вывод — 15 Gram (15 TON).' }, 400);
    }
    const wallet = await walletState(env, telegramId);
    if (!wallet.connected || !wallet.address) return out({ ok: false, message: 'Сначала подключи TON Wallet.' }, 409);
    const save = await loadSaveRow(env, telegramId);
    if (!save) return out({ ok: false, message: 'Сейв персонажа не найден.' }, 409);
    const state = save.state && typeof save.state === 'object' ? save.state : {};
    const balance = Math.max(0, Number(state.gram) || 0);
    if (balance + 1e-9 < amount) return out({ ok: false, code: 'WITHDRAW_BALANCE_LOW', message: 'Недостаточно Gram для вывода.' }, 409);

    const pending = await env.DB.prepare("SELECT id FROM withdraw_requests WHERE telegram_id=?1 AND status IN ('pending','approved') ORDER BY created_at DESC LIMIT 1")
      .bind(telegramId).first();
    if (pending) return out({ ok: false, code: 'WITHDRAW_ALREADY_PENDING', message: 'У тебя уже есть заявка на вывод в обработке.' }, 409);

    const fee = Math.round((amount * 0.10 + Number.EPSILON) * 1e9) / 1e9;
    const payout = Math.round(((amount - fee) + Number.EPSILON) * 1e9) / 1e9;
    state.gram = Math.round(((balance - amount) + Number.EPSILON) * 1e9) / 1e9;
    const raw = JSON.stringify(state);
    if (new TextEncoder().encode(raw).byteLength > 1_800_000) return out({ ok: false, message: 'Сейв после заявки слишком большой.' }, 413);

    const id = 'wd_' + crypto.randomUUID();
    const now = Date.now();
    const nextVersion = (Number(save.row.version) || 0) + 1;
    const updateSave = env.DB.prepare(`UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4 AND version=?5`)
      .bind(nextVersion, raw, now, telegramId, Number(save.row.version) || 0);
    const insertRequest = env.DB.prepare(`INSERT INTO withdraw_requests(id,telegram_id,nickname,wallet_address,amount_gram,fee_gram,payout_gram,status,created_at)
      SELECT ?1,?2,?3,?4,?5,?6,?7,'pending',?8
      WHERE EXISTS(SELECT 1 FROM saves WHERE telegram_id=?2 AND version=?9 AND updated_at=?8 AND state_json=?10)`)
      .bind(id, telegramId, String(player && player.nickname || ''), wallet.address, amount, fee, payout, now, nextVersion, raw);
    await env.DB.batch([updateSave, insertRequest]);

    const created = await env.DB.prepare('SELECT * FROM withdraw_requests WHERE id=?1 AND telegram_id=?2').bind(id, telegramId).first();
    if (!created) return out({ ok: false, code: 'WITHDRAW_RETRY', message: 'Баланс изменился. Повтори заявку на вывод.' }, 409);

    try {
      const ids = String(env.WITHDRAW_ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
      const token = String(env.WITHDRAW_BOT_TOKEN || '').trim();
      if (token && ids.length) {
        const text =
          '🆕 PPA · новая заявка на вывод\n\n' +
          'Игрок: ' + (created.nickname || ('ID ' + telegramId)) + '\n' +
          'Telegram ID: ' + telegramId + '\n' +
          'Запрошено: ' + created.amount_gram + ' Gram\n' +
          'Комиссия 10%: ' + created.fee_gram + ' Gram\n' +
          'К выплате: ' + created.payout_gram + ' TON\n' +
          'Кошелёк: ' + created.wallet_address + '\n\n' +
          'Открой /pending в боте.';
        await Promise.allSettled(ids.slice(0, 10).map((chatId) =>
          fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text })
          })
        ));
      }
    } catch (_) {}

    return out({
      ok: true,
      requestId: id,
      amount,
      fee,
      payout,
      gameGram: state.gram,
      status: 'pending',
      message: 'Заявка на вывод создана · к выплате ' + String(payout).replace('.', ',') + ' TON'
    });
  }
  return null;
}

export async function handleOnlineRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/clan/') && !url.pathname.startsWith('/api/auction/') && !url.pathname.startsWith('/api/wallet/') && !url.pathname.startsWith('/api/admin/') && !url.pathname.startsWith('/api/stat-chest/')) return null;
  if (request.method !== 'POST') return jsonResponse({ok:false,code:'METHOD_NOT_ALLOWED',message:'POST required'},405);
  try {
    let body={};try{body=await request.json()}catch(_){}
    const user=await validateInitData(body.initData||request.headers.get('x-telegram-init-data')||'',env.BOT_TOKEN);
    await ensureOnlineSchema(env);
    const player=await ensurePlayerOnline(env,user);
    const result=await handleOnlineRoute(url.pathname,{env,body,auth:{user},player});
    if(!result)return jsonResponse({ok:false,code:'NOT_FOUND',message:'API route not found'},404);
    return jsonResponse(result.data,result.status||200);
  } catch(err) {
    const status=Number(err&&err.status)||500;
    const code=(err&&err.code)||(status>=500?'SERVER_ERROR':'REQUEST_ERROR');
    const message=status>=500&&code==='SERVER_ERROR'?'Gateway error':String((err&&err.message)||'Gateway error');
    console.error('PPA online gateway:',code,err);
    return jsonResponse({ok:false,code,message},status);
  }
}
