-- Per-pet Moonpet specialist progression authority.
-- Wallets, inventory, cosmetics and material balances remain account-owned.

CREATE TABLE IF NOT EXISTS telegram_pet_specialist_progression (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, telegram_id, season_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_specialist_events (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  event_key TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, telegram_id, season_key, event_key),
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_specialist_progression(pet_id, telegram_id, season_key)
    ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_specialist_progression_owner
  ON telegram_pet_specialist_progression(telegram_id, season_key, pet_id);

CREATE INDEX IF NOT EXISTS idx_pet_specialist_events_owner_created
  ON telegram_pet_specialist_events(telegram_id, season_key, pet_id, created_at DESC);

INSERT OR IGNORE INTO telegram_pet_specialist_progression (
  pet_id, telegram_id, season_key,
  care_xp, training_xp, adventure_xp, arena_xp, job_xp, bond_xp,
  daily_key, care_daily, training_daily, adventure_daily, arena_daily, job_daily, bond_daily,
  traits_json, created_at, updated_at
)
SELECT
  i.pet_id, i.telegram_id, i.season_key,
  p.care_xp, p.training_xp, p.adventure_xp, p.arena_xp, p.job_xp, p.bond_xp,
  p.daily_key, p.care_daily, p.training_daily, p.adventure_daily, p.arena_daily, p.job_daily, p.bond_daily,
  p.traits_json, p.created_at, p.updated_at
FROM telegram_pet_instances i
JOIN telegram_pet_progression_state p ON p.telegram_id = i.telegram_id
WHERE i.slot_number = 1 AND i.status = 'active';

INSERT OR IGNORE INTO telegram_pet_specialist_events (
  id, pet_id, telegram_id, season_key, event_key, action, payload_json, created_at
)
SELECT
  'legacy-runtime:' || e.id,
  i.pet_id,
  e.telegram_id,
  i.season_key,
  e.event_key,
  e.action,
  e.payload_json,
  e.created_at
FROM telegram_pet_runtime_events e
JOIN telegram_pet_instances i
  ON i.telegram_id = e.telegram_id
  AND i.slot_number = 1
  AND i.status = 'active'
JOIN telegram_pet_specialist_progression s
  ON s.pet_id = i.pet_id
  AND s.telegram_id = i.telegram_id
  AND s.season_key = i.season_key;
