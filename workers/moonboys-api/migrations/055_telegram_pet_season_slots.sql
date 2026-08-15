-- Moonpet multi-pet foundation.
-- This PR keeps existing gameplay keyed by telegram_id, but creates the stable
-- pet_id and seasonal slot records needed before gameplay can safely move to
-- per-pet ownership in later PRs.

CREATE TABLE IF NOT EXISTS telegram_pet_season_slots (
  pet_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  slot_number INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 3),
  acquisition_type TEXT NOT NULL CHECK (acquisition_type IN ('free', 'arcade_xp')),
  source_event_key TEXT,
  arcade_xp_spent INTEGER NOT NULL DEFAULT 0 CHECK (arcade_xp_spent >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired', 'archived')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (telegram_id, season_key, slot_number),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_active_slots (
  telegram_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_season_slots(pet_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_owner_season
  ON telegram_pet_season_slots(telegram_id, season_key, slot_number);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_season_rank
  ON telegram_pet_season_slots(season_key, status, slot_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_source_event
  ON telegram_pet_season_slots(telegram_id, season_key, source_event_key)
  WHERE source_event_key IS NOT NULL;

UPDATE telegram_pet_profiles
SET species = '', updated_at = CURRENT_TIMESTAMP
WHERE species IS NULL OR species NOT IN (
  'neon_raccoon', 'bubble_ram', 'comet_gecko', 'vinyl_crab',
  'lantern_fox', 'sneaker_snail', 'alley_drake', 'moon_ferret'
);

WITH legacy_slots AS (
  SELECT
    p.telegram_id,
    COALESCE((
      SELECT s.season_key
      FROM telegram_pet_season_state s
      WHERE s.telegram_id = p.telegram_id
      ORDER BY s.updated_at DESC
      LIMIT 1
    ), 'legacy-season') AS season_key
  FROM telegram_pet_profiles p
)
INSERT OR IGNORE INTO telegram_pet_season_slots
  (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
SELECT
  'pet:' || telegram_id || ':' || season_key || ':1',
  telegram_id,
  season_key,
  1,
  'free',
  'legacy_profile',
  0,
  'active'
FROM legacy_slots;

INSERT OR IGNORE INTO telegram_pet_active_slots (telegram_id, pet_id, season_key)
SELECT telegram_id, pet_id, season_key
FROM telegram_pet_season_slots
WHERE slot_number = 1 AND status = 'active';
