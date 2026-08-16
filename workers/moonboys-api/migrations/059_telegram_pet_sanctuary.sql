-- Permanent, immutable-at-rest snapshots for server-completed Legendary pets.
-- No backfill is performed: entry is an explicit server-authoritative action.
CREATE TABLE IF NOT EXISTS telegram_pet_sanctuary (
  sanctuary_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL UNIQUE,
  telegram_id TEXT NOT NULL,
  original_season_key TEXT NOT NULL,
  completed_at DATETIME NOT NULL,
  entered_sanctuary_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  species TEXT NOT NULL,
  variant TEXT,
  stage TEXT NOT NULL,
  legendary_evolution_id TEXT NOT NULL,
  identity_snapshot_json TEXT NOT NULL CHECK (json_valid(identity_snapshot_json)),
  cosmetic_snapshot_json TEXT NOT NULL CHECK (json_valid(cosmetic_snapshot_json)),
  trait_snapshot_json TEXT NOT NULL CHECK (json_valid(trait_snapshot_json)),
  memory_snapshot_json TEXT NOT NULL CHECK (json_valid(memory_snapshot_json)),
  status TEXT NOT NULL DEFAULT 'resident' CHECK (status = 'resident'),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE RESTRICT,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE RESTRICT,
  FOREIGN KEY (pet_id, telegram_id, original_season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE RESTRICT,
  FOREIGN KEY (pet_id, original_season_key)
    REFERENCES telegram_pet_season_completions(pet_id, season_key) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_pet_sanctuary_owner_completed
  ON telegram_pet_sanctuary(telegram_id, completed_at DESC);
