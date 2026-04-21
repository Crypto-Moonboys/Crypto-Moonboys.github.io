-- Migration 009: Block Topia covert Phase 3 network pressure, SAM awareness, and capture timers
--
-- Apply to live D1 database:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/009_blocktopia_covert_phase_3_pressure.sql --remote

ALTER TABLE blocktopia_progression ADD COLUMN network_heat INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_progression ADD COLUMN network_heat_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE blocktopia_covert_agents ADD COLUMN captured_until DATETIME;
ALTER TABLE blocktopia_covert_agents ADD COLUMN capture_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_agents_capture_window
  ON blocktopia_covert_agents(telegram_id, status, captured_until);
