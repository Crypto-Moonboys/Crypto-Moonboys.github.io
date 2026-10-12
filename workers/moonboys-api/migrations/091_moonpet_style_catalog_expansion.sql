-- Expand existing Moonpet per-pet cosmetic loadout choices without replacing ownership.
-- Preserve all rows (including legacy rename_badge history), original pet IDs,
-- enabled flags and timestamps in the associated unlock table.
-- This migration is REQUIRED before deploying seven-style Moonpet code.
ALTER TABLE telegram_pet_style_loadouts RENAME TO telegram_pet_style_loadouts_legacy_091;

CREATE TABLE telegram_pet_style_loadouts (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  cosmetic_key TEXT NOT NULL CHECK(cosmetic_key IN (
    'rename_badge', 'profile_frame', 'victory_pose', 'run_trail',
    'neon_aura', 'street_sparks', 'gold_frame', 'cyber_scanlines'
  )),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  PRIMARY KEY(pet_id,cosmetic_key),
  FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id)
);

INSERT INTO telegram_pet_style_loadouts (pet_id,telegram_id,cosmetic_key,enabled)
SELECT pet_id,telegram_id,cosmetic_key,enabled
FROM telegram_pet_style_loadouts_legacy_091;

DROP TABLE telegram_pet_style_loadouts_legacy_091;
