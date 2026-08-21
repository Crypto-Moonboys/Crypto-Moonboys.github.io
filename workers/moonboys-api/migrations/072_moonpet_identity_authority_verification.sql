-- Read-only Moonpet identity authority verifier.
-- A production check of this view must return zero rows before future systems
-- build on Moonpet identity state.

DROP VIEW IF EXISTS moonpet_invalid_identity_authority_rows;

CREATE VIEW moonpet_invalid_identity_authority_rows AS
  SELECT 'telegram_pet_memories' AS table_name, pet_id, telegram_id, season_key, pet_id AS row_key
  FROM telegram_pet_memories r
  WHERE NOT EXISTS (
    SELECT 1 FROM telegram_pet_season_slots s
    WHERE s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  )
  UNION ALL
  SELECT 'telegram_pet_personality_traits', pet_id, telegram_id, season_key, pet_id || ':' || trait_id
  FROM telegram_pet_personality_traits r
  WHERE NOT EXISTS (
    SELECT 1 FROM telegram_pet_season_slots s
    WHERE s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  )
  UNION ALL
  SELECT 'telegram_pet_boss_victories', pet_id, telegram_id, season_key, pet_id || ':' || boss_id
  FROM telegram_pet_boss_victories r
  WHERE NOT EXISTS (
    SELECT 1 FROM telegram_pet_season_slots s
    WHERE s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  )
  UNION ALL
  SELECT 'telegram_pet_identity_events', pet_id, telegram_id, season_key, event_id
  FROM telegram_pet_identity_events r
  WHERE NOT EXISTS (
    SELECT 1 FROM telegram_pet_season_slots s
    WHERE s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  )
  UNION ALL
  SELECT 'telegram_pet_identity_analytics', pet_id, telegram_id, season_key, analytics_id
  FROM telegram_pet_identity_analytics r
  WHERE NOT EXISTS (
    SELECT 1 FROM telegram_pet_season_slots s
    WHERE s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  )
  UNION ALL
  SELECT 'telegram_pet_achievements', pet_id, telegram_id, season_key, pet_id || ':' || achievement_id
  FROM telegram_pet_achievements r
  WHERE NOT EXISTS (
    SELECT 1 FROM telegram_pet_season_slots s
    WHERE s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  );
