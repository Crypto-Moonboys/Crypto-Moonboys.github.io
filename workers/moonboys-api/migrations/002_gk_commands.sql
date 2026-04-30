-- Migration 002: GK command system — link tokens and link_confirmed flag
--
-- Apply to live D1 database:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/002_gk_commands.sql --remote
--
-- Tables created:
--   telegram_link_tokens   — short-lived one-time tokens issued by /gklink
--   telegram_profiles      — legacy profile table (compatibility stub; not used by current worker)
-- Columns added:
--   telegram_profiles.link_confirmed  — 1 when /gklink token flow is complete
--
-- Production safety notes:
-- * telegram_profiles is not present in the live production schema (it was an early design
--   artefact that was superseded by telegram_users).  This migration creates a minimal stub
--   so that the ALTER TABLE below does not fail with "no such table: telegram_profiles".
-- * The current worker (worker.js) does NOT query telegram_profiles.  The stub is a safe
--   compatibility shim to keep the migration chain intact.

-- Short-lived tokens issued by the /gklink bot command; single-use, 15-minute TTL.
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token        TEXT PRIMARY KEY,
  telegram_id  TEXT NOT NULL,
  expires_at   DATETIME NOT NULL,
  used         INTEGER NOT NULL DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_link_tokens_telegram
  ON telegram_link_tokens(telegram_id, expires_at);

-- Legacy profile stub — keeps the migration chain intact.
-- The live production schema uses telegram_users instead.
-- Only safe minimal columns are included; no existing production data is affected.
CREATE TABLE IF NOT EXISTS telegram_profiles (
  telegram_id  TEXT PRIMARY KEY,
  username     TEXT,
  first_name   TEXT,
  last_name    TEXT,
  linked_at    TEXT,
  updated_at   TEXT
);

-- Flag set to 1 once a user clicks the /gklink URL and the token is validated.
-- Note: SQLite/D1 does not support "IF NOT EXISTS" for ALTER TABLE.
-- If the column already exists this statement will fail with "duplicate column name".
-- That error is expected and safe to ignore on repeat runs.
-- To check before running: SELECT link_confirmed FROM telegram_profiles LIMIT 1;
ALTER TABLE telegram_profiles ADD COLUMN link_confirmed INTEGER NOT NULL DEFAULT 0;
