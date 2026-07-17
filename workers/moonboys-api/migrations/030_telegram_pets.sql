-- Crypto Moonboys Pets: Telegram-first pet roguelite progression.

CREATE TABLE IF NOT EXISTS telegram_pet_profiles (
  telegram_id     TEXT PRIMARY KEY,
  pet_name        TEXT NOT NULL DEFAULT 'Moonpet',
  species         TEXT NOT NULL DEFAULT 'moonbeast',
  stage           TEXT NOT NULL DEFAULT 'egg',
  pet_xp          INTEGER NOT NULL DEFAULT 0 CHECK (pet_xp >= 0),
  level           INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  hunger          INTEGER NOT NULL DEFAULT 25 CHECK (hunger BETWEEN 0 AND 100),
  happiness       INTEGER NOT NULL DEFAULT 70 CHECK (happiness BETWEEN 0 AND 100),
  cleanliness     INTEGER NOT NULL DEFAULT 70 CHECK (cleanliness BETWEEN 0 AND 100),
  energy          INTEGER NOT NULL DEFAULT 70 CHECK (energy BETWEEN 0 AND 100),
  health          INTEGER NOT NULL DEFAULT 75 CHECK (health BETWEEN 0 AND 100),
  streak_days     INTEGER NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  last_active_day TEXT,
  last_decay_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_profiles_pet_xp
  ON telegram_pet_profiles(pet_xp DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_profiles_updated
  ON telegram_pet_profiles(updated_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_events (
  id              TEXT PRIMARY KEY,
  telegram_id     TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  event_key       TEXT NOT NULL,
  xp_awarded      INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  pet_xp_awarded  INTEGER NOT NULL DEFAULT 0 CHECK (pet_xp_awarded >= 0),
  season_key      TEXT NOT NULL,
  day_key         TEXT NOT NULL,
  week_key        TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'accepted',
  reason          TEXT,
  metadata        TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id, event_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_user_created
  ON telegram_pet_events(telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_user_day
  ON telegram_pet_events(telegram_id, day_key, status);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_user_week
  ON telegram_pet_events(telegram_id, week_key, status);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_season_xp
  ON telegram_pet_events(season_key, pet_xp_awarded DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_season_state (
  telegram_id TEXT NOT NULL,
  season_key  TEXT NOT NULL,
  season_xp   INTEGER NOT NULL DEFAULT 0 CHECK (season_xp >= 0),
  weekly_xp   INTEGER NOT NULL DEFAULT 0 CHECK (weekly_xp >= 0),
  daily_xp    INTEGER NOT NULL DEFAULT 0 CHECK (daily_xp >= 0),
  daily_key   TEXT NOT NULL DEFAULT '',
  weekly_key  TEXT NOT NULL DEFAULT '',
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, season_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_season_state_rank
  ON telegram_pet_season_state(season_key, season_xp DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_mission_completions (
  telegram_id TEXT NOT NULL,
  mission_key TEXT NOT NULL,
  window_key  TEXT NOT NULL,
  xp_awarded  INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, mission_key, window_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);
