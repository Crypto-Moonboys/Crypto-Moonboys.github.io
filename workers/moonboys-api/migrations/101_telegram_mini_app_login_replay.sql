-- A Mini App launch signature is valid for only one website-session exchange.
CREATE TABLE IF NOT EXISTS telegram_mini_app_login_replay (
  proof_hash TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_mini_app_login_replay_expiry ON telegram_mini_app_login_replay(expires_at);
