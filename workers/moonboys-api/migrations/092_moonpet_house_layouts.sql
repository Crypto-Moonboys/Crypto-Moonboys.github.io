-- H11 / E1: per-pet cosmetic room layout. No house economy or rewards.
-- Existing pets, active slots, earned balances and receipt tables are untouched.
CREATE TABLE IF NOT EXISTS telegram_pet_house_layouts (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  slot_key TEXT NOT NULL CHECK(slot_key IN ('wall','floor','furniture')),
  item_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, slot_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id),
  CHECK (
    (slot_key='wall' AND item_key IN ('warehouse_brick','night_wall','studio_white')) OR
    (slot_key='floor' AND item_key IN ('concrete','checkerboard','steel')) OR
    (slot_key='furniture' AND item_key IN ('sleep_mat','record_deck','plant_pot'))
  )
);
CREATE INDEX IF NOT EXISTS idx_pet_house_layout_owner
  ON telegram_pet_house_layouts(telegram_id,pet_id,season_key);
