-- Persistent per-pet room choice. Main Room is implicit until a selection is saved.
-- Existing wall/floor/furniture rows, pets, progression and balances are untouched.
CREATE TABLE IF NOT EXISTS telegram_pet_house_rooms (
  pet_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  room_key TEXT NOT NULL CHECK(room_key IN ('main','kitchen','garden','gym')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id,telegram_id,season_key)
    REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_house_room_owner
  ON telegram_pet_house_rooms(telegram_id,pet_id,season_key);
