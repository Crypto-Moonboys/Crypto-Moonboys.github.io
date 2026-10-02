-- Atomic Community XP receipts. Existing XP logs and awards remain untouched.
CREATE TABLE IF NOT EXISTS telegram_community_xp_awards (
  telegram_id TEXT NOT NULL,
  action TEXT NOT NULL,
  claim_key TEXT NOT NULL,
  reference_id TEXT,
  xp_change INTEGER NOT NULL CHECK (xp_change >= 0),
  season_id INTEGER,
  earned_at TEXT NOT NULL,
  settlement_token TEXT NOT NULL,
  PRIMARY KEY (telegram_id, action, claim_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id),
  FOREIGN KEY (season_id) REFERENCES telegram_seasons(id)
);
