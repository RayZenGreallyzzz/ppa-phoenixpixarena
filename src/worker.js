import { nativeRealtimeTicketForLinkedTelegram } from './realtime.js';
import { NATIVE_NPC_SERVICES, projectNativeNpcReadOnly } from './native-npc-readonly.js';
import { nativeClanOperation } from './native-clan-actions.js';
import { sharedMerchantOperation } from './shared-merchant.js';
import { sharedForgeOperation } from './shared-forge.js';
import { sharedInventoryOperation } from './shared-inventory.js';
const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;
const encoder = new TextEncoder();

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

function apiError(message, status = 400, code = 'BAD_REQUEST') {
  return json({ ok: false, code, message }, status);
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a, b) {
  a = String(a || '').toLowerCase();
  b = String(b || '').toLowerCase();
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256(keyBytes, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, typeof data === 'string' ? encoder.encode(data) : data);
}

async function validateTelegramInitData(initData, botToken) {
  if (!botToken) throw Object.assign(new Error('BOT_TOKEN secret is not configured'), { status: 503, code: 'BOT_TOKEN_MISSING' });
  if (!initData || typeof initData !== 'string') throw Object.assign(new Error('Telegram initData is missing'), { status: 401, code: 'INIT_DATA_MISSING' });

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) throw Object.assign(new Error('Telegram hash is missing'), { status: 401, code: 'HASH_MISSING' });

  params.delete('hash');
  const pairs = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort((a, b) => a.localeCompare(b));
  const dataCheckString = pairs.join('\n');

  const secretKey = await hmacSha256(encoder.encode('WebAppData'), botToken);
  const calculated = hex(await hmacSha256(new Uint8Array(secretKey), dataCheckString));
  if (!timingSafeEqualHex(calculated, receivedHash)) {
    throw Object.assign(new Error('Telegram signature check failed'), { status: 401, code: 'INVALID_TELEGRAM_SIGNATURE' });
  }

  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0 || authDate > now + 300 || now - authDate > INIT_DATA_MAX_AGE_SEC) {
    throw Object.assign(new Error('Telegram session has expired. Reopen the Mini App.'), { status: 401, code: 'INIT_DATA_EXPIRED' });
  }

  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (_) { user = null; }
  if (!user || user.id == null) throw Object.assign(new Error('Telegram user is missing'), { status: 401, code: 'TELEGRAM_USER_MISSING' });

  return { user, authDate };
}

