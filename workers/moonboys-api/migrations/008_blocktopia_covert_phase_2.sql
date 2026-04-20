-- Migration 008: Block Topia covert Phase 2 heat, boosts, and world-pressure hooks
--
-- Apply to live D1 database:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/008_blocktopia_covert_phase_2.sql --remote

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
