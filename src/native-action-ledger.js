// Persist acknowledgements for native commands. A lost HTTP response must
// never execute the same command twice, including after Worker restart.
const encoder = new TextEncoder();
const schema = `CREATE TABLE IF NOT EXISTS ppa_native_commands (
  owner_id TEXT NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL,
  command_json TEXT NOT NULL,
  status TEXT NOT NULL, http_status INTEGER, response_json TEXT,
  created_at INTEGER NOT NULL, finished_at INTEGER,
  PRIMARY KEY(owner_id,request_id)
)`;
const pendingIndex = `CREATE UNIQUE INDEX IF NOT EXISTS ppa_native_one_pending
  ON ppa_native_commands(owner_id) WHERE status='pending'`;

function error(code, message, status = 409) {
  return {status, data:{ok:false, code, message}};
}

export async function executeNativeCommandOnce(env, ownerId, requestId, command, execute) {
  if (!/^[a-f0-9]{32}$/.test(String(requestId || '')))
    return error('INVALID_REQUEST_ID', 'Нужен ID действия.', 400);
  const serialized = JSON.stringify(command);
  if (encoder.encode(serialized).length > 16384)
    return error('COMMAND_TOO_LARGE', 'Слишком большой запрос.', 413);
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(serialized));
  const digest = [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare(schema).run();
  await env.DB.prepare(pendingIndex).run();
  const read = () => env.DB.prepare(`SELECT digest,status,http_status,response_json
    FROM ppa_native_commands WHERE owner_id=?1 AND request_id=?2`)
    .bind(ownerId, requestId).first();
  const cached = row => {
    if (row.digest !== digest)
      return error('REQUEST_ID_REUSED', 'ID уже принадлежит другому действию.');
    if (row.status !== 'done')
      return error('COMMAND_PENDING', 'Действие ещё не подтверждено. Обнови состояние.');
    return {status:Number(row.http_status), data:JSON.parse(row.response_json)};
  };
  const existing = await read();
  if (existing) return cached(existing);
  // ON CONFLICT catches both a duplicate request and a different command
  // while this owner's first command is unresolved. No timed lock stealing:
  // an interrupted command may already have changed canonical game data.
  const claim = await env.DB.prepare(`INSERT OR IGNORE INTO ppa_native_commands
    (owner_id,request_id,digest,command_json,status,created_at) VALUES(?1,?2,?3,?4,'pending',?5)`)
    .bind(ownerId, requestId, digest, serialized, Date.now()).run();
  if (Number(claim.meta?.changes) !== 1) {
    const duplicate = await read();
    return duplicate ? cached(duplicate)
      : error('OWNER_COMMAND_PENDING', 'Дождись подтверждения предыдущего действия.');
  }
  let result;
  try {
    result = await execute();
  } catch (_) {
    // Preserve pending: canonical handlers may have completed one write before
    // an interruption. Never blindly retry a partially executed transaction.
    return error('COMMAND_UNCONFIRMED', 'Не удалось подтвердить действие. Обнови состояние.', 503);
  }
  await env.DB.prepare(`UPDATE ppa_native_commands
    SET status='done',http_status=?1,response_json=?2,finished_at=?3
    WHERE owner_id=?4 AND request_id=?5 AND digest=?6 AND status='pending'`)
    .bind(result.status, JSON.stringify(result.data), Date.now(), ownerId, requestId, digest).run();
  return result;
}
