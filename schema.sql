PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  telegram_id TEXT PRIMARY KEY,
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
