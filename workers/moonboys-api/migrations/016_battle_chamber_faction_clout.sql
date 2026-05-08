-- Migration 016: Battle Chamber faction clout authority tables
-- Adds server-backed faction/member clout periods and public activity proof feed.

CREATE TABLE IF NOT EXISTS battle_chamber_faction_clout (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  faction_id         TEXT NOT NULL,
  period_type        TEXT NOT NULL,
  period_key         TEXT NOT NULL,
  clout_total        INTEGER NOT NULL DEFAULT 0,
  contribution_total INTEGER NOT NULL DEFAULT 0,
  mission_total      INTEGER NOT NULL DEFAULT 0,
  score_total        INTEGER NOT NULL DEFAULT 0,
  member_count       INTEGER NOT NULL DEFAULT 0,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (faction_id, period_type, period_key)
);

CREATE INDEX IF NOT EXISTS idx_bc_faction_clout_period
  ON battle_chamber_faction_clout(period_type, period_key, clout_total DESC);

CREATE TABLE IF NOT EXISTS battle_chamber_member_clout (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id   TEXT NOT NULL,
  faction_id    TEXT NOT NULL,
  period_type   TEXT NOT NULL,
  period_key    TEXT NOT NULL,
  clout_total   INTEGER NOT NULL DEFAULT 0,
  mission_total INTEGER NOT NULL DEFAULT 0,
  score_total   INTEGER NOT NULL DEFAULT 0,
  streak_total  INTEGER NOT NULL DEFAULT 0,
  last_event_at TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (telegram_id, faction_id, period_type, period_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bc_member_clout_faction_period
  ON battle_chamber_member_clout(faction_id, period_type, period_key, clout_total DESC);

CREATE TABLE IF NOT EXISTS battle_chamber_activity_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id   TEXT NOT NULL,
  display_name  TEXT,
  faction_id    TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  event_text    TEXT NOT NULL,
  clout_delta   INTEGER NOT NULL DEFAULT 0,
  source        TEXT,
  metadata_json TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bc_activity_created_desc
  ON battle_chamber_activity_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bc_activity_faction_created_desc
  ON battle_chamber_activity_log(faction_id, created_at DESC);