function nickKey(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

function validNickname(value) {
  return /^[A-Za-zА-Яа-яЁё0-9_]{3,18}$/u.test(String(value || '').trim());
}

function normalizeClass(value) {
  return String(value || '').trim().slice(0, 40);
}

function profileFromRow(row) {
  if (!row) return null;
  return {
    telegramId: String(row.telegram_id),
    nickname: row.nickname || '',
    classKey: row.class_key || '',
    username: row.telegram_username || '',
    firstName: row.telegram_first_name || '',
    lastName: row.telegram_last_name || '',
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

function parseStateJson(raw) {
  try {
    const state = JSON.parse(raw || 'null');
    return state && typeof state === 'object' && !Array.isArray(state) ? state : null;
  } catch (_) {
    return null;
  }
}

function applyProfileToSaveState(profile, state) {
  if (!profile) return state;
  const out = state && typeof state === 'object' && !Array.isArray(state) ? { ...state } : {};
  const nickname = String(profile.nickname || '').trim();
  const classKey = String(profile.classKey || '').trim();
  if (nickname) {
    out.playerName = nickname;
    out.nickname = nickname;
  }
  if (classKey && !String(out.cls || '').trim()) out.cls = classKey;
  if (classKey && !String(out.classKey || '').trim()) out.classKey = classKey;
  out.telegramId = String(profile.telegramId || out.telegramId || '');
  out.profileTelegramId = String(profile.telegramId || out.profileTelegramId || '');
  out.gatewayProfileBound = !!nickname;
  return out;
}

async function ensurePlayer(env, tgUser) {
  if (!env.DB) throw Object.assign(new Error('D1 database is not connected'), { status: 503, code: 'DB_MISSING' });
  const now = Date.now();
  const id = String(tgUser.id);
  await env.DB.prepare(`
    INSERT INTO players (
      telegram_id, telegram_username, telegram_first_name, telegram_last_name,
      nickname, nickname_key, class_key, created_at, updated_at, last_auth_at
    ) VALUES (?1, ?2, ?3, ?4, NULL, NULL, NULL, ?5, ?5, ?5)
    ON CONFLICT(telegram_id) DO UPDATE SET
      telegram_username=excluded.telegram_username,
      telegram_first_name=excluded.telegram_first_name,
      telegram_last_name=excluded.telegram_last_name,
      last_auth_at=excluded.last_auth_at
  `).bind(
    id,
    String(tgUser.username || ''),
    String(tgUser.first_name || ''),
    String(tgUser.last_name || ''),
    now,
  ).run();

  return env.DB.prepare('SELECT * FROM players WHERE telegram_id=?1').bind(id).first();
}

async function authenticated(request, env) {
  let body = {};
  if (request.method !== 'GET') {
    try { body = await request.json(); } catch (_) { body = {}; }
  }
  const initData = body.initData || request.headers.get('x-telegram-init-data') || '';
  const auth = await validateTelegramInitData(initData, env.BOT_TOKEN);
  const player = await ensurePlayer(env, auth.user);
  return { body, auth, player };
}

async function nicknameOwner(env, key) {
  if (!key) return null;
  return env.DB.prepare('SELECT telegram_id, nickname FROM players WHERE nickname_key=?1 LIMIT 1').bind(key).first();
}

function makeNewbieChestSaveItem() {
  return {
    uid: 'newbie_chest_gray_v1',
    refId: 'newbie_chest_gray_v1',
    newbieChest: true,
    kind: 'newbieChest',
    name: 'Серый сундук новичка',
    rarity: 'common',
    rarityName: 'Обычный',
    icon: '🎁',
    ic: '🎁',
    img: '/assets/newbie-chest-gray.webp',
    image: '/assets/newbie-chest-gray.webp',
    art: '/assets/newbie-chest-gray.webp',
    cardArt: '/assets/newbie-chest-gray.webp',
    iconArt: '/assets/newbie-chest-gray.webp',
    count: 1,
    qty: 1,
    amount: 1,
    bound: true,
    tradeLocked: true,
    sell: 0,
    desc: 'Полный серый комплект текущего класса · 4 активных гримуара I ранга · 100 малых HP · 100 малых MP.'
  };
}

async function upsertBoundInitialSave(env, telegramId, profile, nickname, classKey, grantNewbieChest = false) {
  const row = await env.DB.prepare('SELECT version, state_json FROM saves WHERE telegram_id=?1').bind(telegramId).first();
  let state = parseStateJson(row && row.state_json) || {};
  const before = JSON.stringify(state);
  state = applyProfileToSaveState(profile, state);
  nickname = String(nickname || profile.nickname || '').trim();
  classKey = normalizeClass(classKey || profile.classKey || '');
  if (nickname) {
    state.playerName = nickname;
    state.nickname = nickname;
  }
  if (classKey && !String(state.cls || '').trim()) state.cls = classKey;
  if (classKey && !String(state.classKey || '').trim()) state.classKey = classKey;
  state.telegramId = String(telegramId);
  state.profileTelegramId = String(telegramId);
  state.gatewayProfileBound = true;
  state.registrationSavedAt = Number(state.registrationSavedAt) || Date.now();

  // Newbie chest belongs to the carried inventory so the player can open it
  // immediately and receive the starter gear in the same bag.
  // Repair unopened chests from the short-lived personal-storage build too.
  const chestId = 'newbie_chest_gray_v1';
  state.storage = state.storage && typeof state.storage === 'object' ? state.storage : {};
  state.storage.personal = Array.isArray(state.storage.personal) ? state.storage.personal : [];
  state.storage.clan = Array.isArray(state.storage.clan) ? state.storage.clan : [];
  state.storage.premium = Array.isArray(state.storage.premium) ? state.storage.premium : [];
  state.bag = Array.isArray(state.bag) ? state.bag : [];

  function isNewbieChest(it) {
    return !!(it && (
      it.newbieChest === true ||
      String(it.refId || '') === chestId ||
      String(it.uid || '') === chestId
    ));
  }

  const bagChestIndex = state.bag.findIndex(isNewbieChest);
  const personalChestIndex = state.storage.personal.findIndex(isNewbieChest);
  const shouldRepairGrant = state.newbieChestGranted === true && state.newbieKitOpened !== true;
  const shouldHaveChest = grantNewbieChest || shouldRepairGrant;

  if (shouldHaveChest && state.newbieKitOpened !== true) {
    if (bagChestIndex < 0) {
      const chest = personalChestIndex >= 0
        ? state.storage.personal.splice(personalChestIndex, 1)[0]
        : makeNewbieChestSaveItem();
      if (state.bag.length < 100) state.bag.push(chest);
      else state.storage.personal.push(chest); // never destroy it if a legacy bag is unexpectedly full
    } else if (personalChestIndex >= 0) {
      // Remove a duplicate left by the temporary personal-storage build.
      state.storage.personal.splice(personalChestIndex, 1);
    }
    state.newbieChestGranted = true;
  }

  const after = JSON.stringify(state);
  const now = Date.now();
  if (!row) {
    await env.DB.prepare(`
      INSERT INTO saves (telegram_id, version, state_json, updated_at)
      VALUES (?1, 1, ?2, ?3)
    `).bind(telegramId, after, now).run();
    return { version: 1, updatedAt: now, created: true };
  }
  if (after !== before) {
    const version = (Number(row.version) || 0) + 1;
    await env.DB.prepare(`
      UPDATE saves SET version=?1, state_json=?2, updated_at=?3 WHERE telegram_id=?4
    `).bind(version, after, now, telegramId).run();
    return { version, updatedAt: now, updated: true };
  }
  return { version: Number(row.version) || 0, updatedAt: now, created: false };
}

async function registerCharacter(env, telegramId, nickname, classKey) {
  telegramId = String(telegramId || '').trim();
  nickname = String(nickname || '').trim();
  if (!telegramId) return { ok: false, status: 401, message: 'Telegram ID не получен. Открой игру через Telegram Mini App.' };
  if (!validNickname(nickname)) return { ok: false, status: 400, message: 'Ник должен содержать 3–18 символов: буквы, цифры и _.' };
  const key = nickKey(nickname);
  const current = await env.DB.prepare('SELECT * FROM players WHERE telegram_id=?1').bind(telegramId).first();
  if (!current) return { ok: false, status: 404, message: 'Профиль Telegram не найден.' };
  const firstCharacterRegistration = !String(current.nickname_key || '').trim();

  if (current.nickname_key && current.nickname_key !== key) {
    return { ok: false, status: 409, message: 'Персонаж для этого Telegram ID уже создан. Для смены имени нужна карточка.' };
  }
  const owner = await nicknameOwner(env, key);
  if (owner && String(owner.telegram_id) !== String(telegramId)) {
    return { ok: false, status: 409, message: 'Этот ник уже занят.' };
  }

  const now = Date.now();
  await env.DB.prepare(`
    UPDATE players SET nickname=?1, nickname_key=?2,
      class_key=CASE WHEN nickname_key IS NULL OR nickname_key='' THEN ?3 ELSE class_key END,
      updated_at=?4,
      last_auth_at=?4
    WHERE telegram_id=?5
  `).bind(nickname, key, normalizeClass(classKey), now, telegramId).run();

  const profile = profileFromRow(await env.DB.prepare('SELECT * FROM players WHERE telegram_id=?1').bind(telegramId).first());
  const save = await upsertBoundInitialSave(env, telegramId, profile, nickname, classKey, firstCharacterRegistration);
  return {
    ok: true,
    profile,
    save,
    telegramId: String(telegramId),
    newbieChestGranted: firstCharacterRegistration
  };
}

async function loadSave(env, telegramId) {
  const profile = profileFromRow(await env.DB.prepare('SELECT * FROM players WHERE telegram_id=?1').bind(telegramId).first());
  const row = await env.DB.prepare('SELECT version, state_json, updated_at FROM saves WHERE telegram_id=?1').bind(telegramId).first();
  if (!row) {
    if (profile && profile.nickname) {
      return { ok: true, version: 0, state: applyProfileToSaveState(profile, {}), profile, bootstrapFromProfile: true };
    }
    return { ok: true, version: null, state: null, profile };
  }
  const parsed = parseStateJson(row.state_json);
  const state = applyProfileToSaveState(profile, parsed);
  return { ok: true, version: Number(row.version) || 0, state, updatedAt: Number(row.updated_at) || 0, profile };
}

let saveHistorySchemaReady = false;

function saveNonNegativeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function savedStatAllocationTotal(state) {
  if (!state || !state.statAlloc || typeof state.statAlloc !== 'object' || Array.isArray(state.statAlloc)) return 0;
  let total = 0;
  for (const value of Object.values(state.statAlloc)) total += saveNonNegativeInt(value);
  return total;
}

function savedStatPointPool(state) {
  if (!state || typeof state !== 'object') return 0;
  return saveNonNegativeInt(state.statPts) + savedStatAllocationTotal(state);
}

function preserveDurablePremiumEntitlements(previous, next) {
  const oldShop = previous && previous.premiumShop && typeof previous.premiumShop === 'object' && !Array.isArray(previous.premiumShop)
    ? previous.premiumShop : {};
  const nextShop = next && next.premiumShop && typeof next.premiumShop === 'object' && !Array.isArray(next.premiumShop)
    ? { ...next.premiumShop } : {};

  // Lifetime/account entitlements may grow, but an older/partial save cannot erase them.
  nextShop.statPointsPurchased = Math.max(
    saveNonNegativeInt(oldShop.statPointsPurchased),
    saveNonNegativeInt(nextShop.statPointsPurchased)
  );
  nextShop.auctionSlotGram = Math.max(
    Math.max(0, Number(oldShop.auctionSlotGram) || 0),
    Math.max(0, Number(nextShop.auctionSlotGram) || 0)
  );
  nextShop.autoAttackUnlocked = oldShop.autoAttackUnlocked === true || nextShop.autoAttackUnlocked === true;

  const oldBundles = oldShop.purchasedBundles && typeof oldShop.purchasedBundles === 'object' && !Array.isArray(oldShop.purchasedBundles)
    ? oldShop.purchasedBundles : {};
  const nextBundles = nextShop.purchasedBundles && typeof nextShop.purchasedBundles === 'object' && !Array.isArray(nextShop.purchasedBundles)
    ? nextShop.purchasedBundles : {};
  nextShop.purchasedBundles = { ...oldBundles, ...nextBundles };

  if (Number(oldShop.lastPremiumPurchaseAt) > Number(nextShop.lastPremiumPurchaseAt || 0)) {
    nextShop.lastPremiumPurchaseAt = Number(oldShop.lastPremiumPurchaseAt);
  }
  next.premiumShop = nextShop;

  for (const key of ['lifetimePaidGram', 'gramSpentLifetime']) {
    const oldValue = Math.max(0, Number(previous && previous[key]) || 0);
    const newValue = Math.max(0, Number(next && next[key]) || 0);
    if (oldValue > newValue) next[key] = oldValue;
  }
}

function preserveCharacterProgress(previous, next) {
  previous = previous && typeof previous === 'object' ? previous : {};
  next = next && typeof next === 'object' ? next : {};

  const oldRebirths = saveNonNegativeInt(previous.rebirths);
  let nextRebirths = saveNonNegativeInt(next.rebirths);
  if (nextRebirths < oldRebirths) {
    nextRebirths = oldRebirths;
    next.rebirths = oldRebirths;
  }
  const legitimateRebirth = nextRebirths > oldRebirths;

  // A real rebirth is the only normal operation allowed to lower level/XP.
  if (!legitimateRebirth) {
    for (const key of ['lvl', 'level']) {
      const oldLevel = Number(previous[key]);
      const newLevel = Number(next[key]);
      if (Number.isFinite(oldLevel) && oldLevel >= 1 &&
          (!Number.isFinite(newLevel) || newLevel < oldLevel)) {
        next[key] = oldLevel;
      }
    }

    const oldLevel = Number(previous.lvl);
    const newLevel = Number(next.lvl);
    const oldXp = Number(previous.xp);
    const newXp = Number(next.xp);
    if (Number.isFinite(oldLevel) && Number.isFinite(newLevel) && newLevel === oldLevel &&
        Number.isFinite(oldXp) && oldXp >= 0 &&
        (!Number.isFinite(newXp) || newXp < oldXp)) {
      next.xp = oldXp;
    }
  }

  // Free + allocated characteristic points form one lifetime pool.
  // Spending/reset/class-change only move points inside that pool, so it must never shrink.
  if (previous.statAlloc && typeof previous.statAlloc === 'object' &&
      (!next.statAlloc || typeof next.statAlloc !== 'object' || Array.isArray(next.statAlloc))) {
    next.statAlloc = { ...previous.statAlloc };
  }
  if (previous.statPts != null && next.statPts == null) {
    next.statPts = saveNonNegativeInt(previous.statPts);
  }

  const oldPool = savedStatPointPool(previous);
  const newPool = savedStatPointPool(next);
  if (oldPool > newPool) {
    next.statPts = saveNonNegativeInt(next.statPts) + (oldPool - newPool);
  }

  preserveDurablePremiumEntitlements(previous, next);
  return next;
}

async function ensureSaveHistorySchema(env) {
  if (saveHistorySchemaReady) return true;
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS save_history (
        telegram_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        archived_at INTEGER NOT NULL,
        PRIMARY KEY (telegram_id, version)
      )
    `).run();
    await env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_save_history_user_archived ON save_history(telegram_id, archived_at DESC)'
    ).run();
    saveHistorySchemaReady = true;
    return true;
  } catch (err) {
    console.warn('PPA save history schema:', err);
    return false;
  }
}

async function archivePreviousSave(env, telegramId, row) {
  if (!row || !(await ensureSaveHistorySchema(env))) return false;
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO save_history (telegram_id, version, state_json, updated_at, archived_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
    `).bind(
      telegramId,
      Number(row.version) || 0,
      String(row.state_json || '{}'),
      Number(row.updated_at) || 0,
      Date.now()
    ).run();
    return true;
  } catch (err) {
    console.warn('PPA save history archive:', err);
    return false;
  }
}

async function pruneSaveHistory(env, telegramId) {
  if (!saveHistorySchemaReady) return;
  try {
    await env.DB.prepare(`
      DELETE FROM save_history
      WHERE telegram_id=?1 AND version NOT IN (
        SELECT version FROM save_history
        WHERE telegram_id=?1
        ORDER BY version DESC
        LIMIT 10
      )
    `).bind(telegramId).run();
  } catch (err) {
    console.warn('PPA save history prune:', err);
  }
}

async function saveGameState(env, telegramId, state, expectedVersion) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, status: 400, code: 'BAD_SAVE_STATE', message: 'Некорректное сохранение.' };
  }

  // A save is a versioned document. Never let an older tab/build silently
  // overwrite a newer cloud snapshot. The client must save the version it
  // actually loaded; queued saves on the same client advance that version.
  const existing = await env.DB.prepare(
    'SELECT version, state_json, updated_at FROM saves WHERE telegram_id=?1'
  ).bind(telegramId).first();
  const currentVersion = Number(existing && existing.version) || 0;
  const hasExpected = expectedVersion !== null && expectedVersion !== undefined &&
    expectedVersion !== '' && Number.isFinite(Number(expectedVersion));
  const expected = hasExpected ? Math.max(0, Math.floor(Number(expectedVersion))) : null;

  if ((existing && (!hasExpected || expected !== currentVersion)) ||
      (!existing && hasExpected && expected !== 0)) {
    return {
      ok: false,
      status: 409,
      code: 'SAVE_VERSION_CONFLICT',
      message: 'Облачное сохранение уже новее. Старый клиент не может его перезаписать.',
      currentVersion,
      updatedAt: Number(existing && existing.updated_at) || 0
    };
  }

  const previous = parseStateJson(existing && existing.state_json) || {};
  state = preserveCharacterProgress(previous, { ...state });

  const profile = profileFromRow(await env.DB.prepare(
    'SELECT * FROM players WHERE telegram_id=?1'
  ).bind(telegramId).first());

  // A device/local save is never allowed to create or claim a character.
  // Character identity must already be registered for this authenticated
  // Telegram account through /api/character/register.
  if (!profile || !String(profile.nickname || '').trim()) {
    return {
      ok: false,
      status: 409,
      code: 'CHARACTER_NOT_REGISTERED',
      message: 'Сначала создай персонажа для этого Telegram-аккаунта.'
    };
  }

  state = applyProfileToSaveState(profile, state);
  const raw = JSON.stringify(state);
  if (new TextEncoder().encode(raw).byteLength > 1_800_000) {
    return { ok: false, status: 413, code: 'SAVE_TOO_LARGE', message: 'Сохранение слишком большое.' };
  }

  const now = Date.now();
  let version;

  if (existing) {
    version = currentVersion + 1;
    // Archive the currently authoritative snapshot before replacing it.
    await archivePreviousSave(env, telegramId, existing);
    const write = await env.DB.prepare(`
      UPDATE saves
      SET version=?1, state_json=?2, updated_at=?3
      WHERE telegram_id=?4 AND version=?5
    `).bind(version, raw, now, telegramId, currentVersion).run();
    const changes = Number(write && write.meta && write.meta.changes) || 0;
    if (changes !== 1) {
      const fresh = await env.DB.prepare(
        'SELECT version, updated_at FROM saves WHERE telegram_id=?1'
      ).bind(telegramId).first();
      return {
        ok: false,
        status: 409,
        code: 'SAVE_VERSION_CONFLICT',
        message: 'Облачное сохранение изменилось во время записи. Данные старого клиента не записаны.',
        currentVersion: Number(fresh && fresh.version) || currentVersion,
        updatedAt: Number(fresh && fresh.updated_at) || 0
      };
    }
  } else {
    version = 1;
    const write = await env.DB.prepare(`
      INSERT OR IGNORE INTO saves (telegram_id, version, state_json, updated_at)
      VALUES (?1, ?2, ?3, ?4)
    `).bind(telegramId, version, raw, now).run();
    const changes = Number(write && write.meta && write.meta.changes) || 0;
    if (changes !== 1) {
      const fresh = await env.DB.prepare(
        'SELECT version, updated_at FROM saves WHERE telegram_id=?1'
      ).bind(telegramId).first();
      return {
        ok: false,
        status: 409,
        code: 'SAVE_VERSION_CONFLICT',
        message: 'Облачное сохранение уже создано другим клиентом. Старые данные не записаны.',
        currentVersion: Number(fresh && fresh.version) || 0,
        updatedAt: Number(fresh && fresh.updated_at) || 0
      };
    }
  }

  if (state.cls || state.classKey) {
    await env.DB.prepare(`UPDATE players SET class_key=COALESCE(NULLIF(class_key,''),?1), updated_at=?2 WHERE telegram_id=?3`)
      .bind(normalizeClass(state.cls || state.classKey), now, telegramId).run();
  }
  if (existing) await pruneSaveHistory(env, telegramId);
  return { ok: true, version, updatedAt: now };
}

