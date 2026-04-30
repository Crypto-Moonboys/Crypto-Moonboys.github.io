-- Migration 008: Block Topia covert Phase 2 heat, boosts, and world-pressure hooks
--
-- Apply to live D1 database:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/008_blocktopia_covert_phase_2.sql --remote
--
-- Production safety notes:
-- * SQLite/D1 does not support "ALTER TABLE … ADD COLUMN IF NOT EXISTS".
-- * If any column below already exists (e.g. because schema.sql was used to bootstrap the
--   live DB), this statement will fail with "duplicate column name".
-- * That error is expected and safe to ignore on repeat runs.
-- * To check before running:
--   SELECT stealth_boost_until, recovery_count FROM blocktopia_covert_agents LIMIT 1;
--   SELECT heat_before, heat_after FROM blocktopia_covert_operations LIMIT 1;

ALTER TABLE blocktopia_covert_agents ADD COLUMN stealth_boost_until DATETIME;
ALTER TABLE blocktopia_covert_agents ADD COLUMN recovery_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE blocktopia_covert_operations ADD COLUMN heat_before INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_covert_operations ADD COLUMN heat_after INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_covert_operations ADD COLUMN node_interference_delta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_covert_operations ADD COLUMN district_support_delta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_covert_operations ADD COLUMN district_pressure_delta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_covert_operations ADD COLUMN faction_pressure_delta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_covert_operations ADD COLUMN sam_pressure_delta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocktopia_covert_operations ADD COLUMN local_risk_delta INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_agents_type_status
  ON blocktopia_covert_agents(agent_type, status);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_operations_pressure
  ON blocktopia_covert_operations(target_node_id, status, updated_at DESC);
