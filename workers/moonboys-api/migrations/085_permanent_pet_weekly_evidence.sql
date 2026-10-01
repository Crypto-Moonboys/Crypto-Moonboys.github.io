-- Permanent pets keep earning new weekly evidence after their creation quarter.
-- Rebuild only leaf tables; retain every receipt, legacy nullable qualification key,
-- ownership foreign key and uniqueness rule. D1 applies each migration atomically.

CREATE TABLE telegram_pet_weekly_crests_permanent (
  crest_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  season_week INTEGER NOT NULL CHECK (season_week >= 1),
  objective_id TEXT NOT NULL,
  evidence_key TEXT NOT NULL,
  earned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  qualification_week INTEGER,
  UNIQUE (pet_id, season_key, season_week, objective_id),
  UNIQUE (pet_id, season_key, evidence_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);
INSERT INTO telegram_pet_weekly_crests_permanent (crest_id, pet_id, telegram_id, season_key, season_week, objective_id, evidence_key, earned_at, qualification_week)
  SELECT crest_id, pet_id, telegram_id, season_key, season_week, objective_id, evidence_key, earned_at, qualification_week FROM telegram_pet_weekly_crests;
DROP TABLE telegram_pet_weekly_crests;
ALTER TABLE telegram_pet_weekly_crests_permanent RENAME TO telegram_pet_weekly_crests;

CREATE TABLE telegram_pet_weekly_journey_objectives_permanent (
  event_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  qualification_week INTEGER NOT NULL CHECK (qualification_week >= 1),
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
INSERT INTO telegram_pet_weekly_journey_objectives_permanent (event_id, telegram_id, pet_id, season_key, qualification_week, objective_id, source_event_key, source_event_type, progress_value, status, evidence, created_at)
  SELECT event_id, telegram_id, pet_id, season_key, qualification_week, objective_id, source_event_key, source_event_type, progress_value, status, evidence, created_at FROM telegram_pet_weekly_journey_objectives;
DROP TABLE telegram_pet_weekly_journey_objectives;
ALTER TABLE telegram_pet_weekly_journey_objectives_permanent RENAME TO telegram_pet_weekly_journey_objectives;

CREATE TABLE telegram_pet_weekly_journey_receipts_permanent (
  receipt_id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  qualification_week INTEGER NOT NULL CHECK (qualification_week >= 1),
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
INSERT INTO telegram_pet_weekly_journey_receipts_permanent (receipt_id, event_key, telegram_id, pet_id, season_key, qualification_week, completed_objectives, status, reason, crest_id, created_at)
  SELECT receipt_id, event_key, telegram_id, pet_id, season_key, qualification_week, completed_objectives, status, reason, crest_id, created_at FROM telegram_pet_weekly_journey_receipts;
DROP TABLE telegram_pet_weekly_journey_receipts;
ALTER TABLE telegram_pet_weekly_journey_receipts_permanent RENAME TO telegram_pet_weekly_journey_receipts;

CREATE INDEX idx_pet_weekly_crests_owner ON telegram_pet_weekly_crests(telegram_id, season_key, pet_id);
CREATE UNIQUE INDEX idx_pet_weekly_crests_one_per_week ON telegram_pet_weekly_crests(pet_id, season_key, qualification_week) WHERE qualification_week IS NOT NULL;
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
