-- Classify currently live Moonpet system authority without adding gameplay.
-- Pet-owned live progression and live-system evidence now carry pet_id authority.

CREATE TABLE IF NOT EXISTS telegram_pet_live_progression_state (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  region_mastery_json TEXT NOT NULL DEFAULT '{}',
  completed_regions_json TEXT NOT NULL DEFAULT '[]',
  prestige_count INTEGER NOT NULL DEFAULT 0 CHECK (prestige_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, telegram_id, season_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

INSERT OR IGNORE INTO telegram_pet_live_progression_state
  (pet_id, telegram_id, season_key, region_mastery_json, completed_regions_json, prestige_count, created_at, updated_at)
SELECT active.pet_id, state.telegram_id, active.season_key,
  state.region_mastery_json, state.completed_regions_json, state.prestige_count,
  state.created_at, state.updated_at
FROM telegram_pet_progression_state AS state
JOIN telegram_pet_active_slots AS active
  ON active.telegram_id = state.telegram_id
JOIN telegram_pet_instances AS instance
  ON instance.pet_id = active.pet_id
 AND instance.telegram_id = active.telegram_id
 AND instance.season_key = active.season_key;

ALTER TABLE telegram_pet_system_events RENAME TO telegram_pet_system_events_legacy_074;

CREATE TABLE telegram_pet_system_events (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL DEFAULT '',
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL DEFAULT '',
  system_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settling','completed','rejected')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, telegram_id, season_key, system_key, action_key, period_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO telegram_pet_system_events
  (id, pet_id, telegram_id, season_key, system_key, action_key, period_key, status, payload_json, created_at, updated_at)
SELECT legacy.id, COALESCE(active.pet_id, ''), legacy.telegram_id, COALESCE(active.season_key, ''),
  legacy.system_key, legacy.action_key, legacy.period_key, legacy.status, legacy.payload_json, legacy.created_at, legacy.updated_at
FROM telegram_pet_system_events_legacy_074 AS legacy
LEFT JOIN telegram_pet_active_slots AS active
  ON active.telegram_id = legacy.telegram_id
WHERE legacy.system_key IN ('district', 'event_chain', 'seasonal_boss');

INSERT OR IGNORE INTO telegram_pet_system_events
  (id, pet_id, telegram_id, season_key, system_key, action_key, period_key, status, payload_json, created_at, updated_at)
SELECT legacy.id, '', legacy.telegram_id, '',
  legacy.system_key, legacy.action_key, legacy.period_key, legacy.status, legacy.payload_json, legacy.created_at, legacy.updated_at
FROM telegram_pet_system_events_legacy_074 AS legacy
WHERE legacy.system_key NOT IN ('district', 'event_chain', 'seasonal_boss');

DROP TABLE telegram_pet_system_events_legacy_074;

CREATE INDEX IF NOT EXISTS idx_pet_system_events_owner
  ON telegram_pet_system_events (telegram_id, system_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_system_events_pet_owner
  ON telegram_pet_system_events (pet_id, telegram_id, season_key, system_key, created_at DESC);

ALTER TABLE telegram_pet_event_chain_progress RENAME TO telegram_pet_event_chain_progress_legacy_074;

CREATE TABLE telegram_pet_event_chain_progress (
  pet_id TEXT NOT NULL DEFAULT '',
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL DEFAULT '',
  chain_key TEXT NOT NULL,
  step_index INTEGER NOT NULL DEFAULT 0 CHECK (step_index >= 0),
  completed_cycles INTEGER NOT NULL DEFAULT 0 CHECK (completed_cycles >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, telegram_id, season_key, chain_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO telegram_pet_event_chain_progress
  (pet_id, telegram_id, season_key, chain_key, step_index, completed_cycles, updated_at)
SELECT COALESCE(active.pet_id, ''), legacy.telegram_id, COALESCE(active.season_key, ''),
  legacy.chain_key, legacy.step_index, legacy.completed_cycles, legacy.updated_at
FROM telegram_pet_event_chain_progress_legacy_074 AS legacy
LEFT JOIN telegram_pet_active_slots AS active
  ON active.telegram_id = legacy.telegram_id;

DROP TABLE telegram_pet_event_chain_progress_legacy_074;

ALTER TABLE telegram_pet_seasonal_boss_progress RENAME TO telegram_pet_seasonal_boss_progress_legacy_074;

CREATE TABLE telegram_pet_seasonal_boss_progress (
  pet_id TEXT NOT NULL DEFAULT '',
  telegram_id TEXT NOT NULL,
  pet_season_key TEXT NOT NULL DEFAULT '',
  season_key TEXT NOT NULL,
  boss_key TEXT NOT NULL,
  damage INTEGER NOT NULL DEFAULT 0 CHECK (damage >= 0),
  defeated_at TEXT,
  reward_claimed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, telegram_id, pet_season_key, season_key, boss_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO telegram_pet_seasonal_boss_progress
  (pet_id, telegram_id, pet_season_key, season_key, boss_key, damage, defeated_at, reward_claimed_at, updated_at)
SELECT COALESCE(active.pet_id, ''), legacy.telegram_id, COALESCE(active.season_key, ''),
  legacy.season_key, legacy.boss_key, legacy.damage, legacy.defeated_at, legacy.reward_claimed_at, legacy.updated_at
FROM telegram_pet_seasonal_boss_progress_legacy_074 AS legacy
LEFT JOIN telegram_pet_active_slots AS active
  ON active.telegram_id = legacy.telegram_id;

DROP TABLE telegram_pet_seasonal_boss_progress_legacy_074;
