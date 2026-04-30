-- Migration 012: repair the live Block Topia progression schema on D1.
--
-- !! DESTRUCTIVE MIGRATION — READ BEFORE APPLYING !!
-- =====================================================
-- This migration DROPS and RECREATES blocktopia_progression.
-- DO NOT run this migration casually or as part of a routine deploy.
-- Apply ONLY when directed in docs/D1_MIGRATION_RUNBOOK.md (§8).
--
-- PREFLIGHT REQUIRED — run the query below before applying:
--
--   SELECT COUNT(*) AS at_risk_rows
--   FROM blocktopia_progression
--   WHERE faction != 'unaligned'
--      OR faction_xp > 0
--      OR faction_last_switch IS NOT NULL;
--
-- If at_risk_rows > 0, DO NOT RUN THIS MIGRATION.
-- Those rows have live faction/faction_xp/faction_last_switch data.
-- The INSERT SELECT in this migration does NOT copy those columns.
-- Running now will PERMANENTLY RESET all faction progress to defaults.
-- Instead, create a new repair migration that preserves those columns
-- before attempting this rebuild.  See docs/D1_MIGRATION_RUNBOOK.md §8.
--
-- DATA LOSS RISK DETAIL:
--   The INSERT SELECT below copies only the columns listed explicitly.
--   faction, faction_xp, and faction_last_switch are NOT in the SELECT.
--   Any existing faction data will be lost and reset to defaults:
--     faction          → 'unaligned'
--     faction_xp       → 0
--     faction_last_switch → NULL
--
-- Cloudflare D1 does not accept:
--   ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...
--
-- This migration uses a defensive table rebuild instead:
-- 1. Snapshot the live column layout with PRAGMA table_info for auditability.
-- 2. Recreate blocktopia_progression with the required faction columns.
-- 3. Copy existing progression data forward and let D1 defaults backfill the
--    newly added faction fields.
--
-- Apply to production with:
--   npx wrangler d1 execute wikicoms --file=./migrations/012_wikicoms_schema_fix.sql --remote

PRAGMA defer_foreign_keys = on;

DROP TABLE IF EXISTS blocktopia_progression__012_schema_snapshot;
CREATE TEMP TABLE blocktopia_progression__012_schema_snapshot AS
SELECT cid, name, type, "notnull" AS is_not_null, dflt_value, pk
FROM pragma_table_info('blocktopia_progression');

DROP TABLE IF EXISTS blocktopia_progression__012_rebuild;
CREATE TABLE blocktopia_progression__012_rebuild (
  telegram_id TEXT PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  gems INTEGER NOT NULL DEFAULT 0,
  tier INTEGER NOT NULL DEFAULT 1,
  win_streak INTEGER NOT NULL DEFAULT 0,
  upgrade_efficiency INTEGER NOT NULL DEFAULT 0,
  upgrade_signal INTEGER NOT NULL DEFAULT 0,
  upgrade_defense INTEGER NOT NULL DEFAULT 0,
  upgrade_gem INTEGER NOT NULL DEFAULT 0,
  upgrade_npc INTEGER NOT NULL DEFAULT 0,
  rpg_mode_active INTEGER NOT NULL DEFAULT 0,
  faction TEXT DEFAULT 'unaligned',
  faction_xp INTEGER DEFAULT 0,
  faction_last_switch TEXT,
  network_heat INTEGER NOT NULL DEFAULT 0,
  network_heat_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO blocktopia_progression__012_rebuild (
  telegram_id,
  xp,
  gems,
  tier,
  win_streak,
  upgrade_efficiency,
  upgrade_signal,
  upgrade_defense,
  upgrade_gem,
  upgrade_npc,
  rpg_mode_active,
  network_heat,
  network_heat_updated_at,
  last_active,
  updated_at
)
SELECT
  telegram_id,
  COALESCE(xp, 0),
  COALESCE(gems, 0),
  COALESCE(tier, 1),
  COALESCE(win_streak, 0),
  COALESCE(upgrade_efficiency, 0),
  COALESCE(upgrade_signal, 0),
  COALESCE(upgrade_defense, 0),
  COALESCE(upgrade_gem, 0),
  COALESCE(upgrade_npc, 0),
  COALESCE(rpg_mode_active, 0),
  COALESCE(network_heat, 0),
  COALESCE(network_heat_updated_at, CURRENT_TIMESTAMP),
  COALESCE(last_active, CURRENT_TIMESTAMP),
  COALESCE(updated_at, CURRENT_TIMESTAMP)
FROM blocktopia_progression;

DROP TABLE IF EXISTS blocktopia_progression;
ALTER TABLE blocktopia_progression__012_rebuild RENAME TO blocktopia_progression;

CREATE INDEX IF NOT EXISTS idx_blocktopia_progression_xp
  ON blocktopia_progression(xp DESC);

CREATE INDEX IF NOT EXISTS idx_blocktopia_progression_tier
  ON blocktopia_progression(tier DESC);

CREATE INDEX IF NOT EXISTS idx_blocktopia_progression_updated
  ON blocktopia_progression(updated_at DESC);

DROP TABLE IF EXISTS blocktopia_progression__012_schema_snapshot;
