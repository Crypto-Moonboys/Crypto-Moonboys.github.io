-- Counts only. Safe to share; no player, pet or event identifiers are returned.
SELECT reason,COUNT(*) AS quarantined_receipts,
  COALESCE(SUM(pet_xp_awarded),0) AS quarantined_pet_xp
FROM moonpet_beta_xp_quarantine GROUP BY reason ORDER BY reason;

WITH owned_totals AS (
  SELECT i.telegram_id,SUM(i.pet_xp) AS all_time_xp
  FROM telegram_pet_instances i JOIN telegram_pet_season_slots s
    ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
    AND s.season_key=i.season_key AND s.slot_number=i.slot_number
  GROUP BY i.telegram_id
), visible_weeks AS (
  SELECT e.telegram_id,e.week_key,SUM(e.pet_xp_awarded) AS weekly_xp
  FROM telegram_pet_events e
  WHERE e.status='accepted' AND e.week_key<>''
    AND e.event_key<>'moonpet_wallet_reconcile:v1'
    AND NOT EXISTS (SELECT 1 FROM moonpet_beta_xp_quarantine q WHERE q.event_id=e.id)
  GROUP BY e.telegram_id,e.week_key
)
SELECT COUNT(*) AS visible_week_windows_above_retained_all_time
FROM visible_weeks w JOIN owned_totals t ON t.telegram_id=w.telegram_id
WHERE w.weekly_xp>t.all_time_xp;
