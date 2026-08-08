CREATE TABLE IF NOT EXISTS telegram_pet_repeat_reward_slots (
  telegram_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  mode TEXT NOT NULL,
  claimed_count INTEGER NOT NULL DEFAULT 0 CHECK (claimed_count >= 0),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, day_key, mode)
);

CREATE INDEX IF NOT EXISTS idx_pet_repeat_reward_slots_day_mode
  ON telegram_pet_repeat_reward_slots(day_key, mode);
