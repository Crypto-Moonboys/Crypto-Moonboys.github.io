-- Additive room arrangements; existing furniture ownership/placements are retained.
CREATE TABLE IF NOT EXISTS telegram_pet_room_furniture (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  room_key TEXT NOT NULL CHECK(room_key IN ('main','kitchen','garden','gym')),
  items_json TEXT NOT NULL CHECK(json_valid(items_json) AND json_type(items_json)='array' AND json_array_length(items_json)<=8),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(pet_id,room_key),
  FOREIGN KEY(pet_id,telegram_id,season_key) REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_room_furniture_owner ON telegram_pet_room_furniture(telegram_id,pet_id,season_key);
