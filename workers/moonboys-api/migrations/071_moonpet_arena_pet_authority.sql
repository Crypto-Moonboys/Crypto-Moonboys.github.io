-- Persist Pet Arena participant authority from queue through settlement.
ALTER TABLE telegram_pet_arena_queue ADD COLUMN pet_id TEXT;
ALTER TABLE telegram_pet_arena_queue ADD COLUMN season_key TEXT;

ALTER TABLE telegram_pet_arena_battles ADD COLUMN player1_pet_id TEXT;
ALTER TABLE telegram_pet_arena_battles ADD COLUMN player1_season_key TEXT;
ALTER TABLE telegram_pet_arena_battles ADD COLUMN player2_pet_id TEXT;
ALTER TABLE telegram_pet_arena_battles ADD COLUMN player2_season_key TEXT;
