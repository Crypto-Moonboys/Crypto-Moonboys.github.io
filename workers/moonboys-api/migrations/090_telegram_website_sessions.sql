-- Additive authentication metadata. Existing player and ownership keys stay intact.
CREATE TABLE IF NOT EXISTS telegram_oidc_accounts (
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (issuer, client_id, subject),
  UNIQUE (issuer, client_id, telegram_id)
);

CREATE TABLE IF NOT EXISTS telegram_login_transactions (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  return_url TEXT NOT NULL,
  expected_telegram_id TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_login_expiry ON telegram_login_transactions(expires_at);

CREATE TABLE IF NOT EXISTS telegram_website_sessions (
  session_hash TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  csrf_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_telegram_session_expiry ON telegram_website_sessions(expires_at);

CREATE TABLE IF NOT EXISTS telegram_website_credentials (
  token_hash TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL REFERENCES telegram_website_sessions(session_hash) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_credential_expiry ON telegram_website_credentials(expires_at);
