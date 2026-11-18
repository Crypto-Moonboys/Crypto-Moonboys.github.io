ALTER TABLE telegram_pet_events ADD COLUMN pet_xp_withheld INTEGER NOT NULL DEFAULT 0 CHECK (pet_xp_withheld >= 0);
ALTER TABLE telegram_pet_events ADD COLUMN care_policy INTEGER NOT NULL DEFAULT 0 CHECK (care_policy IN (0,1));

CREATE TABLE IF NOT EXISTS moonpet_care_xp_charges (
  sequence INTEGER PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES telegram_pet_events(id) ON DELETE CASCADE,
  telegram_id TEXT NOT NULL REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  numerator INTEGER NOT NULL CHECK (numerator >= 0)
);
CREATE INDEX IF NOT EXISTS idx_care_charge_owner ON moonpet_care_xp_charges(telegram_id,sequence DESC);

CREATE VIEW IF NOT EXISTS moonpet_care_award_rates AS
SELECT e.id,e.telegram_id,e.pet_xp_awarded, (
  SELECT d.debt_thirds FROM moonpet_care_shadow_days d
  WHERE d.telegram_id=e.telegram_id AND d.policy_version=1 AND d.day_key<e.day_key
    AND julianday(d.settled_at)<julianday(e.day_key)
  ORDER BY d.day_key DESC LIMIT 1
) AS debt
FROM telegram_pet_events e
JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=e.pet_id AND l.telegram_id=e.telegram_id
WHERE e.care_policy=1 AND e.pet_xp_awarded>0 AND l.phase<>'egg'
  AND date(l.hatched_at)<e.day_key AND NOT EXISTS (
  SELECT 1 FROM moonpet_care_shadow_exclusions x
  WHERE x.day_key=e.day_key AND x.owner_scope IN ('*',e.telegram_id));

CREATE TRIGGER IF NOT EXISTS moonpet_care_charge_apply AFTER INSERT ON moonpet_care_xp_charges
BEGIN
  UPDATE telegram_pet_events SET pet_xp_withheld=NEW.numerator/15400,
    pet_xp_awarded=pet_xp_awarded-NEW.numerator/15400 WHERE id=NEW.event_id;
END;

CREATE TRIGGER IF NOT EXISTS moonpet_care_charge_insert AFTER INSERT ON telegram_pet_events
WHEN NEW.care_policy=1 AND NEW.pet_xp_awarded>0
BEGIN
  INSERT INTO moonpet_care_xp_charges(event_id,telegram_id,numerator)
  SELECT r.id,r.telegram_id,r.pet_xp_awarded*(1540+min(2310,r.debt))+coalesce((
    SELECT c.numerator%15400 FROM moonpet_care_xp_charges c WHERE c.telegram_id=r.telegram_id
    ORDER BY c.sequence DESC LIMIT 1),0)
  FROM moonpet_care_award_rates r WHERE r.id=NEW.id AND r.debt>0
  ON CONFLICT(event_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS moonpet_care_charge_claim AFTER UPDATE OF care_policy ON telegram_pet_events
WHEN NEW.care_policy=1 AND NEW.pet_xp_awarded>0
BEGIN
  INSERT INTO moonpet_care_xp_charges(event_id,telegram_id,numerator)
  SELECT r.id,r.telegram_id,r.pet_xp_awarded*(1540+min(2310,r.debt))+coalesce((
    SELECT c.numerator%15400 FROM moonpet_care_xp_charges c WHERE c.telegram_id=r.telegram_id
    ORDER BY c.sequence DESC LIMIT 1),0)
  FROM moonpet_care_award_rates r WHERE r.id=NEW.id AND r.debt>0
  ON CONFLICT(event_id) DO NOTHING;
END;
