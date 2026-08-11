-- Crypto Moonboy Pets roguelite foundation.
-- Rebuilds the v1 run tables without dropping any v1 columns or terminal states,
-- then adds the backend-only room, modifier, relic, reward, history and analytics ledgers.

ALTER TABLE telegram_pet_run_steps RENAME TO telegram_pet_run_steps_v1_042;
ALTER TABLE telegram_pet_runs RENAME TO telegram_pet_runs_v1_042;

CREATE TABLE telegram_pet_runs (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'moon_alley',
  difficulty INTEGER NOT NULL DEFAULT 1 CHECK (difficulty >= 1),
  seed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'abandoned', 'extractable', 'extracted')),
  current_room INTEGER NOT NULL DEFAULT 0 CHECK (current_room >= 0),
  max_room INTEGER NOT NULL DEFAULT 5 CHECK (max_room >= 1),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  depth INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0),
  max_depth INTEGER NOT NULL DEFAULT 5 CHECK (max_depth >= 1),
  risk_level INTEGER NOT NULL DEFAULT 1 CHECK (risk_level >= 1),
  unbanked_pet_xp INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_pet_xp >= 0),
  unbanked_moon_gold INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_moon_gold >= 0),
  unbanked_moon_crystals INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_moon_crystals >= 0),
  unbanked_style_tokens INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_style_tokens >= 0),
  unbanked_items TEXT NOT NULL DEFAULT '{}',
  death_reason TEXT,
  rewards_earned TEXT NOT NULL DEFAULT '{}',
  rooms_completed INTEGER NOT NULL DEFAULT 0 CHECK (rooms_completed >= 0),
  modifiers_chosen TEXT NOT NULL DEFAULT '[]',
  boss_fought TEXT,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  completed_at DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id),
  UNIQUE(telegram_id, run_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

INSERT INTO telegram_pet_runs (
  id, telegram_id, run_id, season_key, region, difficulty, seed, status,
  current_room, max_room, score, depth, max_depth, risk_level,
  unbanked_pet_xp, unbanked_moon_gold, unbanked_moon_crystals, unbanked_style_tokens, unbanked_items,
  started_at, ended_at, completed_at, updated_at
)
SELECT id, telegram_id, run_id, season_key, 'moon_alley', risk_level, 0, status,
  depth, max_depth, 0, depth, max_depth, risk_level,
  unbanked_pet_xp, unbanked_moon_gold, unbanked_moon_crystals, unbanked_style_tokens, unbanked_items,
  started_at, completed_at, completed_at, updated_at
FROM telegram_pet_runs_v1_042;

CREATE TABLE telegram_pet_run_steps (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL CHECK (step_index >= 1),
  choice_key TEXT NOT NULL,
  choice_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0, 1)),
  risk_roll REAL NOT NULL DEFAULT 0,
  pet_xp_delta INTEGER NOT NULL DEFAULT 0,
  moon_gold_delta INTEGER NOT NULL DEFAULT 0,
  moon_crystals_delta INTEGER NOT NULL DEFAULT 0,
  style_tokens_delta INTEGER NOT NULL DEFAULT 0,
  item_key TEXT,
  metadata TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id, event_key),
  UNIQUE(run_id, step_index),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE
);

INSERT INTO telegram_pet_run_steps SELECT * FROM telegram_pet_run_steps_v1_042;
DROP TABLE telegram_pet_run_steps_v1_042;
DROP TABLE telegram_pet_runs_v1_042;

CREATE UNIQUE INDEX idx_telegram_pet_runs_one_open ON telegram_pet_runs(telegram_id) WHERE status IN ('active', 'extractable');
CREATE INDEX idx_telegram_pet_runs_user_status ON telegram_pet_runs(telegram_id, status, updated_at DESC);
CREATE INDEX idx_telegram_pet_run_steps_run ON telegram_pet_run_steps(run_id, step_index);

CREATE TABLE telegram_pet_reward_claims (
  claim_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  source TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  day_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'awarded', 'rejected')),
  requested_rewards TEXT NOT NULL DEFAULT '{}',
  applied_rewards TEXT NOT NULL DEFAULT '{}',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  awarded_at DATETIME,
  UNIQUE(telegram_id, source, idempotency_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);
CREATE INDEX idx_telegram_pet_reward_claims_source ON telegram_pet_reward_claims(source, created_at DESC);
CREATE INDEX idx_telegram_pet_reward_claims_user_day ON telegram_pet_reward_claims(telegram_id, day_key, source);

