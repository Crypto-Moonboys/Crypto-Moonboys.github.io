-- Migration 007: Block Topia covert infiltrator agents and operations
--
-- Apply to live D1 database:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/007_blocktopia_covert_agents.sql --remote

CREATE TABLE IF NOT EXISTS blocktopia_covert_agents (
  id                  TEXT PRIMARY KEY,
  telegram_id         TEXT NOT NULL,
  agent_type          TEXT NOT NULL DEFAULT 'infiltrator',
  level               INTEGER NOT NULL DEFAULT 1,
  stealth             INTEGER NOT NULL DEFAULT 58,
  resilience          INTEGER NOT NULL DEFAULT 46,
  loyalty             INTEGER NOT NULL DEFAULT 62,
  heat                INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'exposed', 'captured')),
  current_node_id     TEXT,
  home_district_id    TEXT,
  assigned_operation  TEXT,
  assigned_until      DATETIME,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES blocktopia_progression(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_agents_user_status
  ON blocktopia_covert_agents(telegram_id, status);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_agents_assigned_operation
  ON blocktopia_covert_agents(assigned_operation);

CREATE TABLE IF NOT EXISTS blocktopia_covert_operations (
  id                TEXT PRIMARY KEY,
  telegram_id       TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  operation_type    TEXT NOT NULL DEFAULT 'infiltrate',
  target_node_id    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'success', 'failed', 'critical_failure')),
  success_roll      INTEGER,
  detection_roll    INTEGER,
  reward_xp         INTEGER NOT NULL DEFAULT 0,
  reward_gems       INTEGER NOT NULL DEFAULT 0,
  started_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolves_at       DATETIME NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES blocktopia_progression(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES blocktopia_covert_agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_operations_user_status
  ON blocktopia_covert_operations(telegram_id, status, resolves_at);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_operations_agent_status
  ON blocktopia_covert_operations(agent_id, status);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_operations_target_created
  ON blocktopia_covert_operations(target_node_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blocktopia_covert_one_active_operation_per_agent
  ON blocktopia_covert_operations(agent_id)
  WHERE status = 'active';
