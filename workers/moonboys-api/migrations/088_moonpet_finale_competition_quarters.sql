-- Separate permanent ownership provenance from the Finale competition quarter.
-- D1 applies this leaf-table rebuild atomically. Every historical field and exact
-- legacy payout key survives; no ownership, reward receipt or balance is changed.
-- Won rows use their immutable victory time, never a delayed claim timestamp.
-- Unfinished rows use their last saved battle time (no start timestamp existed).
-- Unparseable legacy dates retain the original source key for auditable recovery.
CREATE TABLE telegram_pet_season_finales_quarterly (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  competition_season_key TEXT NOT NULL,
  reward_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active','failed','won')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt>0),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision>=0),
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  defeated_at TEXT,
  claimed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id,competition_season_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id,telegram_id,season_key) REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key) ON DELETE CASCADE
);
INSERT INTO telegram_pet_season_finales_quarterly
  (pet_id,telegram_id,season_key,competition_season_key,reward_key,status,attempt,revision,state_json,defeated_at,claimed_at,updated_at)
SELECT pet_id,telegram_id,season_key,
  COALESCE('pet-s' || strftime('%Y',COALESCE(defeated_at,updated_at)) || '-' || printf('%03d',((CAST(strftime('%m',COALESCE(defeated_at,updated_at)) AS INTEGER)-1)/3)+1),season_key),
  'season-finale:' || pet_id || ':' || season_key,
  status,attempt,revision,state_json,defeated_at,claimed_at,updated_at
FROM telegram_pet_season_finales;
DROP TABLE telegram_pet_season_finales;
ALTER TABLE telegram_pet_season_finales_quarterly RENAME TO telegram_pet_season_finales;
CREATE INDEX idx_pet_finales_owner ON telegram_pet_season_finales(telegram_id,competition_season_key);