async function syncNicknameFromSave(env, telegramId, nickname) {
  nickname = String(nickname || '').trim();
  if (!validNickname(nickname)) return { ok: false, status: 400, message: 'Некорректный ник в сохранении.' };
  const current = await env.DB.prepare('SELECT * FROM players WHERE telegram_id=?1').bind(telegramId).first();
  if (!current) return { ok: false, status: 404, message: 'Профиль не найден.' };
  if (current.nickname_key) {
    if (current.nickname_key === nickKey(nickname)) {
      const profile = profileFromRow(current);
      const save = await upsertBoundInitialSave(env, telegramId, profile, nickname, current.class_key || '');
      return { ok: true, profile, save };
    }
    return { ok: false, status: 409, message: 'Серверный ник уже закреплён за аккаунтом.' };
  }
  return registerCharacter(env, telegramId, nickname, current.class_key || '');
}

async function deleteOwnAccount(env, telegramId, confirmText) {
  telegramId = String(telegramId || '').trim();
  confirmText = String(confirmText || '').trim();

  if (confirmText !== 'DELETE_MY_ACCOUNT') {
    return { ok: false, status: 400, code: 'CONFIRM_REQUIRED', message: 'Нужно подтвердить удаление аккаунта.' };
  }

  const player = await env.DB.prepare(
    'SELECT telegram_id,nickname FROM players WHERE telegram_id=?1 LIMIT 1'
  ).bind(telegramId).first();

  if (!player) {
    return { ok: false, status: 404, code: 'ACCOUNT_NOT_FOUND', message: 'Аккаунт уже удалён.' };
  }

  // Never orphan a clan. A solo clan can be removed with its owner; a clan
  // with other members requires leadership transfer first.
  try {
    const led = await env.DB.prepare(
      'SELECT id,name FROM clans WHERE leader_id=?1 LIMIT 1'
    ).bind(telegramId).first();
    if (led) {
      const cnt = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM clan_members WHERE clan_id=?1'
      ).bind(String(led.id)).first();
      if ((Number(cnt && cnt.n) || 0) > 1) {
        return {
          ok: false,
          status: 409,
          code: 'CLAN_LEADER_BLOCK',
          message: 'Сначала передай права главы клана другому игроку.'
        };
      }
      try { await env.DB.prepare('DELETE FROM clan_meta WHERE clan_id=?1').bind(String(led.id)).run(); } catch (_) {}
      try { await env.DB.prepare('DELETE FROM clan_members WHERE clan_id=?1').bind(String(led.id)).run(); } catch (_) {}
      try { await env.DB.prepare('DELETE FROM clans WHERE id=?1').bind(String(led.id)).run(); } catch (_) {}
    }
  } catch (_) {}

  // Do not let an account vanish while a payout is still unresolved.
  try {
    const pending = await env.DB.prepare(
      "SELECT id FROM withdraw_requests WHERE telegram_id=?1 AND status IN ('pending','approved') LIMIT 1"
    ).bind(telegramId).first();
    if (pending) {
      return {
        ok: false,
        status: 409,
        code: 'WITHDRAW_PENDING',
        message: 'Сначала заверши или отмени текущую заявку на вывод.'
      };
    }
  } catch (_) {}

  // Best-effort cleanup of gameplay/account state. TON deposits and completed
  // withdrawal records are preserved as financial audit records.
  const deletes = [
    ['DELETE FROM clan_members WHERE telegram_id=?1', [telegramId]],
    ['DELETE FROM social_friends WHERE owner_id=?1 OR friend_id=?1', [telegramId]],
    ['DELETE FROM clan_trades WHERE player_a=?1 OR player_b=?1', [telegramId]],
    ['DELETE FROM auction_lots WHERE seller_id=?1', [telegramId]],
    ['DELETE FROM auction_credits WHERE seller_id=?1', [telegramId]],
    ['DELETE FROM admin_event_reward_grants WHERE telegram_id=?1', [telegramId]],
    ['DELETE FROM stat_chest_open_requests WHERE telegram_id=?1', [telegramId]],
    ['DELETE FROM wallet_sync_state WHERE telegram_id=?1', [telegramId]],
    ['DELETE FROM wallets WHERE telegram_id=?1', [telegramId]],
    ['DELETE FROM player_visit_log WHERE telegram_id=?1', [telegramId]],
    ['DELETE FROM player_visit_stats WHERE telegram_id=?1', [telegramId]],
    ['DELETE FROM rename_requests WHERE telegram_id=?1', [telegramId]],
    ['DELETE FROM save_history WHERE telegram_id=?1', [telegramId]],
    ['DELETE FROM saves WHERE telegram_id=?1', [telegramId]]
  ];

  for (const [sql, params] of deletes) {
    try { await env.DB.prepare(sql).bind(...params).run(); } catch (_) {}
  }

  await env.DB.prepare('DELETE FROM players WHERE telegram_id=?1').bind(telegramId).run();

  return {
    ok: true,
    deleted: true,
    nickname: String(player.nickname || ''),
    preservedFinancialAudit: true,
    message: 'Аккаунт удалён. Перезапусти Mini App, чтобы создать нового персонажа.'
  };
}

async function renameWithCard(env, telegramId, newNickname, requestId) {
  newNickname = String(newNickname || '').trim();
  requestId = String(requestId || '').trim().slice(0, 120);
  if (!validNickname(newNickname)) return { ok: false, status: 400, message: 'Ник должен содержать 3–18 символов.' };
  if (!requestId) return { ok: false, status: 400, message: 'Не указан ID операции.' };

  const prior = await env.DB.prepare('SELECT result_json FROM rename_requests WHERE request_id=?1 AND telegram_id=?2')
    .bind(requestId, telegramId).first();
  if (prior) {
    try { return JSON.parse(prior.result_json); } catch (_) {}
  }

  const key = nickKey(newNickname);
  const owner = await nicknameOwner(env, key);
  if (owner && String(owner.telegram_id) !== String(telegramId)) return { ok: false, status: 409, message: 'Этот ник уже занят.' };

  const save = await loadSave(env, telegramId);
  const state = save.state;
  if (!state || (Number(state.renameCards) || 0) <= 0) {
    return { ok: false, status: 409, message: 'В облачном сохранении нет карточки смены имени.' };
  }

  state.renameCards = Math.max(0, Math.floor(Number(state.renameCards) || 0) - 1);
  state.playerName = newNickname;
  state.nickname = newNickname;
  state.telegramId = String(telegramId);
  state.profileTelegramId = String(telegramId);
  state.gatewayProfileBound = true;
  const now = Date.now();
  const nextVersion = (Number(save.version) || 0) + 1;
  const raw = JSON.stringify(state);

  await env.DB.prepare('UPDATE players SET nickname=?1,nickname_key=?2,updated_at=?3 WHERE telegram_id=?4')
    .bind(newNickname, key, now, telegramId).run();
  await env.DB.prepare(`
    INSERT INTO saves (telegram_id, version, state_json, updated_at)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(telegram_id) DO UPDATE SET
      version=excluded.version,
      state_json=excluded.state_json,
      updated_at=excluded.updated_at
  `).bind(telegramId, nextVersion, raw, now).run();

  const result = {
    ok: true,
    version: nextVersion,
    profile: profileFromRow(await env.DB.prepare('SELECT * FROM players WHERE telegram_id=?1').bind(telegramId).first()),
  };
  await env.DB.prepare('INSERT INTO rename_requests(request_id,telegram_id,result_json,created_at) VALUES(?1,?2,?3,?4)')
    .bind(requestId, telegramId, JSON.stringify(result), now).run();
  return result;
}


/* PPA_PHOENIX_LAUNCHER_AUTH_V1
 * Standalone Phoenix Launcher authentication. Existing Mini App auth/save routes stay unchanged.
 */
const PHOENIX_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PHOENIX_FLOW_TTL_MS = 10 * 60 * 1000;
const PHOENIX_EXCHANGE_TTL_MS = 3 * 60 * 1000;
const PHOENIX_PASSWORD_ITERATIONS = 210000;
const PHOENIX_GAME_TICKET_TTL_MS = 60 * 1000;
const PHOENIX_GAME_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PHOENIX_TELEGRAM_CLIENT_ID = '8476557926';
let phoenixAuthSchemaReady = false;

function phoenixBase64Url(bytes) {
  let s = '';
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function phoenixBase64UrlToBytes(value) {
  let s = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function phoenixRandomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return phoenixBase64Url(bytes);
}

async function phoenixSha256Bytes(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value || ''))));
}

async function phoenixSha256Hex(value) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(String(value || ''))));
}

function phoenixHexToBytes(value) {
  const s = String(value || '').trim();
  if (!/^[0-9a-f]+$/i.test(s) || s.length % 2) return new Uint8Array();
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function phoenixNormalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 254);
}

function phoenixValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(phoenixNormalizeEmail(value));
}

function phoenixValidPassword(value) {
  const s = String(value || '');
  return s.length >= 8 && s.length <= 128;
}

function phoenixValidPkce(value) {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(String(value || ''));
}

async function phoenixPasswordHash(password, saltHex) {
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(String(password || '')), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: phoenixHexToBytes(saltHex), iterations: PHOENIX_PASSWORD_ITERATIONS },
    material,
    256
  );
  return hex(bits);
}

