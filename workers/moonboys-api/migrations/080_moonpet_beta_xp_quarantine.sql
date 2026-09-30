-- Preserve unverifiable beta Pet XP receipts for audit while excluding them
-- from public daily/weekly rankings and activity. This does not delete events,
-- reduce retained pet XP, change wallets or replay rewards.

CREATE TABLE IF NOT EXISTS moonpet_beta_xp_quarantine (
  event_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  pet_id TEXT,
  season_key TEXT NOT NULL,
  pet_xp_awarded INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('missing_pet_authority','receipt_total_exceeds_retained_pet_xp')),
  quarantined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_moonpet_beta_xp_quarantine_owner
  ON moonpet_beta_xp_quarantine(telegram_id,season_key,reason);

-- Once an account has per-pet authority, a receipt must resolve to an exact
-- retained pet/owner/season slot. Legacy accounts with no instance rows retain
-- their historical account-scoped receipts and profile fallback.
INSERT OR IGNORE INTO moonpet_beta_xp_quarantine
  (event_id,telegram_id,pet_id,season_key,pet_xp_awarded,reason)
SELECT e.id,e.telegram_id,e.pet_id,e.season_key,e.pet_xp_awarded,'missing_pet_authority'
FROM telegram_pet_events e
WHERE e.status='accepted' AND e.pet_xp_awarded>0
  AND e.event_key<>'moonpet_wallet_reconcile:v1'
  AND EXISTS (SELECT 1 FROM telegram_pet_instances any_pet WHERE any_pet.telegram_id=e.telegram_id)
  AND NOT EXISTS (
    SELECT 1 FROM telegram_pet_instances i
    JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
      AND s.season_key=i.season_key AND s.slot_number=i.slot_number
    WHERE i.pet_id=e.pet_id AND i.telegram_id=e.telegram_id AND i.season_key=e.season_key
  );

-- If attributed accepted receipts exceed the retained pet total, the beta
-- history cannot identify which receipt or baseline is wrong. Quarantine the
-- complete historical tuple instead of guessing a partial trim.
WITH receipt_totals AS (
  SELECT e.telegram_id,e.pet_id,e.season_key,SUM(e.pet_xp_awarded) AS receipt_xp
  FROM telegram_pet_events e
  WHERE e.status='accepted' AND e.pet_xp_awarded>0
    AND e.event_key<>'moonpet_wallet_reconcile:v1' AND e.pet_id IS NOT NULL
  GROUP BY e.telegram_id,e.pet_id,e.season_key
), impossible AS (
  SELECT r.telegram_id,r.pet_id,r.season_key
  FROM receipt_totals r
  JOIN telegram_pet_instances i ON i.pet_id=r.pet_id AND i.telegram_id=r.telegram_id AND i.season_key=r.season_key
  JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
    AND s.season_key=i.season_key AND s.slot_number=i.slot_number
  WHERE r.receipt_xp>i.pet_xp
)
INSERT OR IGNORE INTO moonpet_beta_xp_quarantine
  (event_id,telegram_id,pet_id,season_key,pet_xp_awarded,reason)
SELECT e.id,e.telegram_id,e.pet_id,e.season_key,e.pet_xp_awarded,'receipt_total_exceeds_retained_pet_xp'
FROM telegram_pet_events e JOIN impossible x
  ON x.telegram_id=e.telegram_id AND x.pet_id=e.pet_id AND x.season_key=e.season_key
WHERE e.status='accepted' AND e.pet_xp_awarded>0
  AND e.event_key<>'moonpet_wallet_reconcile:v1';
