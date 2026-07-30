-- Crypto Moonboy Pets Phase 5A runtime persistence.

CREATE TABLE IF NOT EXISTS telegram_pet_progression_state (
  telegram_id TEXT PRIMARY KEY,
  care_xp INTEGER NOT NULL DEFAULT 0 CHECK (care_xp >= 0),
  training_xp INTEGER NOT NULL DEFAULT 0 CHECK (training_xp >= 0),
  adventure_xp INTEGER NOT NULL DEFAULT 0 CHECK (adventure_xp >= 0),
  arena_xp INTEGER NOT NULL DEFAULT 0 CHECK (arena_xp >= 0),
  job_xp INTEGER NOT NULL DEFAULT 0 CHECK (job_xp >= 0),
  bond_xp INTEGER NOT NULL DEFAULT 0 CHECK (bond_xp >= 0),
  daily_key TEXT NOT NULL DEFAULT '',
  care_daily INTEGER NOT NULL DEFAULT 0 CHECK (care_daily >= 0),
  training_daily INTEGER NOT NULL DEFAULT 0 CHECK (training_daily >= 0),
  adventure_daily INTEGER NOT NULL DEFAULT 0 CHECK (adventure_daily >= 0),
  arena_daily INTEGER NOT NULL DEFAULT 0 CHECK (arena_daily >= 0),
  job_daily INTEGER NOT NULL DEFAULT 0 CHECK (job_daily >= 0),
  bond_daily INTEGER NOT NULL DEFAULT 0 CHECK (bond_daily >= 0),
  traits_json TEXT NOT NULL DEFAULT '{}',
  region_mastery_json TEXT NOT NULL DEFAULT '{}',
  completed_regions_json TEXT NOT NULL DEFAULT '[]',
  event_chains_json TEXT NOT NULL DEFAULT '{}',
  prestige_count INTEGER NOT NULL DEFAULT 0 CHECK (prestige_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_material_balances (
  telegram_id TEXT NOT NULL,
  material_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, material_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_runtime_events (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (telegram_id, event_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_runtime_events_owner_created
  ON telegram_pet_runtime_events (telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pet_material_balances_owner
  ON telegram_pet_material_balances (telegram_id, material_key);

INSERT OR IGNORE INTO telegram_pet_progression_state (telegram_id)
SELECT telegram_id FROM telegram_pet_profiles;
