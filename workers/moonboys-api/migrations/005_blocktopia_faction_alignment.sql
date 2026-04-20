-- Migration 005: Block Topia faction alignment fields
--
-- Apply to live D1 database:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/005_blocktopia_faction_alignment.sql --remote

ALTER TABLE blocktopia_progression ADD COLUMN faction TEXT NOT NULL DEFAULT 'unaligned';
ALTER TABLE blocktopia_progression ADD COLUMN faction_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN faction_last_switch INTEGER;
