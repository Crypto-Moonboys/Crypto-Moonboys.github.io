-- Turn-based Pet Arena V2 state.
ALTER TABLE telegram_pet_arena_battles ADD COLUMN current_round INTEGER NOT NULL DEFAULT 1;
ALTER TABLE telegram_pet_arena_battles ADD COLUMN max_rounds INTEGER NOT NULL DEFAULT 8;
ALTER TABLE telegram_pet_arena_battles ADD COLUMN player1_hp INTEGER NOT NULL DEFAULT 100;
ALTER TABLE telegram_pet_arena_battles ADD COLUMN player2_hp INTEGER NOT NULL DEFAULT 100;
ALTER TABLE telegram_pet_arena_battles ADD COLUMN player1_special INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_pet_arena_battles ADD COLUMN player2_special INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_pet_arena_battles ADD COLUMN last_round_log_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE telegram_pet_arena_battles ADD COLUMN expires_at TEXT;

CREATE TABLE IF NOT EXISTS telegram_pet_arena_rounds (
  id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  player1_move TEXT,
  player2_move TEXT,
  player1_damage INTEGER NOT NULL DEFAULT 0,
  player2_damage INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'selecting',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  UNIQUE(battle_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_pet_arena_rounds_battle_status
  ON telegram_pet_arena_rounds(battle_id, status, round_number);
