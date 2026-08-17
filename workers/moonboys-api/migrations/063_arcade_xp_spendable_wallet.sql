-- Spend authority is deliberately separate from arcade_xp_total, which remains
-- the lifetime/leaderboard counter. Existing lifetime XP is not backfilled:
-- only XP earned after this migration becomes spendable.
CREATE TABLE IF NOT EXISTS arcade_xp_wallets (
  telegram_id TEXT PRIMARY KEY,
  arcade_xp_earned INTEGER NOT NULL DEFAULT 0 CHECK (arcade_xp_earned >= 0),
  arcade_xp_spendable INTEGER NOT NULL DEFAULT 0 CHECK (arcade_xp_spendable >= 0),
  arcade_xp_spent INTEGER NOT NULL DEFAULT 0 CHECK (arcade_xp_spent >= 0),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  CHECK (arcade_xp_earned = arcade_xp_spendable + arcade_xp_spent)
);
