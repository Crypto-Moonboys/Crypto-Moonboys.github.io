-- NBG London bounded prize competitions: daily, weekly and fixed 90-day seasonal.
-- Periods are [start,end) and turn over at 01:00 UTC.
-- A player appears once per period; competition rank is cumulative verified run XP.
CREATE TABLE IF NOT EXISTS nbg_london_period_scores (
  period_kind TEXT NOT NULL CHECK (period_kind IN ('daily', 'weekly', 'seasonal')),
  period_start_ms INTEGER NOT NULL,
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  run_count INTEGER NOT NULL DEFAULT 0 CHECK (run_count >= 0),
  best_time_ms INTEGER NOT NULL CHECK (best_time_ms > 0),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (period_kind, period_start_ms, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_nbg_london_period_ranks
  ON nbg_london_period_scores (period_kind, period_start_ms, total_xp DESC, best_time_ms ASC);

-- Awards are created by the 01:00 UTC Worker cron, never by the browser.
-- A receipt is unique by period + rank, ensuring only three awards per window.
CREATE TABLE IF NOT EXISTS nbg_london_prize_awards (
  event_id TEXT PRIMARY KEY,
  period_kind TEXT NOT NULL CHECK (period_kind IN ('daily', 'weekly', 'seasonal')),
  period_start_ms INTEGER NOT NULL,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 3),
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  prize_arcade_xp INTEGER NOT NULL CHECK (prize_arcade_xp > 0),
  settled_at_ms INTEGER NOT NULL,
  UNIQUE (period_kind, period_start_ms, rank)
);
CREATE INDEX IF NOT EXISTS idx_nbg_london_prizes_player ON nbg_london_prize_awards (telegram_id, settled_at_ms);
