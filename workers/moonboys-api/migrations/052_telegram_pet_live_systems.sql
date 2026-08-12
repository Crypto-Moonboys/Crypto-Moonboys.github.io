-- Make the previously declarative Moonpet systems persistent and replay-safe.

CREATE TABLE IF NOT EXISTS telegram_pet_system_events (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  system_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (telegram_id, system_key, action_key, period_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_system_events_owner
  ON telegram_pet_system_events (telegram_id, system_key, created_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_event_chain_progress (
  telegram_id TEXT NOT NULL,
  chain_key TEXT NOT NULL,
  step_index INTEGER NOT NULL DEFAULT 0 CHECK (step_index >= 0),
  completed_cycles INTEGER NOT NULL DEFAULT 0 CHECK (completed_cycles >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, chain_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_seasonal_boss_progress (
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  boss_key TEXT NOT NULL,
  damage INTEGER NOT NULL DEFAULT 0 CHECK (damage >= 0),
  defeated_at TEXT,
  reward_claimed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, season_key, boss_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_cosmetic_unlocks (
  telegram_id TEXT NOT NULL,
  cosmetic_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, cosmetic_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);
