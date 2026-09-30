-- Beta-only correction for season XP left above retained owned-pet XP by the
-- stale post-action profile mirror removed with this migration's Worker fix.
-- Preserve the lower, authoritative per-pet total and record every correction.

CREATE TABLE IF NOT EXISTS moonpet_beta_xp_rebaseline_v2 (
  correction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  previous_season_xp INTEGER NOT NULL,
  retained_season_xp INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT
);

WITH owned AS (
  SELECT i.telegram_id,i.season_key,SUM(i.pet_xp) AS pet_xp
  FROM telegram_pet_instances i JOIN telegram_pet_season_slots s
    ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
    AND s.season_key=i.season_key AND s.slot_number=i.slot_number
  GROUP BY i.telegram_id,i.season_key
)
INSERT INTO moonpet_beta_xp_rebaseline_v2
  (telegram_id,season_key,previous_season_xp,retained_season_xp,difference)
SELECT state.telegram_id,state.season_key,state.season_xp,owned.pet_xp,
  state.season_xp-owned.pet_xp
FROM telegram_pet_season_state state JOIN owned
  ON owned.telegram_id=state.telegram_id AND owned.season_key=state.season_key
WHERE state.season_xp>owned.pet_xp;

UPDATE telegram_pet_season_state AS state
SET season_xp=(SELECT fix.retained_season_xp FROM moonpet_beta_xp_rebaseline_v2 fix
  WHERE fix.telegram_id=state.telegram_id AND fix.season_key=state.season_key
    AND fix.applied_at IS NULL ORDER BY fix.correction_id DESC LIMIT 1)
WHERE EXISTS (SELECT 1 FROM moonpet_beta_xp_rebaseline_v2 fix
  WHERE fix.telegram_id=state.telegram_id AND fix.season_key=state.season_key
    AND fix.applied_at IS NULL AND state.season_xp=fix.previous_season_xp);

UPDATE moonpet_beta_xp_rebaseline_v2 SET applied_at=CURRENT_TIMESTAMP
WHERE applied_at IS NULL AND EXISTS (SELECT 1 FROM telegram_pet_season_state state
  WHERE state.telegram_id=moonpet_beta_xp_rebaseline_v2.telegram_id
    AND state.season_key=moonpet_beta_xp_rebaseline_v2.season_key
    AND state.season_xp=moonpet_beta_xp_rebaseline_v2.retained_season_xp);
