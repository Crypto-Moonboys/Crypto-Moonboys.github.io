-- Home E3: one server-timed garden plot per persistent MoonPet.
-- Kitchen reuses existing crafting recipes; Gym reuses existing Train authorities.
CREATE TABLE IF NOT EXISTS telegram_pet_garden_plots (
  pet_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  crop_key TEXT NOT NULL CHECK(crop_key='garden_veggies'),
  status TEXT NOT NULL CHECK(status IN ('growing','harvesting')),
  planted_at TEXT NOT NULL,
  ready_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(julianday(ready_at)>julianday(planted_at)),
  FOREIGN KEY(pet_id,telegram_id,season_key)
    REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_garden_owner
  ON telegram_pet_garden_plots(telegram_id,pet_id,season_key,status,ready_at);

CREATE TABLE IF NOT EXISTS telegram_pet_garden_harvests (
  telegram_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  crop_key TEXT NOT NULL CHECK(crop_key='garden_veggies'),
  crop_planted_at TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity=1),
  status TEXT NOT NULL CHECK(status IN ('pending','settling','completed')),
  harvested_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(telegram_id,event_key),
  UNIQUE(pet_id,crop_planted_at),
  -- Harvest receipts are account history. Pet deletion must not erase them.
  FOREIGN KEY(telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_garden_harvest_crop
  ON telegram_pet_garden_harvests(pet_id,crop_planted_at,status);
