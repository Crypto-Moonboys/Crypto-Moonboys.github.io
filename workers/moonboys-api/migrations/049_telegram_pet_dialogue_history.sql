-- Stores a small, bounded record of player-facing Moonpet lines so the
-- deterministic reaction engine can avoid recently used dialogue.

CREATE TABLE telegram_pet_dialogue_history (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  context TEXT NOT NULL CHECK (length(context) BETWEEN 1 AND 40),
  reaction_key TEXT NOT NULL CHECK (length(reaction_key) BETWEEN 1 AND 100),
  reaction_text TEXT NOT NULL CHECK (length(reaction_text) BETWEEN 1 AND 500),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX idx_telegram_pet_dialogue_history_owner
  ON telegram_pet_dialogue_history (telegram_id, created_at DESC);
