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
  if (nickname && !String(out.playerName || '').trim()) out.playerName = nickname;
  if (nickname && !String(out.nickname || '').trim()) out.nickname = nickname;
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

async function upsertBoundInitialSave(env, telegramId, profile, nickname, classKey) {
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
      class_key=CASE WHEN class_key IS NULL OR class_key='' THEN ?3 ELSE class_key END,
      updated_at=?4,
      last_auth_at=?4
    WHERE telegram_id=?5
  `).bind(nickname, key, normalizeClass(classKey), now, telegramId).run();

  const profile = profileFromRow(await env.DB.prepare('SELECT * FROM players WHERE telegram_id=?1').bind(telegramId).first());
  const save = await upsertBoundInitialSave(env, telegramId, profile, nickname, classKey);
  return { ok: true, profile, save, telegramId: String(telegramId) };
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
  state = { ...state };

  // Character level is monotonic in PPA. A stale/partially restored client is
  // never allowed to lower it during an ordinary save.
  for (const key of ['lvl', 'level']) {
    const oldLevel = Number(previous[key]);
    const nextLevel = Number(state[key]);
    if (Number.isFinite(oldLevel) && oldLevel >= 1 &&
        (!Number.isFinite(nextLevel) || nextLevel < oldLevel)) {
      state[key] = oldLevel;
    }
  }

  const profile = profileFromRow(await env.DB.prepare(
    'SELECT * FROM players WHERE telegram_id=?1'
  ).bind(telegramId).first());
  state = applyProfileToSaveState(profile, state);

  const nickname = String(state.playerName || '').trim();
  if (nickname && (!profile || !profile.nickname || nickKey(profile.nickname) !== nickKey(nickname))) {
    const registered = await registerCharacter(env, telegramId, nickname, state.cls || state.classKey || '');
    if (!registered.ok) return registered;
  }

  const raw = JSON.stringify(state);
  if (new TextEncoder().encode(raw).byteLength > 1_800_000) {
    return { ok: false, status: 413, code: 'SAVE_TOO_LARGE', message: 'Сохранение слишком большое.' };
  }

  const now = Date.now();
  let version;

  if (existing) {
    version = currentVersion + 1;
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

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/api/health') {
    return json({ ok: true, gateway: true, database: !!env.DB, telegramSecret: !!env.BOT_TOKEN });
  }

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
    if (url.pathname === '/api/profile/sync-nickname') {
      const result = await syncNicknameFromSave(env, telegramId, body.nickname);
      return json(result, result.ok ? 200 : (result.status || 400));
    }
    if (url.pathname === '/api/profile/rename') {
      const result = await renameWithCard(env, telegramId, body.nickname, body.requestId);
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
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return assetResponse(request, env);
  },
};
