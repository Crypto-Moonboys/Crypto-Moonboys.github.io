-- Per-pet Daily Journey qualification receipts.
-- This is append-only and keeps Daily Moon Run pet_id reservations authoritative
-- without rebuilding the older account-level daily summary tables.

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_completion_tuple
  ON telegram_pet_season_slots(pet_id, telegram_id, season_key);

CREATE TABLE IF NOT EXISTS telegram_pet_daily_journey_objectives (
  event_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  utc_day TEXT NOT NULL CHECK (utc_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  challenge_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  progress_value INTEGER NOT NULL CHECK (progress_value >= 0),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  evidence TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, season_key, utc_day, challenge_id, event_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_daily_journey_receipts (
  receipt_id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  utc_day TEXT NOT NULL CHECK (utc_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  completed_objectives INTEGER NOT NULL CHECK (completed_objectives >= 0),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  reason TEXT NOT NULL,
  growth_mark_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_journey_objectives_pet_day
  ON telegram_pet_daily_journey_objectives(pet_id, season_key, utc_day, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_journey_receipts_pet_day
  ON telegram_pet_daily_journey_receipts(pet_id, season_key, utc_day, status);
