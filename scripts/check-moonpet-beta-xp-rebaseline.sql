-- Counts only: safe to share without player IDs or private reward metadata.
SELECT COUNT(*) AS corrected_counters,
  COALESCE(SUM(CASE WHEN applied_at IS NULL THEN 1 ELSE 0 END),0) AS pending_corrections
FROM moonpet_beta_xp_rebaseline;

WITH owned_totals AS (
  SELECT i.telegram_id,SUM(i.pet_xp) AS all_time_xp
  FROM telegram_pet_instances i JOIN telegram_pet_season_slots s
    ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
    AND s.season_key=i.season_key AND s.slot_number=i.slot_number
  GROUP BY i.telegram_id
)
SELECT COUNT(*) AS impossible_season_totals
FROM telegram_pet_season_state s JOIN owned_totals t ON t.telegram_id=s.telegram_id
WHERE s.season_xp>t.all_time_xp;
