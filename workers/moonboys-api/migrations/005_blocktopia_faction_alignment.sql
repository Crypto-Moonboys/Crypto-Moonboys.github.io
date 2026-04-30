-- Migration 005: Block Topia faction alignment fields
--
-- Apply to live D1 database:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/005_blocktopia_faction_alignment.sql --remote
--
-- Production safety notes:
-- * SQLite/D1 does not support "ALTER TABLE … ADD COLUMN IF NOT EXISTS".
-- * If any column below already exists (e.g. because migration 011 was applied as a
--   manual repair), this statement will fail with "duplicate column name".
-- * That error is expected and safe to ignore on repeat runs.
-- * To check before running:
--   PRAGMA table_info('blocktopia_progression');
--   Verify that 'faction', 'faction_xp', and 'faction_last_switch' are NOT listed in the
--   'name' column before running. If they already appear, this migration is already applied
--   and the duplicate-column errors are expected.

ALTER TABLE blocktopia_progression ADD COLUMN faction TEXT NOT NULL DEFAULT 'unaligned';
ALTER TABLE blocktopia_progression ADD COLUMN faction_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN faction_last_switch INTEGER;
