-- Per-pet equipped cosmetic styles.
CREATE TABLE IF NOT EXISTS telegram_pet_style_loadouts (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  cosmetic_key TEXT NOT NULL CHECK(cosmetic_key IN ('rename_badge','profile_frame','victory_pose','run_trail')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  PRIMARY KEY(pet_id,cosmetic_key),
  FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id)
);
