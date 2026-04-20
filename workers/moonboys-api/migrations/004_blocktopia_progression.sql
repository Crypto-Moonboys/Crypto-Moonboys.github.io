-- Migration 004: Block Topia progression + event log tables
--
-- Apply to live D1 database:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/004_blocktopia_progression.sql --remote
--
-- This migration owns the Block Topia progression schema used by:
--   GET/POST /blocktopia/progression*
-- It intentionally removes the need for request-time table/column patching.

CREATE TABLE IF NOT EXISTS blocktopia_progression (
  telegram_id         TEXT PRIMARY KEY,
  xp                  INTEGER NOT NULL DEFAULT 0,
  gems                INTEGER NOT NULL DEFAULT 0,
  tier                INTEGER NOT NULL DEFAULT 1,
  win_streak          INTEGER NOT NULL DEFAULT 0,
  upgrade_efficiency  INTEGER NOT NULL DEFAULT 0,
  upgrade_signal      INTEGER NOT NULL DEFAULT 0,
  upgrade_defense     INTEGER NOT NULL DEFAULT 0,
  upgrade_gem         INTEGER NOT NULL DEFAULT 0,
  upgrade_npc         INTEGER NOT NULL DEFAULT 0,
  rpg_mode_active     INTEGER NOT NULL DEFAULT 0,
  last_active         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blocktopia_progression_xp
  ON blocktopia_progression(xp DESC);

CREATE INDEX IF NOT EXISTS idx_blocktopia_progression_tier
  ON blocktopia_progression(tier DESC);

CREATE INDEX IF NOT EXISTS idx_blocktopia_progression_updated
  ON blocktopia_progression(updated_at DESC);

CREATE TABLE IF NOT EXISTS blocktopia_progression_events (
  id          TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  action      TEXT NOT NULL,
  action_type TEXT,
  score       INTEGER NOT NULL DEFAULT 0,
  xp_change   INTEGER NOT NULL DEFAULT 0,
  gems_change INTEGER NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES blocktopia_progression(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blocktopia_events_user_created
  ON blocktopia_progression_events(telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blocktopia_events_user_action_created
  ON blocktopia_progression_events(telegram_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blocktopia_events_user_action_type_created
  ON blocktopia_progression_events(telegram_id, action, action_type, created_at DESC);
