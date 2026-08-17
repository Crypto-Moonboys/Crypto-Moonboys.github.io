-- Add calendar qualification keys without deleting historical beta evidence.
-- Only the first historical row for a pet/day or pet/week is qualified; all
-- new settlements always provide these keys and are protected by uniqueness.
ALTER TABLE telegram_pet_growth_marks ADD COLUMN earned_day TEXT;
ALTER TABLE telegram_pet_weekly_crests ADD COLUMN qualification_week INTEGER;

UPDATE telegram_pet_growth_marks AS mark
SET earned_day = substr(earned_at, 1, 10)
WHERE mark_id = (
  SELECT first.mark_id FROM telegram_pet_growth_marks AS first
  WHERE first.pet_id=mark.pet_id AND first.season_key=mark.season_key
    AND substr(first.earned_at, 1, 10)=substr(mark.earned_at, 1, 10)
  ORDER BY first.earned_at, first.mark_id LIMIT 1
);

UPDATE telegram_pet_weekly_crests AS crest
SET qualification_week = season_week
WHERE crest_id = (
  SELECT first.crest_id FROM telegram_pet_weekly_crests AS first
  WHERE first.pet_id=crest.pet_id AND first.season_key=crest.season_key
    AND first.season_week=crest.season_week
  ORDER BY first.earned_at, first.crest_id LIMIT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_growth_marks_one_per_utc_day
  ON telegram_pet_growth_marks(pet_id, season_key, earned_day)
  WHERE earned_day IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_weekly_crests_one_per_week
  ON telegram_pet_weekly_crests(pet_id, season_key, qualification_week)
  WHERE qualification_week IS NOT NULL;
