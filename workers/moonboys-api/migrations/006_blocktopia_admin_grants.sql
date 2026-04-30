-- Migration 006: Admin audit fields for Block Topia progression events
--
-- Add audit fields for admin-authored Block Topia progression events.
--
-- Production safety notes:
-- * SQLite/D1 does not support "ALTER TABLE … ADD COLUMN IF NOT EXISTS".
-- * If either column already exists (e.g. because migration 011 was applied as a manual
--   repair), this statement will fail with "duplicate column name".
-- * That error is expected and safe to ignore on repeat runs.
-- * To check before running:
--   SELECT admin_telegram_id, reason FROM blocktopia_progression_events LIMIT 1;
ALTER TABLE blocktopia_progression_events ADD COLUMN admin_telegram_id TEXT;
ALTER TABLE blocktopia_progression_events ADD COLUMN reason TEXT;
