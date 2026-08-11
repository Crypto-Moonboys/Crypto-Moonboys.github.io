-- Player-facing Moonpet expansion: permanent achievements, weekly personal
-- bosses and retry-safe seasonal reward claims.

CREATE TABLE telegram_pet_achievements (
  telegram_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  target INTEGER NOT NULL CHECK (target > 0),
  unlocked_at DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, achievement_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_weekly_boss_progress (
  telegram_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  boss_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  damage INTEGER NOT NULL DEFAULT 0 CHECK (damage >= 0),
  defeated_at DATETIME,
  reward_claimed_at DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, week_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_weekly_boss_events (
  event_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  day_key TEXT NOT NULL,
  boss_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('strike', 'outsmart', 'endure')),
  damage INTEGER NOT NULL CHECK (damage >= 0),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (telegram_id, week_key, day_key),
  UNIQUE (telegram_id, event_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_season_reward_claims (
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  tier_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  claimed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, season_key, tier_id),
  UNIQUE (telegram_id, event_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX idx_telegram_pet_achievements_unlocked
  ON telegram_pet_achievements(achievement_id, unlocked_at);
CREATE INDEX idx_telegram_pet_weekly_boss_week
  ON telegram_pet_weekly_boss_progress(week_key, damage DESC);
CREATE INDEX idx_telegram_pet_weekly_boss_events_owner
  ON telegram_pet_weekly_boss_events(telegram_id, week_key, created_at DESC);
CREATE INDEX idx_telegram_pet_season_claims_season
  ON telegram_pet_season_reward_claims(season_key, tier_id);
