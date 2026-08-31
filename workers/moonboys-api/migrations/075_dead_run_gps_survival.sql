-- Dead Run: Telegram GPS survival authority.
-- Precise coordinates exist only while a run is active and are nulled when a run settles.

CREATE TABLE dead_run_players (
  telegram_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Runner',
  xp_total INTEGER NOT NULL DEFAULT 0 CHECK (xp_total >= 0),
  runs_total INTEGER NOT NULL DEFAULT 0 CHECK (runs_total >= 0),
  ranked_runs_total INTEGER NOT NULL DEFAULT 0 CHECK (ranked_runs_total >= 0),
  best_survival_seconds INTEGER NOT NULL DEFAULT 0 CHECK (best_survival_seconds >= 0),
  best_distance_m INTEGER NOT NULL DEFAULT 0 CHECK (best_distance_m >= 0),
  best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  kills_total INTEGER NOT NULL DEFAULT 0 CHECK (kills_total >= 0),
  crates_total INTEGER NOT NULL DEFAULT 0 CHECK (crates_total >= 0),
  horde_events_total INTEGER NOT NULL DEFAULT 0 CHECK (horde_events_total >= 0),
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  last_run_day TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE dead_run_horde_events (
  event_id TEXT PRIMARY KEY,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  target_kills INTEGER NOT NULL CHECK (target_kills > 0),
  kills_total INTEGER NOT NULL DEFAULT 0 CHECK (kills_total >= 0),
  participants INTEGER NOT NULL DEFAULT 0 CHECK (participants >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cleared', 'expired')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dead_run_sessions (
  session_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settling', 'finished', 'abandoned', 'rejected')),
  ranked INTEGER NOT NULL DEFAULT 1 CHECK (ranked IN (0,1)),
  seed INTEGER NOT NULL,
  event_id TEXT,
  difficulty_tier INTEGER NOT NULL DEFAULT 1 CHECK (difficulty_tier BETWEEN 1 AND 5),
  difficulty_xp_basis INTEGER NOT NULL DEFAULT 0 CHECK (difficulty_xp_basis >= 0),
  difficulty_best_basis INTEGER NOT NULL DEFAULT 0 CHECK (difficulty_best_basis >= 0),
  difficulty_runs_basis INTEGER NOT NULL DEFAULT 0 CHECK (difficulty_runs_basis >= 0),
  heading_deg REAL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME,
  start_lat REAL,
  start_lng REAL,
  last_lat REAL,
  last_lng REAL,
  last_accuracy_m REAL,
  last_sample_at_ms INTEGER NOT NULL DEFAULT 0,
  last_client_seq INTEGER NOT NULL DEFAULT 0,
  last_speed_mps REAL NOT NULL DEFAULT 0,
  max_speed_mps REAL NOT NULL DEFAULT 0,
  verified_distance_m REAL NOT NULL DEFAULT 0 CHECK (verified_distance_m >= 0),
  suspicious_points REAL NOT NULL DEFAULT 0 CHECK (suspicious_points >= 0),
  ammo INTEGER NOT NULL DEFAULT 3 CHECK (ammo >= 0 AND ammo <= 6),
  slow_inventory INTEGER NOT NULL DEFAULT 0 CHECK (slow_inventory >= 0),
  charge_m REAL NOT NULL DEFAULT 0 CHECK (charge_m >= 0),
  slow_until_ms INTEGER NOT NULL DEFAULT 0,
  current_wave INTEGER NOT NULL DEFAULT 0 CHECK (current_wave >= 0),
  kills INTEGER NOT NULL DEFAULT 0 CHECK (kills >= 0),
  crates INTEGER NOT NULL DEFAULT 0 CHECK (crates >= 0),
  shove_count INTEGER NOT NULL DEFAULT 0 CHECK (shove_count >= 0),
  survival_seconds INTEGER NOT NULL DEFAULT 0 CHECK (survival_seconds >= 0),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  finish_reason TEXT,
  player_stats_applied INTEGER NOT NULL DEFAULT 0 CHECK (player_stats_applied IN (0,1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES dead_run_horde_events(event_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_dead_run_one_active_session
  ON dead_run_sessions(telegram_id)
  WHERE status = 'active';
CREATE INDEX idx_dead_run_sessions_daily_ranked
  ON dead_run_sessions(day_key, ranked, status, score DESC);
CREATE INDEX idx_dead_run_sessions_survival
  ON dead_run_sessions(status, ranked, survival_seconds DESC);
CREATE INDEX idx_dead_run_sessions_distance
  ON dead_run_sessions(status, ranked, verified_distance_m DESC);
CREATE INDEX idx_dead_run_sessions_user_time
  ON dead_run_sessions(telegram_id, started_at DESC);

CREATE TABLE dead_run_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('shoot', 'pickup', 'slow', 'shove')),
  target_id TEXT,
  accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted IN (0,1)),
  reason TEXT,
  response_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, action_id),
  FOREIGN KEY (session_id) REFERENCES dead_run_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_dead_run_single_target_accept
  ON dead_run_actions(session_id, action_type, target_id)
  WHERE accepted = 1 AND target_id IS NOT NULL AND action_type IN ('shoot', 'pickup');
CREATE INDEX idx_dead_run_actions_session_time
  ON dead_run_actions(session_id, created_at DESC);

CREATE TABLE dead_run_horde_contributions (
  event_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0 CHECK (kills >= 0),
  distance_m REAL NOT NULL DEFAULT 0 CHECK (distance_m >= 0),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, session_id),
  FOREIGN KEY (event_id) REFERENCES dead_run_horde_events(event_id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES dead_run_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX idx_dead_run_horde_contrib_event_kills
  ON dead_run_horde_contributions(event_id, kills DESC, created_at ASC);
CREATE INDEX idx_dead_run_horde_contrib_user
  ON dead_run_horde_contributions(telegram_id, created_at DESC);
