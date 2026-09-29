-- Beta-only correction of impossible season totals, authorized before launch.
-- This is a recorded rebaseline, not a reconstruction of missing history.
-- A season cannot contain more XP than all retained owned pets combined.
-- Only those impossible counters are reset to the retained pets of that season.
-- Pet XP/levels, wallets, items, rewards, daily/weekly receipts and Community XP
-- are untouched. Claimed rewards stay claimed. No synthetic XP is awarded.
-- Apply through D1 migrations so the snapshot and correction are atomic.

CREATE TABLE IF NOT EXISTS moonpet_beta_xp_rebaseline (
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  previous_season_xp INTEGER NOT NULL,
  retained_season_xp INTEGER NOT NULL,
  retained_all_time_xp INTEGER NOT NULL,
  accepted_receipt_xp INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  PRIMARY KEY (telegram_id, season_key)
);

WITH owned AS (
  SELECT i.telegram_id,i.season_key,i.pet_xp
  FROM telegram_pet_instances i JOIN telegram_pet_season_slots s
    ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
    AND s.season_key=i.season_key AND s.slot_number=i.slot_number
), totals AS (
  SELECT telegram_id,SUM(pet_xp) AS all_time_xp FROM owned GROUP BY telegram_id
)
INSERT OR IGNORE INTO moonpet_beta_xp_rebaseline
  (telegram_id,season_key,previous_season_xp,retained_season_xp,retained_all_time_xp,accepted_receipt_xp)
SELECT s.telegram_id,s.season_key,s.season_xp,
  COALESCE((SELECT SUM(o.pet_xp) FROM owned o WHERE o.telegram_id=s.telegram_id AND o.season_key=s.season_key),0),
  t.all_time_xp,
  COALESCE((SELECT SUM(e.pet_xp_awarded) FROM telegram_pet_events e
    WHERE e.telegram_id=s.telegram_id AND e.season_key=s.season_key
      AND e.status='accepted' AND e.event_key<>'moonpet_wallet_reconcile:v1'),0)
FROM telegram_pet_season_state s JOIN totals t ON t.telegram_id=s.telegram_id
WHERE s.season_xp>t.all_time_xp;

UPDATE telegram_pet_season_state AS s
SET season_xp=(SELECT a.retained_season_xp FROM moonpet_beta_xp_rebaseline a
  WHERE a.telegram_id=s.telegram_id AND a.season_key=s.season_key)
WHERE EXISTS (SELECT 1 FROM moonpet_beta_xp_rebaseline a
  WHERE a.telegram_id=s.telegram_id AND a.season_key=s.season_key
    AND a.applied_at IS NULL AND s.season_xp=a.previous_season_xp);

UPDATE moonpet_beta_xp_rebaseline SET applied_at=CURRENT_TIMESTAMP
WHERE applied_at IS NULL AND EXISTS (SELECT 1 FROM telegram_pet_season_state s
  WHERE s.telegram_id=moonpet_beta_xp_rebaseline.telegram_id
    AND s.season_key=moonpet_beta_xp_rebaseline.season_key
    AND s.season_xp=moonpet_beta_xp_rebaseline.retained_season_xp);
