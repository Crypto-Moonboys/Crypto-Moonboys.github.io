-- Migration 014: Shared arcade progression sync tables
-- Adds authoritative bridge tables for syncing pending local arcade runs
-- into Telegram-linked community XP with anti-farm scaffolding.

CREATE TABLE IF NOT EXISTS arcade_progression_state (
  telegram_id TEXT PRIMARY KEY,
  arcade_xp_total INTEGER NOT NULL DEFAULT 0,
  arcade_daily_xp INTEGER NOT NULL DEFAULT 0,
  arcade_daily_key TEXT NOT NULL DEFAULT '',
  arcade_restriction_level INTEGER NOT NULL DEFAULT 0,
  restricted_until DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS arcade_progression_events (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  client_run_id TEXT NOT NULL,
  game TEXT NOT NULL,
  raw_score INTEGER NOT NULL DEFAULT 0,
  local_meta_points INTEGER NOT NULL DEFAULT 0,
  normalized_points INTEGER NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'accepted',
  reason TEXT,
  processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id, client_run_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_arcade_progression_events_user_time
  ON arcade_progression_events(telegram_id, processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_arcade_progression_events_user_game_time
  ON arcade_progression_events(telegram_id, game, processed_at DESC);

CREATE TABLE IF NOT EXISTS arcade_game_enforcement_state (
  telegram_id TEXT NOT NULL,
  game TEXT NOT NULL,
  ceiling_hits INTEGER NOT NULL DEFAULT 0,
  cooldown_level INTEGER NOT NULL DEFAULT 0,
  cooldown_until DATETIME,
  last_ceiling_hit_at DATETIME,
  repeat_window_expires_at DATETIME,
  xp_weight REAL NOT NULL DEFAULT 1.0,
  lockout_until DATETIME,
  lockout_count INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, game),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);
