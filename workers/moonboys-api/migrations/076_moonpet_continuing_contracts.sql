-- Continuing play has its own pet-owned record. Economic rewards remain capped.
CREATE TABLE IF NOT EXISTS telegram_pet_contracts (
  contract_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'failed', 'abandoned')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  rank_points INTEGER NOT NULL DEFAULT 0 CHECK (rank_points >= 0),
  reward_xp INTEGER NOT NULL DEFAULT 0 CHECK (reward_xp IN (0, 20)),
  reward_day TEXT,
  reward_settled INTEGER NOT NULL DEFAULT 0 CHECK (reward_settled IN (0, 1)),
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded BETWEEN 0 AND 20),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, sequence),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key) REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_contract_active ON telegram_pet_contracts(pet_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_pet_contract_owner_pet ON telegram_pet_contracts(telegram_id, pet_id, season_key, sequence);
CREATE INDEX IF NOT EXISTS idx_pet_contract_bonus_day ON telegram_pet_contracts(telegram_id, reward_day, reward_xp);
