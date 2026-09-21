function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function adminIds(env) {
  return new Set(String(env.WITHDRAW_ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean));
}
function isAdmin(env, id) { return adminIds(env).has(String(id || '')); }

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 database is not connected');
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS withdraw_requests (
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
  )`).run();
  try { await env.DB.prepare('ALTER TABLE withdraw_requests ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0').run(); } catch (_) {}
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_withdraw_requests_status_created ON withdraw_requests(status, created_at)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_withdraw_requests_user ON withdraw_requests(telegram_id, created_at)').run();
}

async function tg(env, method, payload) {
  const token = String(env.WITHDRAW_BOT_TOKEN || '').trim();
  if (!token) throw new Error('WITHDRAW_BOT_TOKEN is not configured');
  const r = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || d.ok !== true) throw new Error('Telegram API ' + method + ' failed');
  return d.result;
}

function fmtAmount(v) {
  const n = Number(v) || 0;
  return String(Math.round((n + Number.EPSILON) * 1e9) / 1e9).replace('.', ',');
}
function fmtTime(ms) {
  try { return new Date(Number(ms) || Date.now()).toISOString().replace('T', ' ').replace('.000Z', ' UTC'); }
  catch (_) { return ''; }
}
function statusText(status) {
  if (status === 'pending') return '🟡 ОЖИДАЕТ';
  if (status === 'approved') return '🔵 ОДОБРЕНА · ЖДЁТ ВЫПЛАТЫ';
  if (status === 'paid') return '✅ ВЫПЛАЧЕНО';
  if (status === 'rejected') return '❌ ОТКЛОНЕНА';
  return String(status || '');
}
function requestText(r) {
  return [
    (Number(r.is_test) === 1 ? '🧪 PPA · ТЕСТОВАЯ ЗАЯВКА НА ВЫВОД' : '💸 PPA · ЗАЯВКА НА ВЫВОД'),'',
    'Статус: ' + statusText(r.status),
    'Игрок: ' + (r.nickname || ('ID ' + r.telegram_id)),
    'Telegram ID: ' + r.telegram_id,
    'Запрошено: ' + fmtAmount(r.amount_gram) + ' Gram',
    'Комиссия 10%: ' + fmtAmount(r.fee_gram) + ' Gram',
    'К выплате: ' + fmtAmount(r.payout_gram) + ' TON',
    'Кошелёк: ' + r.wallet_address,
    'Создана: ' + fmtTime(r.created_at),'',
    'ID: ' + r.id
  ].join('\n');
}
function keyboardFor(r) {
  if (r.status === 'pending') return { inline_keyboard: [[
    { text: '✅ Одобрить', callback_data: 'wd:approve:' + r.id },
    { text: '❌ Отклонить', callback_data: 'wd:reject:' + r.id }
  ]] };
  if (r.status === 'approved') return { inline_keyboard: [[
    { text: '💸 Выплачено', callback_data: 'wd:paid:' + r.id },
    { text: '↩️ Отклонить + возврат', callback_data: 'wd:reject:' + r.id }
  ]] };
}
async function sendCard(env, chatId, r) {
  const payload = { chat_id: chatId, text: requestText(r) };
  const kb = keyboardFor(r); if (kb) payload.reply_markup = kb;
  return tg(env, 'sendMessage', payload);
}
async function listRequests(env, chatId, status) {
  const rows = await env.DB.prepare('SELECT * FROM withdraw_requests WHERE status=?1 ORDER BY created_at ASC LIMIT 20').bind(status).all();
  const items = rows.results || [];
  if (!items.length) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: status === 'pending' ? '✅ Новых заявок на вывод нет.' : '✅ Одобренных заявок, ожидающих выплаты, нет.' });
    return;
  }
  await tg(env, 'sendMessage', { chat_id: chatId, text: (status === 'pending' ? '🟡 Заявки на рассмотрении: ' : '🔵 Ждут выплаты: ') + items.length });
  for (const r of items) await sendCard(env, chatId, r);
}

async function refundRequest(env, requestId, reviewerId) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const req = await env.DB.prepare('SELECT * FROM withdraw_requests WHERE id=?1').bind(requestId).first();
    if (!req) return { ok: false, message: 'Заявка не найдена.' };
    if (req.status === 'rejected') return { ok: true, row: req, message: 'Заявка уже отклонена.' };
    if (req.status === 'paid') return { ok: false, message: 'Выплаченный вывод нельзя отклонить.' };
    if (req.status !== 'pending' && req.status !== 'approved') return { ok: false, message: 'Этот статус нельзя отклонить.' };

    if (Number(req.is_test) === 1) {
      const now = Date.now();
      await env.DB.prepare("UPDATE withdraw_requests SET status='rejected',reviewer_id=?1,reviewed_at=?2 WHERE id=?3 AND is_test=1 AND status IN ('pending','approved')")
        .bind(String(reviewerId), now, requestId).run();
      const after = await env.DB.prepare('SELECT * FROM withdraw_requests WHERE id=?1').bind(requestId).first();
      return { ok: true, row: after, message: 'Тестовая заявка отклонена. Игровой баланс не менялся.' };
    }

    const save = await env.DB.prepare('SELECT version,state_json FROM saves WHERE telegram_id=?1').bind(req.telegram_id).first();
    if (!save) return { ok: false, message: 'Сейв игрока не найден — возврат не выполнен.' };
    let state = {}; try { state = JSON.parse(save.state_json || '{}'); } catch (_) {}
    state.gram = Math.round(((Math.max(0, Number(state.gram) || 0) + Number(req.amount_gram || 0)) + Number.EPSILON) * 1e9) / 1e9;
    const raw = JSON.stringify(state), now = Date.now(), nextVersion = (Number(save.version) || 0) + 1;
    const updateSave = env.DB.prepare('UPDATE saves SET version=?1,state_json=?2,updated_at=?3 WHERE telegram_id=?4 AND version=?5')
      .bind(nextVersion, raw, now, req.telegram_id, Number(save.version) || 0);
    const reject = env.DB.prepare(`UPDATE withdraw_requests SET status='rejected',reviewer_id=?1,reviewed_at=?2
      WHERE id=?3 AND status IN ('pending','approved')
        AND EXISTS(SELECT 1 FROM saves WHERE telegram_id=?4 AND version=?5 AND updated_at=?2 AND state_json=?6)`)
      .bind(String(reviewerId), now, requestId, req.telegram_id, nextVersion, raw);
    await env.DB.batch([updateSave, reject]);
    const after = await env.DB.prepare('SELECT * FROM withdraw_requests WHERE id=?1').bind(requestId).first();
    if (after && after.status === 'rejected') return { ok: true, row: after, message: 'Отклонено. Gram возвращены игроку.' };
  }
  return { ok: false, message: 'Баланс игрока менялся одновременно. Нажми отклонить ещё раз.' };
}

async function changeStatus(env, requestId, action, reviewerId) {
  if (action === 'reject') return refundRequest(env, requestId, reviewerId);
  const row = await env.DB.prepare('SELECT * FROM withdraw_requests WHERE id=?1').bind(requestId).first();
  if (!row) return { ok: false, message: 'Заявка не найдена.' };
  const now = Date.now();
  if (action === 'approve') {
    if (row.status === 'approved') return { ok: true, row, message: 'Заявка уже одобрена.' };
    if (row.status !== 'pending') return { ok: false, message: 'Одобрить можно только ожидающую заявку.' };
    await env.DB.prepare("UPDATE withdraw_requests SET status='approved',reviewer_id=?1,reviewed_at=?2 WHERE id=?3 AND status='pending'")
      .bind(String(reviewerId), now, requestId).run();
  } else if (action === 'paid') {
    if (row.status === 'paid') return { ok: true, row, message: 'Уже отмечено как выплаченное.' };
    if (row.status !== 'approved') return { ok: false, message: 'Сначала одобри заявку.' };
    await env.DB.prepare("UPDATE withdraw_requests SET status='paid',reviewer_id=?1,reviewed_at=?2,paid_at=?2 WHERE id=?3 AND status='approved'")
      .bind(String(reviewerId), now, requestId).run();
  } else return { ok: false, message: 'Неизвестное действие.' };
  const after = await env.DB.prepare('SELECT * FROM withdraw_requests WHERE id=?1').bind(requestId).first();
  return { ok: true, row: after, message: action === 'approve' ? 'Заявка одобрена. Отправь TON вручную и нажми «Выплачено».' : 'Отмечено как выплаченное.' };
}

async function handleMessage(env, message) {
  const chatId = message && message.chat && message.chat.id;
  const fromId = message && message.from && message.from.id;
  if (!chatId || !fromId) return;
  const text = String(message.text || '').trim();
  if (!isAdmin(env, fromId)) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: '⛔ Доступ закрыт.\n\nТвой Telegram ID: ' + fromId + '\nДобавь его в Cloudflare secret WITHDRAW_ADMIN_IDS.' });
    return;
  }
  if (/^\/pending(?:@\w+)?$/i.test(text)) return listRequests(env, chatId, 'pending');
  if (/^\/approved(?:@\w+)?$/i.test(text)) return listRequests(env, chatId, 'approved');
  if (/^\/testwithdraw(?:@\w+)?$/i.test(text)) {
    const id = 'wd_' + crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO withdraw_requests(id,telegram_id,nickname,wallet_address,amount_gram,fee_gram,payout_gram,status,reviewer_id,created_at,reviewed_at,paid_at,is_test)
      VALUES(?1,?2,'TEST ADMIN','TEST_ONLY_NO_REAL_PAYOUT',15,1.5,13.5,'pending','',?3,0,0,1)`)
      .bind(id, String(fromId), now).run();
    const row = await env.DB.prepare('SELECT * FROM withdraw_requests WHERE id=?1').bind(id).first();
    await sendCard(env, chatId, row);
    return;
  }
  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM withdraw_requests WHERE status='pending'").first();
  const approved = await env.DB.prepare("SELECT COUNT(*) AS n FROM withdraw_requests WHERE status='approved'").first();
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: '🤖 PPA Withdraw Admin\n\nОжидают решения: ' + (Number(pending && pending.n) || 0) +
      '\nОдобрены, ждут выплаты: ' + (Number(approved && approved.n) || 0) +
      '\n\n/pending — новые заявки\n/approved — одобренные заявки\n/testwithdraw — тестовая заявка 15 Gram без списания'
  });
}

