-- Rollout queue for removing old per-chat Telegram "Games" Web App menu overrides.
-- Existing registered Telegram users are enumerated incrementally by the
-- scheduled Worker; no Bot API calls occur during D1 migration.
CREATE TABLE IF NOT EXISTS telegram_chat_menu_cleanup (
  user_id INTEGER PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'retry', 'cleared', 'unavailable', 'exhausted')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_telegram_chat_menu_cleanup_due
  ON telegram_chat_menu_cleanup(state, next_attempt_at, user_id);
