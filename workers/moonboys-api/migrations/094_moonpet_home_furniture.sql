-- Home E2: permanent account-owned furniture, saved separately per pet.
-- No modifications to E1 free layout, lifetime pets, balances or reward receipts.
CREATE TABLE IF NOT EXISTS telegram_pet_furniture_unlocks (
  telegram_id TEXT NOT NULL,
  item_key TEXT NOT NULL CHECK(item_key IN (
    'neon_lamp','speaker_stack','arcade_cabinet','tool_chest',
    'street_sofa','retro_tv','crystal_altar','gold_throne',
    'graffiti_frame','moon_clock','neon_sign','trophy_shelf')),
  price_gold INTEGER NOT NULL CHECK(price_gold>0),
  purchase_event_key TEXT NOT NULL,
  purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(telegram_id,item_key),
  UNIQUE(telegram_id,purchase_event_key),
  FOREIGN KEY(telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS telegram_pet_furniture_placements (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  slot_key TEXT NOT NULL CHECK(slot_key IN ('left','right','wall')),
  item_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(pet_id,slot_key),
  FOREIGN KEY(pet_id,telegram_id,season_key)
    REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key) ON DELETE CASCADE,
  FOREIGN KEY(telegram_id,item_key)
    REFERENCES telegram_pet_furniture_unlocks(telegram_id,item_key)
);
CREATE INDEX IF NOT EXISTS idx_pet_furniture_placements_owner
  ON telegram_pet_furniture_placements(telegram_id,pet_id,season_key);