async function ensurePhoenixAuthSchema(env) {
  if (phoenixAuthSchemaReady) return;
  if (!env.DB) throw Object.assign(new Error('D1 database is not connected'), { status: 503, code: 'DB_MISSING' });

  await env.DB.prepare('CREATE TABLE IF NOT EXISTS phoenix_accounts (account_id TEXT PRIMARY KEY, telegram_id TEXT UNIQUE, email TEXT UNIQUE, password_salt TEXT, password_hash TEXT, email_verified INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_login_at INTEGER NOT NULL DEFAULT 0)').run();
  // Non-destructive, one-to-one owner registry. Never copy, migrate or reset
  // saves: legacy Telegram keys stay intact and continue to be authoritative.
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS phoenix_character_identity (account_id TEXT PRIMARY KEY, character_id TEXT NOT NULL UNIQUE, legacy_telegram_id TEXT UNIQUE, created_at INTEGER NOT NULL, FOREIGN KEY (account_id) REFERENCES phoenix_accounts(account_id) ON DELETE CASCADE)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS phoenix_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY (account_id) REFERENCES phoenix_accounts(account_id) ON DELETE CASCADE)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS phoenix_auth_flows (state TEXT PRIMARY KEY, app_challenge TEXT NOT NULL, oauth_verifier TEXT, nonce TEXT, link_account_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS phoenix_exchange_codes (code_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, state TEXT NOT NULL, app_challenge TEXT NOT NULL, provider TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER NOT NULL DEFAULT 0, FOREIGN KEY (account_id) REFERENCES phoenix_accounts(account_id) ON DELETE CASCADE)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS phoenix_game_tickets (ticket_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, game_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER NOT NULL DEFAULT 0, FOREIGN KEY (account_id) REFERENCES phoenix_accounts(account_id) ON DELETE CASCADE)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS phoenix_game_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, game_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY (account_id) REFERENCES phoenix_accounts(account_id) ON DELETE CASCADE)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_phoenix_sessions_account ON phoenix_sessions(account_id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_phoenix_sessions_expiry ON phoenix_sessions(expires_at)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_phoenix_flows_expiry ON phoenix_auth_flows(expires_at)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_phoenix_codes_expiry ON phoenix_exchange_codes(expires_at)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_phoenix_game_tickets_expiry ON phoenix_game_tickets(expires_at)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_phoenix_game_sessions_expiry ON phoenix_game_sessions(expires_at)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_phoenix_game_sessions_account ON phoenix_game_sessions(account_id)').run();
  phoenixAuthSchemaReady = true;
}

async function phoenixCleanupAuth(env) {
  const now = Date.now();
  try { await env.DB.prepare('DELETE FROM phoenix_sessions WHERE expires_at<?1').bind(now).run(); } catch (_) {}
  try { await env.DB.prepare('DELETE FROM phoenix_auth_flows WHERE expires_at<?1').bind(now).run(); } catch (_) {}
  try { await env.DB.prepare('DELETE FROM phoenix_exchange_codes WHERE expires_at<?1 OR used_at>0').bind(now).run(); } catch (_) {}
  try { await env.DB.prepare('DELETE FROM phoenix_game_tickets WHERE expires_at<?1 OR used_at>0').bind(now).run(); } catch (_) {}
  try { await env.DB.prepare('DELETE FROM phoenix_game_sessions WHERE expires_at<?1').bind(now).run(); } catch (_) {}
}

async function phoenixAccountRow(env, accountId) {
  return env.DB.prepare('SELECT a.account_id,a.telegram_id,a.email,a.email_verified,a.created_at,a.updated_at,a.last_login_at,p.nickname,p.class_key,p.telegram_username,p.telegram_first_name,p.telegram_last_name,ci.character_id FROM phoenix_accounts a LEFT JOIN players p ON p.telegram_id=a.telegram_id LEFT JOIN phoenix_character_identity ci ON ci.account_id=a.account_id WHERE a.account_id=?1 LIMIT 1').bind(accountId).first();
}

function phoenixAccountPayload(row) {
  if (!row) return null;
  const ppaNickname = String(row.nickname || '').trim();
  const username = String(row.telegram_username || '').trim();
  const email = String(row.email || '').trim();
  const fallback = username || (email ? email.split('@')[0] : '') || 'Phoenix';
  return {
    accountId: String(row.account_id || ''),
    characterId: row.character_id == null ? null : String(row.character_id),
    telegramId: row.telegram_id == null ? null : String(row.telegram_id),
    email: email || null,
    emailVerified: Number(row.email_verified) === 1,
    nickname: ppaNickname || fallback,
    ppaNickname: ppaNickname || null,
    classKey: String(row.class_key || ''),
    telegramUsername: username || null,
    firstName: String(row.telegram_first_name || ''),
    lastName: String(row.telegram_last_name || ''),
    createdAt: Number(row.created_at) || 0
  };
}

// Bind only an EXISTING, REGISTERED Telegram hero to the signed Phoenix
// account. No duplicated save, no nickname mutation, no synthetic Telegram ID.
// Email-only users are intentionally unregistered until a canonical player-key
// migration can safely cover every game module.
async function phoenixBindExistingCharacterIdentity(env, accountId) {
  const account = await phoenixAccountRow(env, accountId);
  if (!account) throw Object.assign(new Error('Phoenix account missing'), { status: 404, code: 'ACCOUNT_NOT_FOUND' });
  const id = account.telegram_id == null ? '' : String(account.telegram_id).trim();
  const existing = await env.DB.prepare('SELECT character_id,legacy_telegram_id FROM phoenix_character_identity WHERE account_id=?1 LIMIT 1').bind(accountId).first();
  if (!id || !String(account.nickname || '').trim()) {
    if (existing) throw Object.assign(new Error('Registered hero lost its Telegram link'), { status: 409, code: 'CHARACTER_IDENTITY_CONFLICT' });
    return null;
  }
  // NEVER treat a profile-only bootstrap as an existing save.
  const save = await env.DB.prepare('SELECT version FROM saves WHERE telegram_id=?1 LIMIT 1').bind(id).first();
  if (!save || Number(save.version) < 1) return null;
  if (existing && String(existing.legacy_telegram_id || '') !== id) {
    throw Object.assign(new Error('Character is already owned by another identity'), { status: 409, code: 'CHARACTER_IDENTITY_CONFLICT' });
  }
  const owner = await env.DB.prepare('SELECT account_id,character_id FROM phoenix_character_identity WHERE legacy_telegram_id=?1 LIMIT 1').bind(id).first();
  if (owner && String(owner.account_id) !== accountId) {
    throw Object.assign(new Error('Character ownership conflict'), { status: 409, code: 'CHARACTER_IDENTITY_CONFLICT' });
  }
  if (!existing) {
    await env.DB.prepare('INSERT OR IGNORE INTO phoenix_character_identity (account_id,character_id,legacy_telegram_id,created_at) VALUES (?1,?2,?3,?4)')
      .bind(accountId, 'pc_' + phoenixRandomToken(18), id, Date.now()).run();
  }
  const verified = await env.DB.prepare('SELECT character_id,legacy_telegram_id FROM phoenix_character_identity WHERE account_id=?1 LIMIT 1').bind(accountId).first();
  if (!verified || String(verified.legacy_telegram_id) !== id) {
    throw Object.assign(new Error('Character ownership mismatch'), { status: 409, code: 'CHARACTER_IDENTITY_CONFLICT' });
  }
  return { characterId: String(verified.character_id), legacyTelegramId: id };
}

async function phoenixEnsureAccountForTelegram(env, tgUser, preferredAccountId = '') {
  const player = await ensurePlayer(env, tgUser);
  const telegramId = String(tgUser.id);
  const now = Date.now();
  const preferred = String(preferredAccountId || '').trim();
  const existing = await env.DB.prepare('SELECT * FROM phoenix_accounts WHERE telegram_id=?1 LIMIT 1').bind(telegramId).first();

  if (existing) {
    if (preferred && preferred !== String(existing.account_id)) {
      const source = await env.DB.prepare('SELECT * FROM phoenix_accounts WHERE account_id=?1 LIMIT 1').bind(preferred).first();
      if (source) {
        if (source.telegram_id && String(source.telegram_id) !== telegramId) {
          throw Object.assign(new Error('Phoenix Account уже связан с другим Telegram'), { status: 409, code: 'TELEGRAM_ALREADY_LINKED' });
        }
        const sourceEmail = String(source.email || '').trim();
        const existingEmail = String(existing.email || '').trim();
        if (sourceEmail && existingEmail && sourceEmail !== existingEmail) {
          throw Object.assign(new Error('У Telegram и Email уже разные Phoenix Accounts. Требуется ручное объединение.'), { status: 409, code: 'PHOENIX_ACCOUNT_MERGE_REQUIRED' });
        }
        if (sourceEmail && !existingEmail) {
          await env.DB.prepare('UPDATE phoenix_accounts SET email=?1,password_salt=?2,password_hash=?3,email_verified=?4,updated_at=?5,last_login_at=?5 WHERE account_id=?6')
            .bind(source.email, source.password_salt, source.password_hash, Number(source.email_verified) || 0, now, existing.account_id).run();
        }
        await env.DB.prepare('DELETE FROM phoenix_accounts WHERE account_id=?1').bind(preferred).run();
      }
    }
    await env.DB.prepare('UPDATE phoenix_accounts SET updated_at=?1,last_login_at=?1 WHERE account_id=?2').bind(now, existing.account_id).run();
    return { accountId: String(existing.account_id), player };
  }

  let accountId = preferred;
  if (accountId) {
    const target = await env.DB.prepare('SELECT * FROM phoenix_accounts WHERE account_id=?1 LIMIT 1').bind(accountId).first();
    if (!target) accountId = '';
    else if (target.telegram_id && String(target.telegram_id) !== telegramId) {
      throw Object.assign(new Error('Phoenix Account уже связан с другим Telegram'), { status: 409, code: 'TELEGRAM_ALREADY_LINKED' });
    }
  }
  if (!accountId) accountId = 'px_' + phoenixRandomToken(18);

  await env.DB.prepare('INSERT INTO phoenix_accounts (account_id,telegram_id,created_at,updated_at,last_login_at) VALUES (?1,?2,?3,?3,?3) ON CONFLICT(account_id) DO UPDATE SET telegram_id=excluded.telegram_id,updated_at=excluded.updated_at,last_login_at=excluded.last_login_at').bind(accountId, telegramId, now).run();
  return { accountId, player };
}

async function phoenixCreateSession(env, accountId, provider) {
  const raw = phoenixRandomToken(32);
  const tokenHash = await phoenixSha256Hex(raw);
  const now = Date.now();
  const expiresAt = now + PHOENIX_SESSION_TTL_MS;
  await env.DB.prepare('INSERT INTO phoenix_sessions (token_hash,account_id,provider,created_at,expires_at) VALUES (?1,?2,?3,?4,?5)').bind(tokenHash, accountId, provider, now, expiresAt).run();
  await env.DB.prepare('UPDATE phoenix_accounts SET last_login_at=?1,updated_at=?1 WHERE account_id=?2').bind(now, accountId).run();
  return { token: raw, expiresAt };
}

async function phoenixSessionFromRequest(request, env, required = true) {
  const header = String(request.headers.get('authorization') || '');
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    if (!required) return null;
    throw Object.assign(new Error('Phoenix session missing'), { status: 401, code: 'PHOENIX_SESSION_MISSING' });
  }
  const tokenHash = await phoenixSha256Hex(match[1].trim());
  const row = await env.DB.prepare('SELECT account_id,provider,expires_at FROM phoenix_sessions WHERE token_hash=?1 LIMIT 1').bind(tokenHash).first();
  if (!row || Number(row.expires_at) <= Date.now()) {
    if (row) try { await env.DB.prepare('DELETE FROM phoenix_sessions WHERE token_hash=?1').bind(tokenHash).run(); } catch (_) {}
    throw Object.assign(new Error('Phoenix session expired'), { status: 401, code: 'PHOENIX_SESSION_EXPIRED' });
  }
  return { tokenHash, accountId: String(row.account_id), provider: String(row.provider || '') };
}

