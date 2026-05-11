-- Migration 021: missed_xp_value column on daily_missed_perks
-- Adds a per-row XP value so the system can track how much notional XP
-- a player forfeited by missing each daily/timed/random opportunity.
-- status_value (0/1 flag) is NOT the XP value; missed_xp_value is.
-- Existing rows default to 0; new rows get the appropriate event-type amount.
-- This column is read-only from the client. Only the Worker sets it.

ALTER TABLE daily_missed_perks ADD COLUMN missed_xp_value INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_daily_missed_perks_telegram_xp
  ON daily_missed_perks(telegram_id, missed_xp_value);
