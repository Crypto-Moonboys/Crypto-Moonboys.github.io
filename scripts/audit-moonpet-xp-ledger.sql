-- READ ONLY. Diagnostic evidence, not an automatic repair or an XP award.
-- Results contain private account/pet keys; keep the output out of public PRs.
-- No rows in the first query does not prove complete history: legacy XP can
-- predate attributed receipts. Never replace stored XP with a raw event sum.

-- A retained owned pet should not hold less XP than its accepted attributed
-- rewards. This reports a lower-bound discrepancy without inventing a baseline.
WITH receipts AS (
  SELECT telegram_id,pet_id,season_key,SUM(pet_xp_awarded) AS receipt_xp
  FROM telegram_pet_events
  WHERE status='accepted' AND event_key<>'moonpet_wallet_reconcile:v1'
    AND pet_id IS NOT NULL
  GROUP BY telegram_id,pet_id,season_key
)
SELECT i.telegram_id,i.pet_id,i.season_key,i.pet_xp AS stored_pet_xp,
  r.receipt_xp,r.receipt_xp-i.pet_xp AS minimum_shortfall
FROM telegram_pet_instances i
JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
  AND s.season_key=i.season_key AND s.slot_number=i.slot_number
JOIN receipts r ON r.pet_id=i.pet_id AND r.telegram_id=i.telegram_id AND r.season_key=i.season_key
WHERE r.receipt_xp>i.pet_xp ORDER BY minimum_shortfall DESC;

-- Compare season counters with retained receipts. Differences require history
-- review; a legacy baseline, incomplete ledger or old duplicate counter can
-- also cause a discrepancy. Neither side is blindly treated as the repair value.
WITH receipts AS (
  SELECT telegram_id,season_key,SUM(pet_xp_awarded) AS receipt_xp
  FROM telegram_pet_events
  WHERE status='accepted' AND event_key<>'moonpet_wallet_reconcile:v1'
  GROUP BY telegram_id,season_key
), keys AS (
  SELECT telegram_id,season_key FROM telegram_pet_season_state
  UNION SELECT telegram_id,season_key FROM receipts
)
SELECT k.telegram_id,k.season_key,COALESCE(s.season_xp,0) AS stored_season_xp,
  COALESCE(r.receipt_xp,0) AS receipt_xp
FROM keys k
LEFT JOIN telegram_pet_season_state s ON s.telegram_id=k.telegram_id AND s.season_key=k.season_key
LEFT JOIN receipts r ON r.telegram_id=k.telegram_id AND r.season_key=k.season_key
WHERE COALESCE(s.season_xp,0)<>COALESCE(r.receipt_xp,0);

-- Identify legacy/unowned XP which public season/day counters may include but
-- cannot safely be assigned to a retained pet without original evidence.
SELECT e.telegram_id,e.pet_id,e.season_key,COUNT(*) AS receipt_count,
  SUM(e.pet_xp_awarded) AS unattributed_xp
FROM telegram_pet_events e
WHERE e.status='accepted' AND e.pet_xp_awarded>0 AND e.event_key<>'moonpet_wallet_reconcile:v1'
  AND NOT EXISTS (SELECT 1 FROM telegram_pet_instances i
    JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
      AND s.season_key=i.season_key AND s.slot_number=i.slot_number
    WHERE i.pet_id=e.pet_id AND i.telegram_id=e.telegram_id AND i.season_key=e.season_key)
GROUP BY e.telegram_id,e.pet_id,e.season_key;