async function phoenixCreateTelegramFlow(request, env, body) {
  await ensurePhoenixAuthSchema(env);
  await phoenixCleanupAuth(env);
  const state = String(body.state || '').trim();
  const appChallenge = String(body.codeChallenge || '').trim();
  if (!phoenixValidPkce(state) || !/^[A-Za-z0-9_-]{43,128}$/.test(appChallenge)) {
    return apiError('Invalid launcher PKCE request', 400, 'INVALID_PKCE');
  }

  let linkAccountId = '';
  try {
    const session = await phoenixSessionFromRequest(request, env, false);
    if (session) linkAccountId = session.accountId;
  } catch (_) {}

  const oauthVerifier = phoenixRandomToken(48);
  const nonce = phoenixRandomToken(24);
  const now = Date.now();
  await env.DB.prepare('INSERT OR REPLACE INTO phoenix_auth_flows (state,app_challenge,oauth_verifier,nonce,link_account_id,created_at,expires_at) VALUES (?1,?2,?3,?4,?5,?6,?7)').bind(state, appChallenge, oauthVerifier, nonce, linkAccountId || null, now, now + PHOENIX_FLOW_TTL_MS).run();

  const beginUrl = new URL(new URL(request.url).origin + '/launcher/auth/telegram');
  beginUrl.searchParams.set('state', state);
  return json({ ok: true, authUrl: beginUrl.toString(), mode: env.TELEGRAM_LOGIN_CLIENT_ID && env.TELEGRAM_LOGIN_CLIENT_SECRET ? 'oidc' : 'widget' });
}

async function phoenixValidateLegacyTelegram(params, botToken) {
  if (!botToken) throw Object.assign(new Error('BOT_TOKEN secret is not configured'), { status: 503, code: 'BOT_TOKEN_MISSING' });
  const receivedHash = String(params.get('hash') || '').toLowerCase();
  if (!receivedHash) throw Object.assign(new Error('Telegram hash missing'), { status: 401, code: 'HASH_MISSING' });
  const entries = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash' || k === 'state') continue;
    entries.push(k + '=' + v);
  }
  entries.sort((a, b) => a.localeCompare(b));
  const secretKey = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(botToken)));
  const calculated = hex(await hmacSha256(secretKey, entries.join('\n')));
  if (!timingSafeEqualHex(calculated, receivedHash)) {
    throw Object.assign(new Error('Telegram signature check failed'), { status: 401, code: 'INVALID_TELEGRAM_SIGNATURE' });
  }
  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0 || authDate > now + 300 || now - authDate > 3600) {
    throw Object.assign(new Error('Telegram login expired'), { status: 401, code: 'TELEGRAM_LOGIN_EXPIRED' });
  }
  const id = params.get('id');
  if (!id) throw Object.assign(new Error('Telegram user missing'), { status: 401, code: 'TELEGRAM_USER_MISSING' });
  return { id, username: params.get('username') || '', first_name: params.get('first_name') || '', last_name: params.get('last_name') || '' };
}

function phoenixDecodeJwtPart(part) {
  try { return JSON.parse(new TextDecoder().decode(phoenixBase64UrlToBytes(part))); }
  catch (_) { return null; }
}

async function phoenixValidateTelegramIdToken(idToken, env, expectedNonce) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw Object.assign(new Error('Telegram ID token invalid'), { status: 401, code: 'INVALID_ID_TOKEN' });
  const header = phoenixDecodeJwtPart(parts[0]);
  const claims = phoenixDecodeJwtPart(parts[1]);
  if (!header || !claims || header.alg !== 'RS256' || !header.kid) {
    throw Object.assign(new Error('Telegram ID token header invalid'), { status: 401, code: 'INVALID_ID_TOKEN' });
  }
  const jwksRes = await fetch('https://oauth.telegram.org/.well-known/jwks.json', { headers: { accept: 'application/json' } });
  if (!jwksRes.ok) throw Object.assign(new Error('Telegram JWKS unavailable'), { status: 502, code: 'TELEGRAM_JWKS_ERROR' });
  const jwks = await jwksRes.json();
  const jwk = Array.isArray(jwks && jwks.keys) ? jwks.keys.find((k) => k && k.kid === header.kid) : null;
  if (!jwk) throw Object.assign(new Error('Telegram signing key not found'), { status: 401, code: 'TELEGRAM_KEY_NOT_FOUND' });
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, phoenixBase64UrlToBytes(parts[2]), encoder.encode(parts[0] + '.' + parts[1]));
  if (!valid) throw Object.assign(new Error('Telegram ID token signature invalid'), { status: 401, code: 'INVALID_ID_TOKEN_SIGNATURE' });

  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud || '')];
  if (String(claims.iss || '') !== 'https://oauth.telegram.org' ||
      !aud.includes(String(env.TELEGRAM_LOGIN_CLIENT_ID || PHOENIX_TELEGRAM_CLIENT_ID)) ||
      Number(claims.exp) <= now ||
      Number(claims.iat) > now + 300 ||
      (expectedNonce && String(claims.nonce || '') !== String(expectedNonce))) {
    throw Object.assign(new Error('Telegram ID token claims invalid'), { status: 401, code: 'INVALID_ID_TOKEN_CLAIMS' });
  }
  if (claims.id == null && claims.sub == null) throw Object.assign(new Error('Telegram user id missing'), { status: 401, code: 'TELEGRAM_USER_MISSING' });
  return claims;
}

async function phoenixCompleteTelegramLogin(env, flow, tgUser, state) {
  const linked = await phoenixEnsureAccountForTelegram(env, tgUser, flow.link_account_id || '');
  const rawCode = phoenixRandomToken(32);
  const codeHash = await phoenixSha256Hex(rawCode);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO phoenix_exchange_codes (code_hash,account_id,state,app_challenge,provider,created_at,expires_at,used_at) VALUES (?1,?2,?3,?4,?5,?6,?7,0)').bind(codeHash, linked.accountId, state, flow.app_challenge, 'telegram', now, now + PHOENIX_EXCHANGE_TTL_MS).run();
  await env.DB.prepare('DELETE FROM phoenix_auth_flows WHERE state=?1').bind(state).run();
  const redirect = new URL('phoenixlauncher://auth');
  redirect.searchParams.set('code', rawCode);
  redirect.searchParams.set('state', state);
  return Response.redirect(redirect.toString(), 302);
}

