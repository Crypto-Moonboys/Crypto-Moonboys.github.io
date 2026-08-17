-- Bounded Roguelite and Daily Moon Run instance authority.
-- Nullable columns preserve readability of pre-cutover runtime rows.

ALTER TABLE telegram_pet_runs ADD COLUMN pet_id TEXT;
ALTER TABLE telegram_pet_run_steps ADD COLUMN pet_id TEXT;
ALTER TABLE telegram_pet_run_rooms ADD COLUMN pet_id TEXT;
ALTER TABLE telegram_pet_run_modifiers ADD COLUMN pet_id TEXT;
ALTER TABLE telegram_pet_run_history ADD COLUMN pet_id TEXT;
ALTER TABLE telegram_pet_run_analytics ADD COLUMN pet_id TEXT;
ALTER TABLE telegram_pet_daily_runs ADD COLUMN pet_id TEXT;
ALTER TABLE telegram_pet_daily_analytics ADD COLUMN pet_id TEXT;

CREATE INDEX IF NOT EXISTS idx_telegram_pet_runs_pet_status
  ON telegram_pet_runs(pet_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_run_steps_pet
  ON telegram_pet_run_steps(pet_id, run_id, step_index);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_run_rooms_pet
  ON telegram_pet_run_rooms(pet_id, run_id, room_number);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_run_analytics_pet
  ON telegram_pet_run_analytics(pet_id, run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_runs_pet_day
  ON telegram_pet_daily_runs(pet_id, utc_day);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_analytics_pet
  ON telegram_pet_daily_analytics(pet_id, utc_day, created_at);
