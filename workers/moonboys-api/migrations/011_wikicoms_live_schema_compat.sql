-- Migration 011: wikicoms live schema compatibility repair
--
-- This repair targets the actual live wikicoms schema observed on 2026-04-21:
-- - blocktopia_progression is missing faction, faction_xp, faction_last_switch
-- - blocktopia_progression_events is missing admin_telegram_id, reason
--
-- Apply to production with:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/011_wikicoms_live_schema_compat.sql --remote

ALTER TABLE blocktopia_progression ADD COLUMN faction TEXT NOT NULL DEFAULT 'unaligned';
ALTER TABLE blocktopia_progression ADD COLUMN faction_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN faction_last_switch INTEGER;

ALTER TABLE blocktopia_progression_events ADD COLUMN admin_telegram_id TEXT;
ALTER TABLE blocktopia_progression_events ADD COLUMN reason TEXT;
