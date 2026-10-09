PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  telegram_id TEXT PRIMARY KEY,
  realtime_pid TEXT UNIQUE,
  telegram_username TEXT NOT NULL DEFAULT '',
  telegram_first_name TEXT NOT NULL DEFAULT '',
  telegram_last_name TEXT NOT NULL DEFAULT '',
  nickname TEXT,
  nickname_key TEXT UNIQUE,
  class_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_auth_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_nickname_key
  ON players(nickname_key)
  WHERE nickname_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS saves (
  telegram_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  state_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (telegram_id) REFERENCES players(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rename_requests (
  request_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (request_id, telegram_id),
  FOREIGN KEY (telegram_id) REFERENCES players(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rename_requests_created_at
  ON rename_requests(created_at);


-- Rolling cloud-save recovery window. Runtime also creates this table lazily
-- so existing D1 databases gain protection without a destructive migration.
CREATE TABLE IF NOT EXISTS save_history (
  telegram_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER NOT NULL,
  PRIMARY KEY (telegram_id, version)
);
CREATE INDEX IF NOT EXISTS idx_save_history_user_archived
  ON save_history(telegram_id, archived_at DESC);


-- Phoenix Launcher account layer. Existing PPA saves remain keyed by telegram_id.
CREATE TABLE IF NOT EXISTS phoenix_accounts (
  account_id TEXT PRIMARY KEY,
  telegram_id TEXT UNIQUE,
  email TEXT UNIQUE,
  password_salt TEXT,
  password_hash TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL DEFAULT 0
);

-- Non-destructive owner registry: stable player identity independent of login
-- method, pointing to exactly one EXISTING legacy PPA save for Telegram heroes.
-- No separate save copy and no fabricated Telegram ID for Email accounts.
CREATE TABLE IF NOT EXISTS phoenix_character_identity (
  account_id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL UNIQUE,
  legacy_telegram_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES phoenix_accounts(account_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS phoenix_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES phoenix_accounts(account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_phoenix_sessions_account
  ON phoenix_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_phoenix_sessions_expiry
  ON phoenix_sessions(expires_at);

CREATE TABLE IF NOT EXISTS phoenix_auth_flows (
  state TEXT PRIMARY KEY,
  app_challenge TEXT NOT NULL,
  oauth_verifier TEXT,
  nonce TEXT,
  link_account_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phoenix_flows_expiry
  ON phoenix_auth_flows(expires_at);

CREATE TABLE IF NOT EXISTS phoenix_exchange_codes (
  code_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  state TEXT NOT NULL,
  app_challenge TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES phoenix_accounts(account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_phoenix_codes_expiry
  ON phoenix_exchange_codes(expires_at);
