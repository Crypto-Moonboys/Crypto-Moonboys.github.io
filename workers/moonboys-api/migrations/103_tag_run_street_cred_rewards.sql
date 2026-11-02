-- TAG RUN: Telegram chat-local Street Cred and WAX reward planning (non-custodial).
-- This migration creates no token transfers and does not touch Arcade XP or MoonPet.
-- Apply in a reviewed D1 migration deployment BEFORE enabling TAG_RUN_ENABLED.
CREATE TABLE IF NOT EXISTS tag_run_messages (
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  week_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 17),
  message_unix INTEGER NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS tag_run_messages_member_day
  ON tag_run_messages(chat_id, telegram_id, day_key, message_unix);
CREATE INDEX IF NOT EXISTS tag_run_messages_member_week
  ON tag_run_messages(chat_id, week_key, telegram_id);
CREATE INDEX IF NOT EXISTS tag_run_messages_member_hash
  ON tag_run_messages(chat_id, telegram_id, content_hash, message_unix);

-- The chat member earns points without needing a website account link.
-- Wallet registration is private and always UNVERIFIED until a future signed proof.
CREATE TABLE IF NOT EXISTS tag_run_wallets (
  telegram_id TEXT PRIMARY KEY,
  wax_account TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(verification_status IN ('pending','verified')),
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT
);

-- One reward token selected at a time. Config may be replaced for future weeks.
-- Amounts use integer token minimum units, never floating-point tokens.
CREATE TABLE IF NOT EXISTS tag_run_reward_config (
  chat_id TEXT PRIMARY KEY,
  token_contract TEXT NOT NULL DEFAULT 'kingsofgraff',
  token_symbol TEXT NOT NULL DEFAULT 'LFGK',
  token_precision INTEGER CHECK(token_precision BETWEEN 0 AND 8),
  base_amount_units INTEGER NOT NULL DEFAULT 0 CHECK(base_amount_units >= 0),
  max_weekly_units INTEGER NOT NULL DEFAULT 0 CHECK(max_weekly_units >= 0),
  top1_multiplier INTEGER NOT NULL DEFAULT 5 CHECK(top1_multiplier BETWEEN 1 AND 20),
  top2_multiplier INTEGER NOT NULL DEFAULT 3 CHECK(top2_multiplier BETWEEN 1 AND 20),
  top3_multiplier INTEGER NOT NULL DEFAULT 2 CHECK(top3_multiplier BETWEEN 1 AND 20),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Frozen drafts are NOT claimable/transferrable on-chain. No signer is installed.
-- A real payment service must be separately authorised and reconcile tx IDs.
CREATE TABLE IF NOT EXISTS tag_run_weekly_plans (
  chat_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  token_contract TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_precision INTEGER NOT NULL,
  base_amount_units INTEGER NOT NULL,
  max_weekly_units INTEGER NOT NULL,
  top1_multiplier INTEGER NOT NULL,
  top2_multiplier INTEGER NOT NULL,
  top3_multiplier INTEGER NOT NULL,
  planned_units INTEGER NOT NULL,
  recipient_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'review_only'
    CHECK(status = 'review_only'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id, week_key)
);
CREATE TABLE IF NOT EXISTS tag_run_weekly_allocations (
  chat_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  rank_position INTEGER NOT NULL CHECK(rank_position > 0),
  street_cred INTEGER NOT NULL CHECK(street_cred > 0),
  amount_units INTEGER NOT NULL CHECK(amount_units > 0),
  registered_wax_account TEXT,
  wallet_verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(wallet_verification_status IN ('pending','verified')),
  status TEXT NOT NULL DEFAULT 'review_only'
    CHECK(status = 'review_only'),
  PRIMARY KEY(chat_id, week_key, telegram_id),
  FOREIGN KEY(chat_id, week_key) REFERENCES tag_run_weekly_plans(chat_id, week_key)
);
CREATE INDEX IF NOT EXISTS tag_run_weekly_allocations_member
  ON tag_run_weekly_allocations(telegram_id, week_key);
