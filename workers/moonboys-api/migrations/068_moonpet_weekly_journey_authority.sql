-- Per-pet Weekly Journey qualification receipts.
-- Additive only: objective evidence is recorded before a deterministic
-- pet/week receipt can authorize the existing Weekly Crest authority.

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_completion_tuple
  ON telegram_pet_season_slots(pet_id, telegram_id, season_key);

CREATE TABLE IF NOT EXISTS telegram_pet_weekly_journey_objectives (
  event_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  qualification_week INTEGER NOT NULL CHECK (qualification_week BETWEEN 1 AND 13),
  objective_id TEXT NOT NULL,
  source_event_key TEXT NOT NULL,
  source_event_type TEXT NOT NULL,
  progress_value INTEGER NOT NULL CHECK (progress_value >= 0),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  evidence TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, season_key, qualification_week, objective_id, source_event_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_weekly_journey_receipts (
  receipt_id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  qualification_week INTEGER NOT NULL CHECK (qualification_week BETWEEN 1 AND 13),
  completed_objectives INTEGER NOT NULL CHECK (completed_objectives >= 0),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  reason TEXT NOT NULL,
  crest_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_key, status),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_weekly_journey_objectives_pet_week
  ON telegram_pet_weekly_journey_objectives(pet_id, season_key, qualification_week, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_weekly_journey_objectives_source
  ON telegram_pet_weekly_journey_objectives(source_event_key, pet_id, season_key, qualification_week);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_weekly_journey_receipts_pet_week
  ON telegram_pet_weekly_journey_receipts(pet_id, season_key, qualification_week, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_weekly_journey_receipts_event_status
  ON telegram_pet_weekly_journey_receipts(event_key, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_weekly_journey_receipts_crest
  ON telegram_pet_weekly_journey_receipts(crest_id, pet_id, season_key, qualification_week);
