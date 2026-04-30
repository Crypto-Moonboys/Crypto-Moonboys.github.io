-- Migration 009: Block Topia covert Phase 3 network pressure, SAM awareness, and capture timers
--
-- Apply to live D1 database:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/009_blocktopia_covert_phase_3_pressure.sql --remote
--
-- Production safety notes:
-- * SQLite/D1 does not support "ALTER TABLE … ADD COLUMN IF NOT EXISTS".
-- * If network_heat / network_heat_updated_at already exist in blocktopia_progression
--   (e.g. because migration 011 was applied as a manual repair or because schema.sql
--   was used to bootstrap the DB), this statement will fail with "duplicate column name".
-- * Same applies to captured_until / capture_count on blocktopia_covert_agents.
-- * Those errors are expected and safe to ignore on repeat runs.
-- * To check before running:
--   SELECT network_heat FROM blocktopia_progression LIMIT 1;
--   SELECT captured_until FROM blocktopia_covert_agents LIMIT 1;

ALTER TABLE blocktopia_progression ADD COLUMN network_heat INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN network_heat_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE blocktopia_covert_agents ADD COLUMN captured_until DATETIME;
ALTER TABLE blocktopia_covert_agents ADD COLUMN capture_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_agents_capture_window
  ON blocktopia_covert_agents(telegram_id, status, captured_until);
