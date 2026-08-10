-- Atomic daily reward-slot counters for repeatable Telegram Pet modes.
CREATE TABLE IF NOT EXISTS telegram_pet_repeat_reward_slots (
  telegram_id   TEXT NOT NULL,
  day_key       TEXT NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('event', 'kaiju')),
  claimed_count INTEGER NOT NULL DEFAULT 0 CHECK (claimed_count >= 0),
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, day_key, mode),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_repeat_reward_slots_day_mode
  ON telegram_pet_repeat_reward_slots(day_key, mode);
