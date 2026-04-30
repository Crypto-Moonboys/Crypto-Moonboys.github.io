-- Migration 011: wikicoms live schema compatibility repair
--
-- This repair targets the actual live wikicoms schema observed on 2026-04-21:
-- - blocktopia_progression is missing faction, faction_xp, faction_last_switch
-- - blocktopia_progression_events is missing admin_telegram_id, reason
--
-- Apply to production with:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/011_wikicoms_live_schema_compat.sql --remote
--
-- Production safety notes:
-- * SQLite/D1 does not support "ALTER TABLE … ADD COLUMN IF NOT EXISTS".
-- * If migrations 005 and 006 were already applied via Wrangler (which adds faction,
--   faction_xp, faction_last_switch, admin_telegram_id, reason), the statements below
--   will fail with "duplicate column name".
-- * That error is expected and safe to ignore — it means the earlier migration already
--   applied these columns.
-- * This migration exists as a one-time compatibility repair for production databases
--   that were bootstrapped with schema.sql rather than through the Wrangler migration
--   chain.  It is a no-op on any DB that already has the columns.
-- * To check before running:
--   PRAGMA table_info('blocktopia_progression');
--   Verify that 'faction', 'faction_xp', and 'faction_last_switch' are NOT in the 'name'
--   column before running. If they already appear, those ALTER TABLE statements are
--   already applied and the duplicate-column errors are expected.
--   PRAGMA table_info('blocktopia_progression_events');
--   Verify that 'admin_telegram_id' and 'reason' are NOT in the 'name' column.
--   If they already appear, those ALTER TABLE statements are already applied.

ALTER TABLE blocktopia_progression ADD COLUMN faction TEXT NOT NULL DEFAULT 'unaligned';
ALTER TABLE blocktopia_progression ADD COLUMN faction_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN faction_last_switch INTEGER;

ALTER TABLE blocktopia_progression_events ADD COLUMN admin_telegram_id TEXT;
ALTER TABLE blocktopia_progression_events ADD COLUMN reason TEXT;
