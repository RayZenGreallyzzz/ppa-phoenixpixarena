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
    `CREATE INDEX IF NOT EXISTS idx_ton_deposits_user ON ton_deposits(telegram_id, created_at)`
  ];
  for (const q of sql) await env.DB.prepare(q).run();
  schemaReady = true;
}

function out(data, status = 200) { return { data, status }; }
function cleanName(v, max = 24) { return String(v || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function clanKey(v) { return cleanName(v).toLocaleLowerCase('ru-RU'); }
function safeJson(v, fallback) { try { return JSON.parse(v); } catch (_) { return fallback; } }
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
    classKey: item.classKey || g.classKey || '', className: item.className || g.className || '', petName: item.petName || g.petName || '', desc: item.desc || g.desc || ''
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
  await env.DB.prepare('UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4')
    .bind((Number(save.row.version) || 0) + 1, raw, now, telegramId).run();
  await env.DB.prepare('UPDATE auction_lots SET qty=?1,status=?2 WHERE id=?3').bind(Math.max(0, nextQty), status, id).run();
  await env.DB.prepare('INSERT INTO auction_credits(id,seller_id,lot_id,sold_qty,currency,amount,created_at,acked) VALUES(?1,?2,?3,?4,?5,?6,?7,0)')
    .bind(creditId, lot.seller_id, id, qty, lot.currency, credit, now).run();
  return out({ ok: true, message: 'Покупка подтверждена сервером.', item, qty, total: gross, currency: lot.currency,
    balances: { gram: Math.max(0, Number(state.gram) || 0), ppa: Math.max(0, Number(state.ppa) || 0) } });
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

async function walletDeposit(env, telegramId, body) {
  let expectedNano = null;
  if (body.nanoAmount != null && /^\d+$/.test(String(body.nanoAmount).trim())) {
    try { expectedNano = BigInt(String(body.nanoAmount).trim()); } catch (_) {}
  }
  if (expectedNano == null) expectedNano = tonAmountToNano(body.amount);
  if (expectedNano == null || expectedNano <= 0n) return out({ ok: false, message: 'Введите корректную сумму TON.' }, 400);

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

  const save = await loadSaveRow(env, telegramId);
  if (!save) return out({ ok: false, message: 'Сейв персонажа не найден.' }, 409);
  const state = save.state && typeof save.state === 'object' ? save.state : {};
  const amountGram = Number(expectedNano) / 1e9;
  if (!Number.isFinite(amountGram) || amountGram <= 0) return out({ ok: false, message: 'Некорректная сумма TON.' }, 400);
  state.gram = Math.round(((Math.max(0, Number(state.gram) || 0) + amountGram) + Number.EPSILON) * 1e9) / 1e9;
  const raw = JSON.stringify(state);
  if (new TextEncoder().encode(raw).byteLength > 1_800_000) return out({ ok: false, message: 'Сейв после пополнения слишком большой.' }, 413);

  const now = Date.now();
  const nextVersion = (Number(save.row.version) || 0) + 1;
  const txHash = String(tx.hash || '');
  const insert = env.DB.prepare(`INSERT OR IGNORE INTO ton_deposits(message_hash,telegram_id,wallet_address,treasury_address,amount_nano,amount_gram,tx_hash,credited,created_at,credited_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,0,?8,0)`)
    .bind(messageHash, telegramId, wallet.address, PPA_TON_TREASURY, expectedNano.toString(), amountGram, txHash, now);
  const updateSave = env.DB.prepare(`UPDATE saves SET version=?1,state_json=?2,updated_at=?3
    WHERE telegram_id=?4 AND version=?5
      AND EXISTS(SELECT 1 FROM ton_deposits WHERE message_hash=?6 AND telegram_id=?4 AND amount_nano=?7 AND credited=0)`)
    .bind(nextVersion, raw, now, telegramId, Number(save.row.version) || 0, messageHash, expectedNano.toString());
  const markCredited = env.DB.prepare(`UPDATE ton_deposits SET credited=1,credited_at=?1,tx_hash=?2
    WHERE message_hash=?3 AND telegram_id=?4 AND amount_nano=?7 AND credited=0
      AND EXISTS(SELECT 1 FROM saves WHERE telegram_id=?4 AND version=?5 AND updated_at=?1 AND state_json=?6)`)
    .bind(now, txHash, messageHash, telegramId, nextVersion, raw, expectedNano.toString());

  await env.DB.batch([insert, updateSave, markCredited]);
  const finalDeposit = await env.DB.prepare('SELECT credited FROM ton_deposits WHERE message_hash=?1 AND telegram_id=?2').bind(messageHash, telegramId).first();
  if (!finalDeposit || Number(finalDeposit.credited) !== 1) {
    return out({ ok: false, pending: true, messageHash, message: 'Платёж подтверждён. Синхронизирую игровой баланс…' });
  }

  const hist = Array.isArray(wallet.history) ? wallet.history.slice(-99) : [];
  hist.push({ time: now, text: 'Пополнение через TON Connect', amountText: '+' + String(amountGram).replace('.', ',') + ' Gram' });
  await env.DB.prepare('UPDATE wallets SET history_json=?1,updated_at=?2 WHERE telegram_id=?3')
    .bind(JSON.stringify(hist), now, telegramId).run();

  return out({
    ok: true,
    messageHash,
    txHash,
    amount: amountGram,
    gameGram: state.gram,
    treasury: PPA_TON_TREASURY,
    message: 'TON подтверждён · +' + String(amountGram).replace('.', ',') + ' Gram'
  });
}

export async function handleOnlineRoute(path, ctx) {
  if (!path.startsWith('/api/clan/') && !path.startsWith('/api/auction/') && !path.startsWith('/api/wallet/')) return null;
  const { env, body, auth, player } = ctx;
  const telegramId = String(auth.user.id);
  await ensureOnlineSchema(env);

  if (path === '/api/clan/state') return out({ ok: true, state: await clanState(env, telegramId, player) });
  if (path === '/api/clan/action') return handleClanAction(env, telegramId, player, body);

  if (path === '/api/auction/list') return out(await auctionList(env, telegramId));
  if (path === '/api/auction/place') return auctionPlace(env, telegramId, player, body);
  if (path === '/api/auction/cancel') return auctionCancel(env, telegramId, body);
  if (path === '/api/auction/buy') return auctionBuy(env, telegramId, body);
  if (path === '/api/auction/ack-credits') return auctionAck(env, telegramId, body);

  if (path === '/api/wallet/state') return out(await walletState(env, telegramId));
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
    return out({ ok: false, code: 'TREASURY_SIGNER_REQUIRED', message: 'Вывод TON потребует серверной подписи казны. Секрет/seed нельзя хранить в клиенте.' }, 501);
  }
  return null;
}

export async function handleOnlineRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/clan/') && !url.pathname.startsWith('/api/auction/') && !url.pathname.startsWith('/api/wallet/')) return null;
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
