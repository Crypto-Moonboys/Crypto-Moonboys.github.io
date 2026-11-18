-- Beta measurements only. Thirds represent partial care without rounding debt.
CREATE TABLE IF NOT EXISTS moonpet_care_shadow_days (
  telegram_id TEXT NOT NULL REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  day_key TEXT NOT NULL,
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version = 1),
  pet_id TEXT,
  observed_slots INTEGER NOT NULL DEFAULT 0,
  exempt_reason TEXT,
  care_mask INTEGER CHECK (care_mask BETWEEN 0 AND 7),
  gross_pet_xp INTEGER CHECK (gross_pet_xp >= 0),
  missed_streak INTEGER CHECK (missed_streak >= 0),
  debt_thirds INTEGER CHECK (debt_thirds BETWEEN 0 AND 4620),
  estimated_withheld_xp REAL CHECK (estimated_withheld_xp >= 0),
  settled_at TEXT,
  PRIMARY KEY (telegram_id, policy_version, day_key)
);

CREATE INDEX IF NOT EXISTS idx_moonpet_shadow_open
  ON moonpet_care_shadow_days(telegram_id, day_key) WHERE settled_at IS NULL;

-- Operations can register known UTC incidents before the daily calculation.
-- '*' covers the entire pilot, otherwise scope the incident to one owner.
CREATE TABLE IF NOT EXISTS moonpet_care_shadow_exclusions (
  day_key TEXT NOT NULL,
  owner_scope TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  PRIMARY KEY (day_key, owner_scope)
);
