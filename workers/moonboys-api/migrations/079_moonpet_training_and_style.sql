-- Server-owned training; local browser scores are never imported as rewards.
CREATE TABLE IF NOT EXISTS telegram_pet_practice (
  run_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence>0),
  revision INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('active','completed','failed','extracted')),
  state_json TEXT NOT NULL CHECK(json_valid(state_json)),
  rank_points INTEGER NOT NULL DEFAULT 0,
  reward_xp INTEGER NOT NULL DEFAULT 0 CHECK(reward_xp IN (0,10)),
  reward_day TEXT,
  reward_settled INTEGER NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK(xp_awarded BETWEEN 0 AND 10),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pet_id,sequence),
  FOREIGN KEY(pet_id,telegram_id,season_key) REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_practice_active ON telegram_pet_practice(pet_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_pet_practice_owner ON telegram_pet_practice(telegram_id,pet_id,sequence);
CREATE INDEX IF NOT EXISTS idx_pet_practice_bonus ON telegram_pet_practice(telegram_id,reward_day,reward_xp);
CREATE INDEX IF NOT EXISTS idx_pet_practice_pending ON telegram_pet_practice(telegram_id,created_at,run_id) WHERE reward_xp=10 AND reward_settled=0;
CREATE TABLE IF NOT EXISTS telegram_pet_style_loadouts (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  cosmetic_key TEXT NOT NULL CHECK(cosmetic_key IN ('rename_badge','profile_frame','victory_pose','run_trail')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  PRIMARY KEY(pet_id,cosmetic_key),
  FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id)
);
