-- Keep index DDL separate from the table definition for the remote D1 migration runner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_sanctuary_pet
  ON telegram_pet_sanctuary(pet_id);

CREATE INDEX IF NOT EXISTS idx_pet_sanctuary_owner_completed
  ON telegram_pet_sanctuary(telegram_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pet_sanctuary_completion_link
  ON telegram_pet_sanctuary(pet_id, original_season_key);
