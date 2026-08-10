-- Crypto Moonboy Pets daily retention foundation.
-- Adds daily/seasonal records and analytics only. Existing reward, inventory,
-- run, evolution, personality, memory and migration 042/043 tables are unchanged.

CREATE TABLE telegram_pet_daily_runs (
  telegram_id TEXT NOT NULL,
  utc_day TEXT NOT NULL CHECK (utc_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  seed TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'abandoned', 'extracted')),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  depth INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0),
  boss_defeated INTEGER NOT NULL DEFAULT 0 CHECK (boss_defeated IN (0, 1)),
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, utc_day),
  UNIQUE (run_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_daily_challenge_progress (
  telegram_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  completed_at DATETIME,
  PRIMARY KEY (telegram_id, utc_day, challenge_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_daily_challenge_events (
  event_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  progress_value INTEGER NOT NULL CHECK (progress_value >= 0),
  evidence TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME,
  UNIQUE (telegram_id, utc_day, challenge_id, event_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_daily_leaderboard_records (
  telegram_id TEXT PRIMARY KEY,
  highest_score INTEGER NOT NULL DEFAULT 0 CHECK (highest_score >= 0),
  fastest_completion_seconds INTEGER CHECK (fastest_completion_seconds IS NULL OR fastest_completion_seconds >= 0),
  deepest_run INTEGER NOT NULL DEFAULT 0 CHECK (deepest_run >= 0),
  boss_completions INTEGER NOT NULL DEFAULT 0 CHECK (boss_completions >= 0),
  extraction_successes INTEGER NOT NULL DEFAULT 0 CHECK (extraction_successes >= 0),
  streak_length INTEGER NOT NULL DEFAULT 0 CHECK (streak_length >= 0),
  longest_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  runs_recorded INTEGER NOT NULL DEFAULT 0 CHECK (runs_recorded >= 0),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_seasonal_challenge_state (
  telegram_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  completed_daily_challenges INTEGER NOT NULL DEFAULT 0 CHECK (completed_daily_challenges >= 0),
  daily_streak INTEGER NOT NULL DEFAULT 0 CHECK (daily_streak >= 0),
  boss_records INTEGER NOT NULL DEFAULT 0 CHECK (boss_records >= 0),
  personal_achievements INTEGER NOT NULL DEFAULT 0 CHECK (personal_achievements >= 0),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, season_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_seasonal_achievements (
  telegram_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  achieved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, season_id, achievement_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_daily_analytics (
  analytics_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  run_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('run_created', 'run_terminal', 'challenge_completed')),
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX idx_telegram_pet_daily_runs_day_score
  ON telegram_pet_daily_runs(utc_day, score DESC, depth DESC);
CREATE INDEX idx_telegram_pet_daily_runs_status
  ON telegram_pet_daily_runs(utc_day, status, completed_at);
CREATE INDEX idx_telegram_pet_daily_challenges_day
  ON telegram_pet_daily_challenge_progress(utc_day, challenge_id, completed_at);
CREATE INDEX idx_telegram_pet_daily_challenge_events_owner
  ON telegram_pet_daily_challenge_events(telegram_id, utc_day, created_at);
CREATE INDEX idx_telegram_pet_daily_analytics_day
  ON telegram_pet_daily_analytics(utc_day, event_type, created_at);
CREATE INDEX idx_telegram_pet_seasonal_state_season
  ON telegram_pet_seasonal_challenge_state(season_id, daily_streak DESC);