async function handleCallback(env, query) {
  const fromId = query && query.from && query.from.id, data = String(query && query.data || '');
  if (!fromId || !query.id) return;
  if (!isAdmin(env, fromId)) {
    await tg(env, 'answerCallbackQuery', { callback_query_id: query.id, text: 'Нет доступа', show_alert: true }); return;
  }
  const m = data.match(/^wd:(approve|reject|paid):(wd_[0-9a-f-]+)$/i);
  if (!m) { await tg(env, 'answerCallbackQuery', { callback_query_id: query.id, text: 'Неизвестная кнопка', show_alert: true }); return; }
  const result = await changeStatus(env, m[2], m[1].toLowerCase(), fromId);
  await tg(env, 'answerCallbackQuery', { callback_query_id: query.id, text: result.message || (result.ok ? 'Готово' : 'Ошибка'), show_alert: !result.ok });
  if (result.row && query.message && query.message.chat) {
    const payload = { chat_id: query.message.chat.id, message_id: query.message.message_id, text: requestText(result.row) };
    const kb = keyboardFor(result.row); if (kb) payload.reply_markup = kb;
    await tg(env, 'editMessageText', payload).catch(() => {});
  }
}

export async function handleWithdrawBotRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/api/withdraw-bot/setup') {
    if (request.method !== 'GET' && request.method !== 'POST') return json({ ok: false, message: 'GET or POST required' }, 405);
    const token = String(env.WITHDRAW_BOT_TOKEN || '').trim();
    const secret = String(env.WITHDRAW_BOT_WEBHOOK_SECRET || '').trim();
    if (!token) return json({ ok: false, message: 'WITHDRAW_BOT_TOKEN is not configured' }, 503);
    if (!secret) return json({ ok: false, message: 'WITHDRAW_BOT_WEBHOOK_SECRET is not configured' }, 503);
    try {
      const webhookUrl = url.origin + '/api/withdraw-bot/webhook';
      const set = await tg(env, 'setWebhook', {
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false
      });
      await tg(env, 'setMyCommands', {
        commands: [
          { command: 'start', description: 'Статус бота и твой доступ' },
          { command: 'pending', description: 'Новые заявки на вывод' },
          { command: 'approved', description: 'Одобренные заявки к выплате' },
          { command: 'testwithdraw', description: 'Тестовая заявка 15 Gram без списания' }
        ]
      });
      const me = await tg(env, 'getMe', {});
      return json({
        ok: true,
        webhook: webhookUrl,
        bot: me && me.username ? '@' + me.username : '',
        webhookSet: !!set,
        next: 'Send /start to the bot. If access is closed, copy the Telegram ID it shows into WITHDRAW_ADMIN_IDS.'
      });
    } catch (err) {
      console.error('PPA withdraw bot setup:', err);
      return json({ ok: false, message: 'Bot setup failed: ' + String(err && err.message || err) }, 502);
    }
  }

  if (url.pathname !== '/api/withdraw-bot/webhook') return null;
  if (request.method !== 'POST') return json({ ok: false, message: 'POST required' }, 405);
  const expected = String(env.WITHDRAW_BOT_WEBHOOK_SECRET || '').trim();
  if (!expected) return json({ ok: false, message: 'WITHDRAW_BOT_WEBHOOK_SECRET is not configured' }, 503);
  const received = String(request.headers.get('x-telegram-bot-api-secret-token') || '');
  if (received !== expected) return json({ ok: false, message: 'Forbidden' }, 403);
  try {
    await ensureSchema(env);
    const update = await request.json();
    if (update && update.message) await handleMessage(env, update.message);
    if (update && update.callback_query) await handleCallback(env, update.callback_query);
    return json({ ok: true });
  } catch (err) {
    console.error('PPA withdraw bot:', err);
    return json({ ok: false, message: 'Bot webhook error' }, 500);
  }
}