async function handlePhoenixTelegramBrowser(request, env, url) {
  await ensurePhoenixAuthSchema(env);
  const state = String(url.searchParams.get('state') || '').trim();
  if (!phoenixValidPkce(state)) return new Response('Invalid Phoenix auth state', { status: 400 });
  const flow = await env.DB.prepare('SELECT * FROM phoenix_auth_flows WHERE state=?1 LIMIT 1').bind(state).first();
  if (!flow || Number(flow.expires_at) <= Date.now()) return new Response('Phoenix login session expired. Return to Phoenix Launcher and try again.', { status: 410 });

  if (url.pathname === '/launcher/auth/telegram') {
    if (env.TELEGRAM_LOGIN_CLIENT_ID && env.TELEGRAM_LOGIN_CLIENT_SECRET) {
      const redirectUri = url.origin + '/launcher/auth/telegram/callback';
      const auth = new URL('https://oauth.telegram.org/auth');
      auth.searchParams.set('client_id', String(env.TELEGRAM_LOGIN_CLIENT_ID));
      auth.searchParams.set('redirect_uri', redirectUri);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('scope', 'openid profile');
      auth.searchParams.set('state', state);
      auth.searchParams.set('nonce', String(flow.nonce || ''));
      auth.searchParams.set('code_challenge', phoenixBase64Url(await phoenixSha256Bytes(String(flow.oauth_verifier || ''))));
      auth.searchParams.set('code_challenge_method', 'S256');
      return Response.redirect(auth.toString(), 302);
    }

    if (!env.BOT_TOKEN) return new Response('Telegram login is not configured', { status: 503 });
    const meRes = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/getMe', { cache: 'no-store' });
    const me = meRes.ok ? await meRes.json() : null;
    const botUsername = String(me && me.result && me.result.username || '').trim();
    if (!botUsername) return new Response('Telegram bot username unavailable', { status: 503 });
    const callback = new URL(url.origin + '/launcher/auth/telegram/legacy-callback');
    callback.searchParams.set('state', state);
    const safeBot = botUsername.replace(/"/g, '&quot;');
    const safeCallback = callback.toString().replace(/"/g, '&quot;');
    const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phoenix · Telegram</title><style>body{margin:0;background:#07080a;color:#edeff0;font-family:system-ui;display:grid;place-items:center;min-height:100vh}.c{text-align:center;padding:32px}.p{color:#fe6d1c;font-size:42px;font-weight:900}.m{color:#7e848b;margin:12px 0 28px}</style></head><body><div class="c"><div class="p">PHOENIX</div><div class="m">Вход через Telegram</div><script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="' + safeBot + '" data-size="large" data-userpic="false" data-auth-url="' + safeCallback + '" data-request-access="write"></script></div></body></html>';
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }

  if (url.pathname === '/launcher/auth/telegram/legacy-callback') {
    try {
      const user = await phoenixValidateLegacyTelegram(url.searchParams, env.BOT_TOKEN);
      return phoenixCompleteTelegramLogin(env, flow, user, state);
    } catch (err) {
      console.error('Phoenix Telegram widget login:', err);
      return new Response(String(err && err.message || 'Telegram login failed'), { status: Number(err && err.status) || 401 });
    }
  }

  if (url.pathname === '/launcher/auth/telegram/callback') {
    try {
      if (!env.TELEGRAM_LOGIN_CLIENT_ID || !env.TELEGRAM_LOGIN_CLIENT_SECRET) return new Response('Telegram OIDC is not configured', { status: 503 });
      const oauthError = url.searchParams.get('error');
      if (oauthError) return new Response('Telegram login cancelled: ' + oauthError, { status: 401 });
      const code = String(url.searchParams.get('code') || '');
      if (!code) return new Response('Telegram authorization code missing', { status: 400 });
      const redirectUri = url.origin + '/launcher/auth/telegram/callback';
      const basic = btoa(String(env.TELEGRAM_LOGIN_CLIENT_ID) + ':' + String(env.TELEGRAM_LOGIN_CLIENT_SECRET));
      const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: String(env.TELEGRAM_LOGIN_CLIENT_ID), code_verifier: String(flow.oauth_verifier || '') });
      const tokenRes = await fetch('https://oauth.telegram.org/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + basic, accept: 'application/json' }, body: form });
      const tokens = await tokenRes.json().catch(() => null);
      if (!tokenRes.ok || !tokens || !tokens.id_token) return new Response('Telegram token exchange failed', { status: 401 });
      const claims = await phoenixValidateTelegramIdToken(tokens.id_token, env, String(flow.nonce || ''));
      const user = { id: claims.id != null ? claims.id : claims.sub, username: claims.preferred_username || '', first_name: claims.given_name || claims.name || '', last_name: claims.family_name || '' };
      return phoenixCompleteTelegramLogin(env, flow, user, state);
    } catch (err) {
      console.error('Phoenix Telegram OIDC login:', err);
      return new Response(String(err && err.message || 'Telegram login failed'), { status: Number(err && err.status) || 401 });
    }
  }
  return null;
}


async function phoenixCreateGameTicket(env, accountId, gameId) {
  const ticket = phoenixRandomToken(32);
  const ticketHash = await phoenixSha256Hex(ticket);
  const now = Date.now();
  const expiresAt = now + PHOENIX_GAME_TICKET_TTL_MS;
  await env.DB.prepare('INSERT INTO phoenix_game_tickets (ticket_hash,account_id,game_id,created_at,expires_at,used_at) VALUES (?1,?2,?3,?4,?5,0)')
    .bind(ticketHash, accountId, gameId, now, expiresAt).run();
  return { ticket, expiresAt };
}

async function phoenixCreateGameSession(env, accountId, gameId) {
  const token = phoenixRandomToken(32);
  const tokenHash = await phoenixSha256Hex(token);
  const now = Date.now();
  const expiresAt = now + PHOENIX_GAME_SESSION_TTL_MS;
  await env.DB.prepare('INSERT INTO phoenix_game_sessions (token_hash,account_id,game_id,created_at,expires_at) VALUES (?1,?2,?3,?4,?5)')
    .bind(tokenHash, accountId, gameId, now, expiresAt).run();
  return { token, expiresAt };
}

async function phoenixGameSessionFromRequest(request, env, required = true) {
  const header = String(request.headers.get('authorization') || '');
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    if (!required) return null;
    throw Object.assign(new Error('Game session missing'), { status: 401, code: 'GAME_SESSION_MISSING' });
  }
  const tokenHash = await phoenixSha256Hex(match[1].trim());
  const row = await env.DB.prepare('SELECT account_id,game_id,expires_at FROM phoenix_game_sessions WHERE token_hash=?1 LIMIT 1')
    .bind(tokenHash).first();
  if (!row || Number(row.expires_at) <= Date.now()) {
    if (row) try { await env.DB.prepare('DELETE FROM phoenix_game_sessions WHERE token_hash=?1').bind(tokenHash).run(); } catch (_) {}
    throw Object.assign(new Error('Game session expired'), { status: 401, code: 'GAME_SESSION_EXPIRED' });
  }
  return { tokenHash, accountId: String(row.account_id), gameId: String(row.game_id || '') };
}

async function handlePhoenixGameApi(request, env, url) {
  if (!url.pathname.startsWith('/api/game/')) return null;
  await ensurePhoenixAuthSchema(env);
  try {
    let body = {};
    if (request.method !== 'GET') {
      try { body = await request.json(); } catch (_) { body = {}; }
    }

    if (url.pathname === '/api/game/session/exchange') {
      if (request.method !== 'POST') return apiError('POST required', 405, 'METHOD_NOT_ALLOWED');
      const ticket = String(body.ticket || '').trim();
      const requestedGameId = String(body.gameId || '').trim();
      if (!ticket) return apiError('Game ticket missing', 400, 'GAME_TICKET_MISSING');

      const ticketHash = await phoenixSha256Hex(ticket);
      const row = await env.DB.prepare('SELECT * FROM phoenix_game_tickets WHERE ticket_hash=?1 LIMIT 1')
        .bind(ticketHash).first();
      const now = Date.now();
      if (!row || Number(row.used_at) > 0 || Number(row.expires_at) <= now) {
        return apiError('Game ticket expired or already used', 401, 'GAME_TICKET_INVALID');
      }
      if (requestedGameId && requestedGameId !== String(row.game_id || '')) {
        return apiError('Game ticket does not match this game', 403, 'GAME_TICKET_WRONG_GAME');
      }

      const used = await env.DB.prepare('UPDATE phoenix_game_tickets SET used_at=?1 WHERE ticket_hash=?2 AND used_at=0')
        .bind(now, ticketHash).run();
      if (!used || Number(used.meta && used.meta.changes || 0) !== 1) {
        return apiError('Game ticket already used', 401, 'GAME_TICKET_USED');
      }

      const session = await phoenixCreateGameSession(env, String(row.account_id), String(row.game_id));
      const account = phoenixAccountPayload(await phoenixAccountRow(env, String(row.account_id)));
      return json({ ok: true, session, gameId: String(row.game_id), account });
    }

    if (url.pathname === '/api/game/me') {
      if (request.method !== 'GET') return apiError('GET required', 405, 'METHOD_NOT_ALLOWED');
      const auth = await phoenixGameSessionFromRequest(request, env, true);
      const account = phoenixAccountPayload(await phoenixAccountRow(env, auth.accountId));
      return json({ ok: true, gameId: auth.gameId, account });
    }

    // Account-bound hero discovery is read-only with respect to original saves.
    // The identity registry may be filled idempotently for pre-existing heroes.
    if (url.pathname === '/api/game/character') {
      if (request.method !== 'GET') return apiError('GET required', 405, 'METHOD_NOT_ALLOWED');
      const auth = await phoenixGameSessionFromRequest(request, env, true);
      if (auth.gameId !== 'phoenix-pix-arena') return apiError('Wrong game session', 403, 'GAME_SESSION_WRONG_GAME');
      const identity = await phoenixBindExistingCharacterIdentity(env, auth.accountId);
      const account = phoenixAccountPayload(await phoenixAccountRow(env, auth.accountId));
      return json({ ok: true, account, characterId: identity ? identity.characterId : null,
        needsCharacter: !identity, needsTelegramLink: !account.telegramId });
    }

    // NEW Telegram-linked PPA characters use exactly the original game
    // registration path, newbie chest and save. No parallel Godot save exists.
    // Disabled by default until a verified APK supports new-player onboarding.
    if (url.pathname === '/api/game/character/register') {
      if (String(env.PPA_GODOT_CHARACTER_REGISTER_ENABLED || '') !== '1')
        return apiError('Game API route not found', 404, 'NOT_FOUND');
      if (request.method !== 'POST') return apiError('POST required', 405, 'METHOD_NOT_ALLOWED');
      const auth = await phoenixGameSessionFromRequest(request, env, true);
      if (auth.gameId !== 'phoenix-pix-arena') return apiError('Wrong game session', 403, 'GAME_SESSION_WRONG_GAME');
      const account = await phoenixAccountRow(env, auth.accountId);
      if (!account) return apiError('Phoenix account missing', 404, 'ACCOUNT_NOT_FOUND');
      const telegramId = account.telegram_id == null ? '' : String(account.telegram_id).trim();
      if (!telegramId) return apiError('Email-only player creation needs the canonical player-key migration', 409, 'EMAIL_CHARACTER_REGISTRATION_NOT_READY');
      const classKey = String(body.classKey || '').toLowerCase().trim();
      if (!['gnome','tank','barbarian','paladin','archer','mage','assassin','priest'].includes(classKey))
        return apiError('Unknown PPA class', 400, 'INVALID_CLASS');
      const result = await registerCharacter(env, telegramId, body.nickname, classKey);
      if (!result.ok) return json(result, Number(result.status) || 400);
      const identity = await phoenixBindExistingCharacterIdentity(env, auth.accountId);
      if (!identity) return apiError('Character save was not confirmed', 409, 'PPA_CHARACTER_SAVE_NOT_READY');
      return json({ ok: true, characterId: identity.characterId, profile: result.profile,
        save: result.save, newbieChestGranted: result.newbieChestGranted });
    }

    // Native Godot game: signed Phoenix game session -> linked Telegram player's
    // EXACT existing cloud save. Intentionally READ-ONLY; never accept a
    // telegramId/characterId from the client and never write game state.
    // Reuses the account/session identity established by Phoenix Launcher.
    if (url.pathname === '/api/game/state') {
      // Fail closed on every normal PPA deployment until the owner explicitly
      // enables this READ-ONLY native bridge in Cloudflare Worker settings.
      // Default: behave exactly like the old nonexistent route (404).
      if (String(env.PPA_GODOT_STATE_READ_ENABLED || '') !== '1') {
        return apiError('Game API route not found', 404, 'NOT_FOUND');
      }
      if (request.method !== 'GET') return apiError('GET required', 405, 'METHOD_NOT_ALLOWED');
      const auth = await phoenixGameSessionFromRequest(request, env, true);
      if (auth.gameId !== 'phoenix-pix-arena') {
        return apiError('Wrong game session', 403, 'GAME_SESSION_WRONG_GAME');
      }
      const accountRow = await phoenixAccountRow(env, auth.accountId);
      if (!accountRow) return apiError('Phoenix account missing', 404, 'ACCOUNT_NOT_FOUND');
      const telegramId = accountRow.telegram_id == null ? '' : String(accountRow.telegram_id).trim();
      if (!telegramId) {
        return apiError('Привяжи свой Telegram аккаунт, прежде чем загружать персонажа PPA.', 409, 'TELEGRAM_NOT_LINKED');
      }
      const snapshot = await loadSave(env, telegramId);
      if (!snapshot.ok) return json(snapshot, Number(snapshot.status) || 500);
      // Existing loadSave can synthesize a bootstrap state from the profile
      // when no save row exists. Never present that placeholder as real native
      // progress or an inventory. Godot must wait for the original PPA save.
      if (snapshot.bootstrapFromProfile || !snapshot.state ||
          typeof snapshot.state !== 'object' || Array.isArray(snapshot.state)) {
        return apiError('Existing PPA character save not ready', 409, 'PPA_CHARACTER_SAVE_NOT_READY');
      }
      return json({
        ok: true,
        readOnly: true,
        gameId: auth.gameId,
        profile: snapshot.profile || null,
        version: snapshot.version,
        state: snapshot.state,
        updatedAt: snapshot.updatedAt || null
      });
    }

    // Native clan UI uses the existing clan tables and exact same rule
    // handlers as Telegram. Both new flags are disabled by default.
    if (url.pathname === '/api/game/clan/state' || url.pathname === '/api/game/clan/action') {
      if (String(env.PPA_GODOT_CLAN_READ_ENABLED || '') !== '1')
        return apiError('Game API route not found', 404, 'NOT_FOUND');
      const operation = url.pathname.endsWith('/state') ? 'state' : 'action';
      if (request.method !== (operation === 'state' ? 'GET' : 'POST'))
        return apiError('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
      if (operation === 'action' && String(env.PPA_GODOT_CLAN_ACTIONS_ENABLED || '') !== '1')
        return apiError('Game API route not found', 404, 'NOT_FOUND');
      const auth = await phoenixGameSessionFromRequest(request, env, true);
      if (auth.gameId !== 'phoenix-pix-arena') return apiError('Wrong game session', 403, 'GAME_SESSION_WRONG_GAME');
      const account = await phoenixAccountRow(env, auth.accountId);
      if (!account) return apiError('Phoenix account missing', 404, 'ACCOUNT_NOT_FOUND');
      const ownerId = account.telegram_id == null ? '' : String(account.telegram_id).trim();
      if (!ownerId) return apiError('Telegram character not linked', 409, 'TELEGRAM_NOT_LINKED');
      const result = await nativeClanOperation(env, ownerId, operation, body);
      return json(result.data, result.status);
    }

    // Typed merchant commands update the existing versioned save through the
    // same persistence helper as Telegram. Client prices/state are ignored.
    if (url.pathname === '/api/game/merchant/state' || url.pathname === '/api/game/merchant/action') {
      if (String(env.PPA_MERCHANT_READ_ENABLED || '') !== '1')
        return apiError('Game API route not found', 404, 'NOT_FOUND');
      const operation = url.pathname.endsWith('/state') ? 'state' : 'action';
      if (request.method !== (operation === 'state' ? 'GET' : 'POST'))
        return apiError('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
      if (operation === 'action' && String(env.PPA_MERCHANT_ACTIONS_ENABLED || '') !== '1')
        return apiError('Game API route not found', 404, 'NOT_FOUND');
      const auth = await phoenixGameSessionFromRequest(request, env, true);
      if (auth.gameId !== 'phoenix-pix-arena') return apiError('Wrong game session', 403, 'GAME_SESSION_WRONG_GAME');
      const account = await phoenixAccountRow(env, auth.accountId);
      if (!account) return apiError('Phoenix account missing', 404, 'ACCOUNT_NOT_FOUND');
      const ownerId = account.telegram_id == null ? '' : String(account.telegram_id).trim();
      if (!ownerId) return apiError('Telegram character not linked', 409, 'TELEGRAM_NOT_LINKED');
      const result = await sharedMerchantOperation(env, ownerId, operation, body,
        {load: id => loadSave(env, id), save: (id, state, version) => saveGameState(env, id, state, version)});
      return json(result.data, result.status);
    }

    // Same legacy Telegram PPA save, same forge recipe IDs and the same
    // versioned D1 write as the original client. New actions are OFF by default.
    // Currently only the six audited EPIC gear recipes can be crafted.
    if (url.pathname === '/api/game/forge/state' || url.pathname === '/api/game/forge/action') {
      if (String(env.PPA_FORGE_READ_ENABLED || '') !== '1')
        return apiError('Game API route not found', 404, 'NOT_FOUND');
      const operation = url.pathname.endsWith('/state') ? 'state' : 'action';
      if (request.method !== (operation === 'state' ? 'GET' : 'POST'))
        return apiError('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
      if (operation === 'action' && !(body.action === 'craft' &&
          String(env.PPA_FORGE_ACTIONS_ENABLED || '') === '1') &&
          !(body.action === 'enhance' && String(env.PPA_FORGE_ENHANCE_ENABLED || '') === '1'))
        return apiError('Game API route not found', 404, 'NOT_FOUND');
      const auth = await phoenixGameSessionFromRequest(request, env, true);
      if (auth.gameId !== 'phoenix-pix-arena') return apiError('Wrong game session', 403, 'GAME_SESSION_WRONG_GAME');
      const account = await phoenixAccountRow(env, auth.accountId);
      if (!account) return apiError('Phoenix account missing', 404, 'ACCOUNT_NOT_FOUND');
      const ownerId = account.telegram_id == null ? '' : String(account.telegram_id).trim();
      if (!ownerId) return apiError('Telegram character not linked', 409, 'TELEGRAM_NOT_LINKED');
      const result = await sharedForgeOperation(env, ownerId, operation, body,
        {load: id => loadSave(env, id), save: (id, state, version) => saveGameState(env, id, state, version)});
      return json(result.data, result.status);
    }

    // Original Telegram PPA equipFromBag / unequipSlot, same versioned save.
    // Account, permissions, and real bag UID are validated on the server.
    // Independent flags default OFF; this does NOT change live Telegram.
    if (url.pathname === '/api/game/inventory/state' || url.pathname === '/api/game/inventory/action') {
      if (String(env.PPA_INVENTORY_READ_ENABLED || '') !== '1')
        return apiError('Game API route not found', 404, 'NOT_FOUND');
      const operation = url.pathname.endsWith('/state') ? 'state' : 'action';
      if (request.method !== (operation === 'state' ? 'GET' : 'POST'))
        return apiError('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
      if (operation === 'action' && String(env.PPA_INVENTORY_ACTIONS_ENABLED || '') !== '1')
        return apiError('Game API route not found', 404, 'NOT_FOUND');
      const auth = await phoenixGameSessionFromRequest(request, env, true);
      if (auth.gameId !== 'phoenix-pix-arena')
        return apiError('Wrong game session', 403, 'GAME_SESSION_WRONG_GAME');
      const account = await phoenixAccountRow(env, auth.accountId);
      if (!account) return apiError('Phoenix account missing', 404, 'ACCOUNT_NOT_FOUND');
      const ownerId = account.telegram_id == null ? '' : String(account.telegram_id).trim();
      if (!ownerId) return apiError('Telegram character not linked', 409, 'TELEGRAM_NOT_LINKED');
      const result = await sharedInventoryOperation(env, ownerId, operation, body,
        {load: id => loadSave(env,id), save: (id,state,version) => saveGameState(env,id,state,version)});
      return json(result.data,result.status);
    }

    // Signed native NPC/arena read: one player, one versioned PPA save,
    // ZERO price promises, ZERO actions and ZERO write to Telegram data.
    // Both service and save-read flags default OFF in production.
    if (url.pathname.startsWith('/api/game/npc/')) {
      if (String(env.PPA_GODOT_NPC_READ_ENABLED || '') !== '1' ||
          String(env.PPA_GODOT_STATE_READ_ENABLED || '') !== '1') {
        return apiError('Game API route not found', 404, 'NOT_FOUND');
      }
      if (request.method !== 'GET') return apiError('GET required', 405, 'METHOD_NOT_ALLOWED');
      const service = url.pathname.slice('/api/game/npc/'.length);
      if (!NATIVE_NPC_SERVICES.includes(service)) return apiError('Unknown NPC service', 404, 'UNKNOWN_NPC_SERVICE');
      const auth = await phoenixGameSessionFromRequest(request, env, true);
      if (auth.gameId !== 'phoenix-pix-arena') return apiError('Wrong game session', 403, 'GAME_SESSION_WRONG_GAME');
      const row = await phoenixAccountRow(env, auth.accountId);
      if (!row) return apiError('Phoenix account missing', 404, 'ACCOUNT_NOT_FOUND');
      const telegramId = row.telegram_id == null ? '' : String(row.telegram_id).trim();
      if (!telegramId) return apiError('Telegram character not linked', 409, 'TELEGRAM_NOT_LINKED');
      const saved = await loadSave(env, telegramId);
      if (!saved.ok) return json(saved, Number(saved.status) || 500);
      if (saved.bootstrapFromProfile || !saved.state || !Number.isInteger(saved.version) || saved.version < 1) {
        return apiError('Existing PPA save not ready', 409, 'PPA_CHARACTER_SAVE_NOT_READY');
      }
      const data = projectNativeNpcReadOnly(service, saved.state);
      if (!data) return apiError('NPC view not available', 400, 'NPC_VIEW_UNAVAILABLE');
      return json({
        ok: true, readOnly: true, gameId: auth.gameId,
        service, version: saved.version, updatedAt: saved.updatedAt || null,
        data
      });
    }

    // Godot connects to the SAME ppa-global-v1 realtime Durable Object.
    // Gate defaults OFF until native movement/combat protocol passes tests.
    if (url.pathname === '/api/game/realtime/ticket') {
      if (String(env.PPA_GODOT_REALTIME_ENABLED || '') !== '1') {
        return apiError('Game API route not found', 404, 'NOT_FOUND');
      }
      if (request.method !== 'POST') return apiError('POST required', 405, 'METHOD_NOT_ALLOWED');
      const auth = await phoenixGameSessionFromRequest(request, env, true);
      if (auth.gameId !== 'phoenix-pix-arena') {
        return apiError('Wrong game session', 403, 'GAME_SESSION_WRONG_GAME');
      }
      const accountRow = await phoenixAccountRow(env, auth.accountId);
      if (!accountRow) return apiError('Phoenix account missing', 404, 'ACCOUNT_NOT_FOUND');
      const telegramId = accountRow.telegram_id == null ? '' : String(accountRow.telegram_id).trim();
      if (!telegramId) {
        return apiError('Link your Telegram account to access the existing realtime character.', 409, 'TELEGRAM_NOT_LINKED');
      }
      return json(await nativeRealtimeTicketForLinkedTelegram(env, telegramId));
    }

    return apiError('Game API route not found', 404, 'NOT_FOUND');
  } catch (err) {
    const status = Number(err && err.status) || 500;
    const code = (err && err.code) || (status >= 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR');
    const message = status >= 500 && code === 'SERVER_ERROR' ? 'Phoenix game auth error' : String((err && err.message) || 'Phoenix game auth error');
    console.error('Phoenix Game auth:', code, err);
    return apiError(message, status, code);
  }
}

async function handlePhoenixLauncherApi(request, env, url) {
  if (!url.pathname.startsWith('/api/launcher/')) return null;
  await ensurePhoenixAuthSchema(env);
  try {
    let body = {};
    if (request.method !== 'GET') {
      try { body = await request.json(); } catch (_) { body = {}; }
    }

    if (url.pathname === '/api/launcher/auth/telegram/start') {
      if (request.method !== 'POST') return apiError('POST required', 405, 'METHOD_NOT_ALLOWED');
      return phoenixCreateTelegramFlow(request, env, body);
    }

    if (url.pathname === '/api/launcher/game-ticket') {
      if (request.method !== 'POST') return apiError('POST required', 405, 'METHOD_NOT_ALLOWED');
      const auth = await phoenixSessionFromRequest(request, env, true);
      const gameId = String(body.gameId || '').trim();
      if (gameId !== 'phoenix-pix-arena') return apiError('Unknown Phoenix game', 404, 'GAME_NOT_FOUND');
      const ticket = await phoenixCreateGameTicket(env, auth.accountId, gameId);
      return json({ ok: true, gameId, ticket });
    }

    if (url.pathname === '/api/launcher/auth/telegram/native') {
      if (request.method !== 'POST') return apiError('POST required', 405, 'METHOD_NOT_ALLOWED');
      const idToken = String(body.idToken || '').trim();
      if (!idToken) return apiError('Telegram ID token missing', 400, 'ID_TOKEN_MISSING');

      let preferredAccountId = '';
      try {
        const currentSession = await phoenixSessionFromRequest(request, env, false);
        if (currentSession) preferredAccountId = currentSession.accountId;
      } catch (_) {}

      const claims = await phoenixValidateTelegramIdToken(idToken, env, '');
      const tgUser = {
        id: claims.id != null ? claims.id : claims.sub,
        username: claims.preferred_username || claims.username || '',
        first_name: claims.given_name || claims.first_name || claims.name || '',
        last_name: claims.family_name || claims.last_name || ''
      };
      const linked = await phoenixEnsureAccountForTelegram(env, tgUser, preferredAccountId);
      const session = await phoenixCreateSession(env, linked.accountId, 'telegram-native');
      return json({
        ok: true,
        session,
        account: phoenixAccountPayload(await phoenixAccountRow(env, linked.accountId))
      });
    }

    if (url.pathname === '/api/launcher/auth/exchange') {
      if (request.method !== 'POST') return apiError('POST required', 405, 'METHOD_NOT_ALLOWED');
      const code = String(body.code || '').trim();
      const state = String(body.state || '').trim();
      const verifier = String(body.codeVerifier || '').trim();
      if (!code || !phoenixValidPkce(state) || !phoenixValidPkce(verifier)) return apiError('Invalid exchange request', 400, 'INVALID_EXCHANGE');
      const codeHash = await phoenixSha256Hex(code);
      const row = await env.DB.prepare('SELECT * FROM phoenix_exchange_codes WHERE code_hash=?1 LIMIT 1').bind(codeHash).first();
      if (!row || Number(row.expires_at) <= Date.now() || Number(row.used_at) > 0 || String(row.state) !== state) return apiError('Login code expired or invalid', 401, 'EXCHANGE_CODE_INVALID');
      const expectedChallenge = phoenixBase64Url(await phoenixSha256Bytes(verifier));
      if (expectedChallenge !== String(row.app_challenge || '')) return apiError('PKCE verification failed', 401, 'PKCE_FAILED');
      await env.DB.prepare('UPDATE phoenix_exchange_codes SET used_at=?1 WHERE code_hash=?2').bind(Date.now(), codeHash).run();
      const session = await phoenixCreateSession(env, String(row.account_id), String(row.provider || 'telegram'));
      return json({ ok: true, session, account: phoenixAccountPayload(await phoenixAccountRow(env, String(row.account_id))) });
    }

    if (url.pathname === '/api/launcher/email/register') {
      if (request.method !== 'POST') return apiError('POST required', 405, 'METHOD_NOT_ALLOWED');
      const email = phoenixNormalizeEmail(body.email);
      const password = String(body.password || '');
      if (!phoenixValidEmail(email)) return apiError('Введите корректный Email', 400, 'INVALID_EMAIL');
      if (!phoenixValidPassword(password)) return apiError('Пароль должен содержать минимум 8 символов', 400, 'WEAK_PASSWORD');
      const existing = await env.DB.prepare('SELECT account_id FROM phoenix_accounts WHERE email=?1 LIMIT 1').bind(email).first();
      if (existing) return apiError('Этот Email уже используется', 409, 'EMAIL_EXISTS');

      const now = Date.now();
      const accountId = 'px_' + phoenixRandomToken(18);
      const saltBytes = new Uint8Array(16); crypto.getRandomValues(saltBytes);
      const salt = hex(saltBytes);
      const passwordHash = await phoenixPasswordHash(password, salt);
      await env.DB.prepare('INSERT INTO phoenix_accounts (account_id,email,password_salt,password_hash,email_verified,created_at,updated_at,last_login_at) VALUES (?1,?2,?3,?4,0,?5,?5,?5)').bind(accountId, email, salt, passwordHash, now).run();
      const session = await phoenixCreateSession(env, accountId, 'email');
      return json({ ok: true, session, account: phoenixAccountPayload(await phoenixAccountRow(env, accountId)), needsTelegramLink: true });
    }

    if (url.pathname === '/api/launcher/email/login') {
      if (request.method !== 'POST') return apiError('POST required', 405, 'METHOD_NOT_ALLOWED');
      const email = phoenixNormalizeEmail(body.email);
      const password = String(body.password || '');
      const row = await env.DB.prepare('SELECT * FROM phoenix_accounts WHERE email=?1 LIMIT 1').bind(email).first();
      if (!row || !row.password_salt || !row.password_hash || !phoenixValidPassword(password)) return apiError('Неверный Email или пароль', 401, 'EMAIL_LOGIN_FAILED');
      const candidate = await phoenixPasswordHash(password, row.password_salt);
      if (!timingSafeEqualHex(candidate, row.password_hash)) return apiError('Неверный Email или пароль', 401, 'EMAIL_LOGIN_FAILED');
      const session = await phoenixCreateSession(env, String(row.account_id), 'email');
      const account = phoenixAccountPayload(await phoenixAccountRow(env, String(row.account_id)));
      return json({ ok: true, session, account, needsTelegramLink: !account.telegramId });
    }

    if (url.pathname === '/api/launcher/email/bind') {
      if (request.method !== 'POST') return apiError('POST required', 405, 'METHOD_NOT_ALLOWED');
      const auth = await phoenixSessionFromRequest(request, env, true);
      const email = phoenixNormalizeEmail(body.email);
      const password = String(body.password || '');
      if (!phoenixValidEmail(email)) return apiError('Введите корректный Email', 400, 'INVALID_EMAIL');
      if (!phoenixValidPassword(password)) return apiError('Пароль должен содержать минимум 8 символов', 400, 'WEAK_PASSWORD');
      const owner = await env.DB.prepare('SELECT account_id FROM phoenix_accounts WHERE email=?1 LIMIT 1').bind(email).first();
      if (owner && String(owner.account_id) !== auth.accountId) return apiError('Этот Email уже используется', 409, 'EMAIL_EXISTS');
      const saltBytes = new Uint8Array(16); crypto.getRandomValues(saltBytes);
      const salt = hex(saltBytes);
      const passwordHash = await phoenixPasswordHash(password, salt);
      await env.DB.prepare('UPDATE phoenix_accounts SET email=?1,password_salt=?2,password_hash=?3,updated_at=?4 WHERE account_id=?5').bind(email, salt, passwordHash, Date.now(), auth.accountId).run();
      return json({ ok: true, account: phoenixAccountPayload(await phoenixAccountRow(env, auth.accountId)) });
    }

    if (url.pathname === '/api/launcher/me') {
      if (request.method !== 'GET' && request.method !== 'POST') return apiError('GET or POST required', 405, 'METHOD_NOT_ALLOWED');
      const auth = await phoenixSessionFromRequest(request, env, true);
      return json({ ok: true, account: phoenixAccountPayload(await phoenixAccountRow(env, auth.accountId)) });
    }

    if (url.pathname === '/api/launcher/logout') {
      if (request.method !== 'POST') return apiError('POST required', 405, 'METHOD_NOT_ALLOWED');
      const auth = await phoenixSessionFromRequest(request, env, true);
      await env.DB.prepare('DELETE FROM phoenix_sessions WHERE token_hash=?1').bind(auth.tokenHash).run();
      return json({ ok: true });
    }

    return apiError('Launcher API route not found', 404, 'NOT_FOUND');
  } catch (err) {
    const status = Number(err && err.status) || 500;
    const code = (err && err.code) || (status >= 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR');
    const message = status >= 500 && code === 'SERVER_ERROR' ? 'Phoenix auth error' : String((err && err.message) || 'Phoenix auth error');
    console.error('Phoenix Launcher auth:', code, err);
    return apiError(message, status, code);
  }
}


async function handleApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/api/health') {
    return json({ ok: true, gateway: true, database: !!env.DB, telegramSecret: !!env.BOT_TOKEN });
  }

  const launcherApi = await handlePhoenixLauncherApi(request, env, url);
  if (launcherApi) return launcherApi;

  const gameApi = await handlePhoenixGameApi(request, env, url);
  if (gameApi) return gameApi;

  if (request.method !== 'POST') return apiError('POST required', 405, 'METHOD_NOT_ALLOWED');

  try {
    const { body, auth, player } = await authenticated(request, env);
    const telegramId = String(auth.user.id);

    if (url.pathname === '/api/auth') {
      return json({ ok: true, user: auth.user, profile: profileFromRow(player) });
    }
    if (url.pathname === '/api/profile/load') {
      return json({ ok: true, profile: profileFromRow(await env.DB.prepare('SELECT * FROM players WHERE telegram_id=?1').bind(telegramId).first()) });
    }
    if (url.pathname === '/api/character/register') {
      const result = await registerCharacter(env, telegramId, body.nickname, body.classKey || body.className || '');
      return json(result, result.ok ? 200 : (result.status || 400));
    }
    if (url.pathname === '/api/save/load') {
      return json(await loadSave(env, telegramId));
    }
    if (url.pathname === '/api/save') {
      const result = await saveGameState(env, telegramId, body.state, body.version);
      return json(result, result.ok ? 200 : (result.status || 400));
    }
    if (url.pathname === '/api/merchant/state' || url.pathname === '/api/merchant/action') {
      if (String(env.PPA_MERCHANT_READ_ENABLED || '') !== '1') return apiError('API route not found', 404, 'NOT_FOUND');
      const operation = url.pathname.endsWith('/state') ? 'state' : 'action';
      const result = await sharedMerchantOperation(env, telegramId, operation, body,
        {load: id => loadSave(env, id), save: (id, state, version) => saveGameState(env, id, state, version)});
      return json(result.data, result.status);
    }
    if (url.pathname === '/api/profile/sync-nickname') {
      const result = await syncNicknameFromSave(env, telegramId, body.nickname);
      return json(result, result.ok ? 200 : (result.status || 400));
    }
    if (url.pathname === '/api/profile/rename') {
      const result = await renameWithCard(env, telegramId, body.nickname, body.requestId);
      return json(result, result.ok ? 200 : (result.status || 400));
    }
    if (url.pathname === '/api/account/delete') {
      const result = await deleteOwnAccount(env, telegramId, body.confirm);
      return json(result, result.ok ? 200 : (result.status || 400));
    }

    return apiError('API route not found', 404, 'NOT_FOUND');
  } catch (err) {
    const status = Number(err && err.status) || 500;
    const code = (err && err.code) || (status >= 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR');
    const message = status >= 500 && code === 'SERVER_ERROR' ? 'Gateway error' : String((err && err.message) || 'Gateway error');
    console.error('PPA gateway:', code, err);
    return apiError(message, status, code);
  }
}

async function assetResponse(request, env) {
  const url = new URL(request.url);
  const res = await env.ASSETS.fetch(request);

  // Telegram WebView can keep an old index.html and therefore keep loading
  // old ?v= gateway scripts after a new deploy. Never cache the shell or the
  // realtime/game bridge JS while multiplayer is under active development.
  const noStoreHtml = url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('.html');
  const noStoreBridge = url.pathname.startsWith('/game/') && url.pathname.endsWith('.js');
  const noStoreApprovedArt = url.pathname === '/assets/legendary-gear-atlas.webp' || url.pathname.startsWith('/assets/legendary/');
  if (!noStoreHtml && !noStoreBridge && !noStoreApprovedArt) return res;

  const headers = new Headers(res.headers);
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.set('x-ppa-fresh-assets', '1');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/launcher/auth/telegram')) {
      const launcherLogin = await handlePhoenixTelegramBrowser(request, env, url);
      if (launcherLogin) return launcherLogin;
    }
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return assetResponse(request, env);
  },
};
