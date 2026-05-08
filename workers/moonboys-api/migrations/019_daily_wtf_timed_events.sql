-- Migration 019: Daily WTF timed events
-- Controlled timed-event bonus layer with check-in + chain options.

CREATE TABLE IF NOT EXISTS daily_wtf_events (
  event_id             TEXT NOT NULL,
  utc_day              TEXT NOT NULL,
  event_type           TEXT NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  starts_at            TEXT NOT NULL,
  ends_at              TEXT NOT NULL,
  required_action      TEXT NOT NULL,
  reward_key           TEXT NOT NULL,
  xp_multiplier_display TEXT NOT NULL DEFAULT '5x XP opportunity',
  faction_id           TEXT,
  game_key             TEXT,
  theme                TEXT,
  metadata_json        TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, utc_day)
);

CREATE INDEX IF NOT EXISTS idx_daily_wtf_events_day_time
  ON daily_wtf_events(utc_day, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS daily_wtf_player_events (
  telegram_id          TEXT NOT NULL,
  event_id             TEXT NOT NULL,
  utc_day              TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'upcoming',
  checked_in_at        TEXT,
  completed_at         TEXT,
  missed_at            TEXT,
  chain_depth          INTEGER NOT NULL DEFAULT 0,
  reward_status        TEXT NOT NULL DEFAULT 'none',
  metadata_json        TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (telegram_id, event_id, utc_day),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_wtf_player_day
  ON daily_wtf_player_events(telegram_id, utc_day, status);

CREATE TABLE IF NOT EXISTS daily_wtf_chain_options (
  telegram_id          TEXT NOT NULL,
  event_id             TEXT NOT NULL,
  utc_day              TEXT NOT NULL,
  option_id            TEXT NOT NULL,
  option_type          TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'available',
  reward_key           TEXT NOT NULL,
  display_title        TEXT NOT NULL,
  display_text         TEXT NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  chosen_at            TEXT,
  completed_at         TEXT,
  missed_at            TEXT,
  UNIQUE (telegram_id, event_id, utc_day, option_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_wtf_chain_lookup
  ON daily_wtf_chain_options(telegram_id, utc_day, status);
