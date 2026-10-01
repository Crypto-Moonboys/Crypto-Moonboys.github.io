-- Restore only automatic Sanctuary archives with matching ownership/completion proof.
-- Keep IDs, creation-season tuples, XP, purchases, active pointers and snapshots intact.
-- Explicitly retired pets and archives without matching proof remain untouched.
UPDATE telegram_pet_instances AS i SET status='active'
WHERE i.status='archived' AND EXISTS (
  SELECT 1 FROM telegram_pet_season_slots s
  JOIN telegram_pet_sanctuary h ON h.pet_id=s.pet_id AND h.telegram_id=s.telegram_id
    AND h.original_season_key=s.season_key AND h.status='resident'
  JOIN telegram_pet_season_completions c ON c.pet_id=s.pet_id AND c.telegram_id=s.telegram_id
    AND c.season_key=s.season_key
  WHERE s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key
    AND s.slot_number=i.slot_number AND s.status IN ('active','archived')
);
UPDATE telegram_pet_season_slots AS s SET status='active'
WHERE s.status='archived' AND EXISTS (
  SELECT 1 FROM telegram_pet_instances i
  JOIN telegram_pet_sanctuary h ON h.pet_id=i.pet_id AND h.telegram_id=i.telegram_id
    AND h.original_season_key=i.season_key AND h.status='resident'
  JOIN telegram_pet_season_completions c ON c.pet_id=i.pet_id AND c.telegram_id=i.telegram_id
    AND c.season_key=i.season_key
  WHERE i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id AND i.season_key=s.season_key
    AND i.slot_number=s.slot_number AND i.status='active'
);
CREATE INDEX IF NOT EXISTS idx_pet_slots_owner_active_order
  ON telegram_pet_season_slots(telegram_id, status, created_at, pet_id);
