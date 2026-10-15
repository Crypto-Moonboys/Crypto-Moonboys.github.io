-- Permanent NBG London Level 1 leaderboard records.
-- Only verified Telegram-linked users can be inserted by the Worker.
-- Metrics: fastest run, XP per minute (speed + points), highest score XP.
CREATE TABLE IF NOT EXISTS nbg_london_runs (
  run_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  started_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  finished_at_ms INTEGER,
  finish_token TEXT UNIQUE,
  CHECK (expires_at_ms > started_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_nbg_london_runs_player ON nbg_london_runs(telegram_id, started_at_ms);

CREATE TABLE IF NOT EXISTS nbg_london_records (
  telegram_id TEXT PRIMARY KEY REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  fastest_ms INTEGER NOT NULL CHECK (fastest_ms > 0),
  fastest_xp INTEGER NOT NULL CHECK (fastest_xp >= 0),
  speed_xp_rate INTEGER NOT NULL CHECK (speed_xp_rate >= 0),
  speed_xp_ms INTEGER NOT NULL CHECK (speed_xp_ms > 0),
  speed_xp_xp INTEGER NOT NULL CHECK (speed_xp_xp >= 0),
  best_xp INTEGER NOT NULL CHECK (best_xp >= 0),
  best_xp_ms INTEGER NOT NULL CHECK (best_xp_ms > 0),
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nbg_london_fastest ON nbg_london_records(fastest_ms ASC, fastest_xp DESC);
CREATE INDEX IF NOT EXISTS idx_nbg_london_speed_xp ON nbg_london_records(speed_xp_rate DESC, speed_xp_ms ASC);
CREATE INDEX IF NOT EXISTS idx_nbg_london_xp ON nbg_london_records(best_xp DESC, best_xp_ms ASC);
