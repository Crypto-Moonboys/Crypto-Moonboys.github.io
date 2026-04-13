-- Migration 002: GK command system — link tokens and link_confirmed flag
--
-- Apply to live D1 database:
--   wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/002_gk_commands.sql --remote
--
-- Tables created:
--   telegram_link_tokens   — short-lived one-time tokens issued by /gklink
-- Columns added:
--   telegram_profiles.link_confirmed  — 1 when /gklink token flow is complete

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

-- Flag set to 1 once a user clicks the /gklink URL and the token is validated.
-- Note: SQLite/D1 does not support "IF NOT EXISTS" for ALTER TABLE.
-- If the column already exists this statement will fail with "duplicate column name".
-- That error is expected and safe to ignore on repeat runs.
-- To check before running: SELECT link_confirmed FROM telegram_profiles LIMIT 1;
ALTER TABLE telegram_profiles ADD COLUMN link_confirmed INTEGER NOT NULL DEFAULT 0;
