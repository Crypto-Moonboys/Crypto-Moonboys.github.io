-- Migration 015: Player server-backed progression state
-- Adds persistent tables for cross-game modifiers, daily missions,
-- faction signal contributions, streaks, and game mastery.
-- These replace localStorage-only progression for Telegram-linked users.

-- 1. Cross-game modifier state per player
CREATE TABLE IF NOT EXISTS player_modifier_state (
  telegram_id          TEXT PRIMARY KEY,
  active_modifier_id   TEXT,
  unlocked_modifiers_json TEXT,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

-- 2. Daily mission progress per player per mission per day
CREATE TABLE IF NOT EXISTS player_daily_mission_state (
  telegram_id  TEXT NOT NULL,
  mission_date TEXT NOT NULL,
  mission_id   TEXT NOT NULL,
  progress     INTEGER NOT NULL DEFAULT 0,
  completed    INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (telegram_id, mission_date, mission_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_daily_mission_state_user_date
  ON player_daily_mission_state(telegram_id, mission_date);

-- 3. Faction signal / war contribution per player per faction per day
CREATE TABLE IF NOT EXISTS player_faction_signal_state (
  telegram_id   TEXT NOT NULL,
  faction_id    TEXT NOT NULL,
  day_key       TEXT NOT NULL,
  week_key      TEXT NOT NULL,
  contribution  INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (telegram_id, faction_id, day_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_faction_signal_faction_day
  ON player_faction_signal_state(faction_id, day_key);

CREATE INDEX IF NOT EXISTS idx_player_faction_signal_faction_week
  ON player_faction_signal_state(faction_id, week_key);

-- 4. Streak state per player (mission and contribution streaks)
CREATE TABLE IF NOT EXISTS player_streak_state (
  telegram_id              TEXT PRIMARY KEY,
  mission_streak           INTEGER NOT NULL DEFAULT 0,
  contribution_streak      INTEGER NOT NULL DEFAULT 0,
  last_mission_date        TEXT,
  last_contribution_date   TEXT,
  updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

-- 5. Game mastery and personal bests per player per game
CREATE TABLE IF NOT EXISTS player_game_mastery_state (
  telegram_id  TEXT NOT NULL,
  game_id      TEXT NOT NULL,
  best_score   INTEGER NOT NULL DEFAULT 0,
  runs_played  INTEGER NOT NULL DEFAULT 0,
  mastery_xp   INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (telegram_id, game_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_game_mastery_game
  ON player_game_mastery_state(game_id, best_score DESC);
