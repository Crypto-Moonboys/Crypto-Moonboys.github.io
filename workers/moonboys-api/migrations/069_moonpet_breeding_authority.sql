-- Moonpet Breeding authority foundation.
-- Additive only: completed parent authority, deterministic receipts,
-- offspring recovery, and UTC cooldowns live on server-owned tables.

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_completion_tuple
  ON telegram_pet_season_slots(pet_id, telegram_id, season_key);

CREATE TABLE IF NOT EXISTS telegram_pet_breeding_receipts (
  receipt_id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL,
  request_key TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  parent_pet_a_id TEXT NOT NULL,
  parent_pet_b_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  seed TEXT NOT NULL,
  offspring_pet_id TEXT NOT NULL,
  offspring_traits_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(offspring_traits_json)),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  reason TEXT NOT NULL,
  cooldown_available_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_key),
  UNIQUE (telegram_id, season_key, parent_pet_a_id, parent_pet_b_id, request_key),
  UNIQUE (offspring_pet_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_pet_a_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE,
  FOREIGN KEY (parent_pet_b_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_breeding_cooldowns (
  parent_pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  available_at DATETIME NOT NULL,
  last_receipt_id TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parent_pet_id, season_key),
  FOREIGN KEY (parent_pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (last_receipt_id) REFERENCES telegram_pet_breeding_receipts(receipt_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_breeding_receipts_owner_season
  ON telegram_pet_breeding_receipts(telegram_id, season_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_breeding_receipts_parent_pair
  ON telegram_pet_breeding_receipts(parent_pet_a_id, parent_pet_b_id, season_key, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_breeding_receipts_offspring
  ON telegram_pet_breeding_receipts(offspring_pet_id, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_breeding_cooldowns_owner
  ON telegram_pet_breeding_cooldowns(telegram_id, season_key, available_at);
