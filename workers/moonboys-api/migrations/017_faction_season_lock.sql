-- Migration 017: Faction season lock
-- Enforces one faction choice per user per season.
-- A row here represents a user's locked faction for a given season key.
-- Joining the same faction again is idempotent.
-- Joining a different faction in the same season is rejected (faction_locked_for_season).
-- At the start of a new season, no row exists for the new season_key so the user may choose again.

CREATE TABLE IF NOT EXISTS telegram_faction_season_locks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT    NOT NULL,
  season_key  TEXT    NOT NULL,
  faction_id  TEXT    NOT NULL,
  locked_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (telegram_id, season_key)
);

CREATE INDEX IF NOT EXISTS idx_faction_season_locks_telegram
  ON telegram_faction_season_locks(telegram_id, season_key);
