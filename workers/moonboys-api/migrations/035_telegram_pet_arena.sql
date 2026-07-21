-- Pet Arena battles for Crypto Moonboy Pets.
ALTER TABLE telegram_pet_profiles ADD COLUMN equipped_armor TEXT;
ALTER TABLE telegram_pet_profiles ADD COLUMN equipped_weapon TEXT;
ALTER TABLE telegram_pet_profiles ADD COLUMN equipped_charm TEXT;

CREATE TABLE IF NOT EXISTS telegram_pet_arena_queue (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  rank_bucket TEXT NOT NULL,
  pet_snapshot_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'waiting',
  accept_any_rank INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_arena_queue_one_waiting
  ON telegram_pet_arena_queue(chat_id, telegram_id)
  WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_pet_arena_queue_match
  ON telegram_pet_arena_queue(chat_id, status, rank_bucket, created_at);

CREATE TABLE IF NOT EXISTS telegram_pet_arena_battles (
  id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL,
  player1_telegram_id TEXT NOT NULL,
  player2_telegram_id TEXT,
  player1_pet_snapshot_json TEXT NOT NULL,
  player2_pet_snapshot_json TEXT NOT NULL,
  player1_power INTEGER NOT NULL DEFAULT 0,
  player2_power INTEGER NOT NULL DEFAULT 0,
  winner_telegram_id TEXT,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'readying',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pet_arena_battles_chat_status_rank_created
  ON telegram_pet_arena_battles(chat_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_arena_battles_p1_active
  ON telegram_pet_arena_battles(chat_id, player1_telegram_id)
  WHERE status IN ('readying', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_arena_battles_p2_active
  ON telegram_pet_arena_battles(chat_id, player2_telegram_id)
  WHERE status IN ('readying', 'active') AND player2_telegram_id IS NOT NULL AND player2_telegram_id <> 'app';
