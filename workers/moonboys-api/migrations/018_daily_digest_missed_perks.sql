-- Migration 018: Daily digest + missed perks retention system
-- Adds:
--   1) daily_missed_perks            (persistent missed opportunity history, never reset)
--   2) telegram_daily_digest_log     (one digest send per user per UTC day)
--   3) daily_opportunity_state       (today-scoped active opportunities, resets by UTC day key)

CREATE TABLE IF NOT EXISTS daily_missed_perks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id      TEXT NOT NULL,
  utc_day          TEXT NOT NULL,
  faction_id       TEXT,
  source           TEXT NOT NULL DEFAULT 'unknown',
  opportunity_type TEXT NOT NULL DEFAULT 'daily_opportunity',
  title            TEXT NOT NULL,
  description      TEXT,
  missed_reason    TEXT,
  status_value     INTEGER NOT NULL DEFAULT 0,
  metadata_json    TEXT,
  missed_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_missed_perks_user_day
  ON daily_missed_perks(telegram_id, utc_day);

CREATE INDEX IF NOT EXISTS idx_daily_missed_perks_user_missed_desc
  ON daily_missed_perks(telegram_id, missed_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_missed_perks_faction_day
  ON daily_missed_perks(faction_id, utc_day);

CREATE TABLE IF NOT EXISTS telegram_daily_digest_log (
  telegram_id   TEXT NOT NULL,
  utc_day       TEXT NOT NULL,
  sent_at       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  metadata_json TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (telegram_id, utc_day),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_opportunity_state (
  telegram_id   TEXT NOT NULL,
  utc_day       TEXT NOT NULL,
  daily_seed    TEXT NOT NULL,
  chain_depth   INTEGER NOT NULL DEFAULT 0,
  activated_at  TEXT,
  last_roll_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (telegram_id, utc_day),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);
