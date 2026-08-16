-- Append-only, pet-instance season journey evidence and completion history.
CREATE TABLE IF NOT EXISTS telegram_pet_growth_marks (
  mark_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  milestone_type TEXT NOT NULL,
  evidence_key TEXT NOT NULL,
  earned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, season_key, milestone_type, evidence_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id)
);

CREATE TABLE IF NOT EXISTS telegram_pet_weekly_crests (
  crest_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  season_week INTEGER NOT NULL CHECK (season_week BETWEEN 1 AND 13),
  objective_id TEXT NOT NULL,
  evidence_key TEXT NOT NULL,
  earned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, season_key, season_week, objective_id),
  UNIQUE (pet_id, season_key, evidence_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id)
);

CREATE TABLE IF NOT EXISTS telegram_pet_season_completions (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  legendary_evolution_id TEXT NOT NULL,
  growth_marks_earned INTEGER NOT NULL,
  weekly_crests_earned INTEGER NOT NULL,
  authority_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (pet_id, season_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id)
);

CREATE INDEX IF NOT EXISTS idx_pet_growth_marks_owner ON telegram_pet_growth_marks(telegram_id, season_key, pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_weekly_crests_owner ON telegram_pet_weekly_crests(telegram_id, season_key, pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_completions_owner ON telegram_pet_season_completions(telegram_id, season_key, completed_at);