CREATE TABLE telegram_pet_reward_assets (
  claim_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('material', 'item', 'relic')),
  asset_key TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  PRIMARY KEY (claim_id, asset_type, asset_key),
  FOREIGN KEY (claim_id) REFERENCES telegram_pet_reward_claims(claim_id) ON DELETE CASCADE
);
CREATE INDEX idx_telegram_pet_reward_assets_type ON telegram_pet_reward_assets(asset_type, asset_key);

CREATE TABLE telegram_pet_inventory (
  telegram_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('material', 'item')),
  asset_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, asset_type, asset_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

-- Track the legacy event-ledger contribution separately during the migration ->
-- Worker cutover. This lets the old Worker keep writing events while the new
-- authority writes the inventory table directly, without either side replacing
-- or double-counting quantities written by the other side.
CREATE VIEW telegram_pet_legacy_item_balances_042 AS
SELECT telegram_id, asset_key, MAX(0, SUM(quantity_delta)) AS quantity
FROM (
  SELECT telegram_id,
    COALESCE(json_extract(metadata, '$.item_key'), json_extract(metadata, '$.inventory_key')) AS asset_key,
    MAX(1, CAST(COALESCE(json_extract(metadata, '$.count'), 1) AS INTEGER)) AS quantity_delta
  FROM telegram_pet_events
  WHERE status = 'accepted' AND json_valid(metadata)
    AND COALESCE(json_extract(metadata, '$.inventory_authority'), 0) <> 1
    AND COALESCE(json_extract(metadata, '$.item_key'), json_extract(metadata, '$.inventory_key')) IS NOT NULL
  UNION ALL
  SELECT telegram_id, json_extract(metadata, '$.consumed_item_key') AS asset_key, -1 AS quantity_delta
  FROM telegram_pet_events
  WHERE status = 'accepted' AND json_valid(metadata)
    AND COALESCE(json_extract(metadata, '$.inventory_authority'), 0) <> 1
    AND json_extract(metadata, '$.consumed_item_key') IS NOT NULL
)
WHERE asset_key IN ('moon_snack', 'energy_drink', 'clean_wipe', 'lucky_charm', 'style_patch', 'adventure_map')
GROUP BY telegram_id, asset_key
HAVING SUM(quantity_delta) > 0;

CREATE TABLE telegram_pet_inventory_legacy_sync_042 (
  telegram_id TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, asset_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

-- Materialize the pre-042 legacy balance and remember exactly how much of the
-- authoritative row came from that ledger. Later trigger reconciliations apply
-- only the ledger delta, preserving concurrent new-authority writes.
INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity)
SELECT telegram_id, 'item', asset_key, quantity
FROM telegram_pet_legacy_item_balances_042;

INSERT INTO telegram_pet_inventory_legacy_sync_042 (telegram_id, asset_key, quantity)
SELECT telegram_id, asset_key, quantity
FROM telegram_pet_legacy_item_balances_042;

CREATE TABLE telegram_pet_run_rooms (
  room_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  room_number INTEGER NOT NULL CHECK (room_number >= 1),
  room_type TEXT NOT NULL CHECK (room_type IN ('battle', 'choice_event', 'loot', 'elite', 'boss')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'failed')),
  generated_data TEXT NOT NULL DEFAULT '{}',
  outcome_data TEXT NOT NULL DEFAULT '{}',
  reward_claim_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  UNIQUE(run_id, room_number),
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_run_modifiers (
  run_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  modifier_id TEXT NOT NULL,
  effects_json TEXT NOT NULL DEFAULT '{}',
  chosen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, modifier_id),
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_relics (
  telegram_id TEXT NOT NULL,
  relic_id TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  effects_json TEXT NOT NULL DEFAULT '{}',
  unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, relic_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_run_history (
  telegram_id TEXT PRIMARY KEY,
  runs_completed INTEGER NOT NULL DEFAULT 0 CHECK (runs_completed >= 0),
  bosses_defeated INTEGER NOT NULL DEFAULT 0 CHECK (bosses_defeated >= 0),
  highest_room_reached INTEGER NOT NULL DEFAULT 0 CHECK (highest_room_reached >= 0),
  best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  fastest_completion_seconds INTEGER,
  rare_discoveries TEXT NOT NULL DEFAULT '[]',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_run_analytics (
  analytics_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('run_start', 'room_generated', 'room_resolved', 'modifier_chosen', 'boss_fought', 'run_end')),
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);
CREATE INDEX idx_telegram_pet_run_analytics_run ON telegram_pet_run_analytics(run_id, created_at);
