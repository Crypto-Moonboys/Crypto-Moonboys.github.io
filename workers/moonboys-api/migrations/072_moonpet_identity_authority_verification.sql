-- Read-only Moonpet identity authority verifier.
-- A production check of this view must return zero rows before future systems
-- build on Moonpet identity state.

DROP VIEW IF EXISTS moonpet_invalid_identity_authority_rows;

CREATE VIEW moonpet_invalid_identity_authority_rows AS
  SELECT 'telegram_pet_memories' AS table_name, r.pet_id, r.telegram_id, r.season_key, r.pet_id AS row_key,
         CASE
           WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
           WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
           WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
           WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
           WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
           ELSE 'authority_tuple_mismatch'
         END AS reason
  FROM telegram_pet_memories r
  LEFT JOIN telegram_pet_season_slots s
    ON s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  LEFT JOIN telegram_pet_instances i
    ON i.pet_id = r.pet_id AND i.telegram_id = r.telegram_id AND i.season_key = r.season_key
  WHERE r.pet_id IS NULL OR r.pet_id = ''
     OR r.telegram_id IS NULL OR r.telegram_id = ''
     OR r.season_key IS NULL OR r.season_key = ''
     OR s.pet_id IS NULL
     OR i.pet_id IS NULL
     OR s.slot_number <> i.slot_number
  UNION ALL
  SELECT 'telegram_pet_personality_traits', r.pet_id, r.telegram_id, r.season_key, r.pet_id || ':' || r.trait_id,
         CASE
           WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
           WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
           WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
           WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
           WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
           ELSE 'authority_tuple_mismatch'
         END
  FROM telegram_pet_personality_traits r
  LEFT JOIN telegram_pet_season_slots s
    ON s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  LEFT JOIN telegram_pet_instances i
    ON i.pet_id = r.pet_id AND i.telegram_id = r.telegram_id AND i.season_key = r.season_key
  WHERE r.pet_id IS NULL OR r.pet_id = ''
     OR r.telegram_id IS NULL OR r.telegram_id = ''
     OR r.season_key IS NULL OR r.season_key = ''
     OR s.pet_id IS NULL
     OR i.pet_id IS NULL
     OR s.slot_number <> i.slot_number
  UNION ALL
  SELECT 'telegram_pet_boss_victories', r.pet_id, r.telegram_id, r.season_key, r.pet_id || ':' || r.boss_id,
         CASE
           WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
           WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
           WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
           WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
           WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
           ELSE 'authority_tuple_mismatch'
         END
  FROM telegram_pet_boss_victories r
  LEFT JOIN telegram_pet_season_slots s
    ON s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  LEFT JOIN telegram_pet_instances i
    ON i.pet_id = r.pet_id AND i.telegram_id = r.telegram_id AND i.season_key = r.season_key
  WHERE r.pet_id IS NULL OR r.pet_id = ''
     OR r.telegram_id IS NULL OR r.telegram_id = ''
     OR r.season_key IS NULL OR r.season_key = ''
     OR s.pet_id IS NULL
     OR i.pet_id IS NULL
     OR s.slot_number <> i.slot_number
  UNION ALL
  SELECT 'telegram_pet_identity_events', r.pet_id, r.telegram_id, r.season_key, r.event_id,
         CASE
           WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
           WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
           WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
           WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
           WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
           ELSE 'authority_tuple_mismatch'
         END
  FROM telegram_pet_identity_events r
  LEFT JOIN telegram_pet_season_slots s
    ON s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  LEFT JOIN telegram_pet_instances i
    ON i.pet_id = r.pet_id AND i.telegram_id = r.telegram_id AND i.season_key = r.season_key
  WHERE r.pet_id IS NULL OR r.pet_id = ''
     OR r.telegram_id IS NULL OR r.telegram_id = ''
     OR r.season_key IS NULL OR r.season_key = ''
     OR s.pet_id IS NULL
     OR i.pet_id IS NULL
     OR s.slot_number <> i.slot_number
  UNION ALL
  SELECT 'telegram_pet_identity_analytics', r.pet_id, r.telegram_id, r.season_key, r.analytics_id,
         CASE
           WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
           WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
           WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
           WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
           WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
           ELSE 'authority_tuple_mismatch'
         END
  FROM telegram_pet_identity_analytics r
  LEFT JOIN telegram_pet_season_slots s
    ON s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  LEFT JOIN telegram_pet_instances i
    ON i.pet_id = r.pet_id AND i.telegram_id = r.telegram_id AND i.season_key = r.season_key
  WHERE r.pet_id IS NULL OR r.pet_id = ''
     OR r.telegram_id IS NULL OR r.telegram_id = ''
     OR r.season_key IS NULL OR r.season_key = ''
     OR s.pet_id IS NULL
     OR i.pet_id IS NULL
     OR s.slot_number <> i.slot_number
  UNION ALL
  SELECT 'telegram_pet_achievements', r.pet_id, r.telegram_id, r.season_key, r.pet_id || ':' || r.achievement_id,
         CASE
           WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
           WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
           WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
           WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
           WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
           ELSE 'authority_tuple_mismatch'
         END
  FROM telegram_pet_achievements r
  LEFT JOIN telegram_pet_season_slots s
    ON s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  LEFT JOIN telegram_pet_instances i
    ON i.pet_id = r.pet_id AND i.telegram_id = r.telegram_id AND i.season_key = r.season_key
  WHERE r.pet_id IS NULL OR r.pet_id = ''
     OR r.telegram_id IS NULL OR r.telegram_id = ''
     OR r.season_key IS NULL OR r.season_key = ''
     OR s.pet_id IS NULL
     OR i.pet_id IS NULL
     OR s.slot_number <> i.slot_number;
