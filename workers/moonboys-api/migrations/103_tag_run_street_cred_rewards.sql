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

-- Rank thresholds are mirrored from core.js and checked in contract tests.
-- The receipt trigger is atomic with each accepted message, so concurrent
-- messages cannot miss a rank crossing or create a duplicate celebration.
CREATE TABLE IF NOT EXISTS tag_run_rank_levels (
  threshold INTEGER PRIMARY KEY CHECK(threshold >= 0),
  name TEXT NOT NULL UNIQUE
);
INSERT OR IGNORE INTO tag_run_rank_levels(threshold,name) VALUES
  (0, 'Newbie Tagger'),
  (25, 'Fresh Ink'),
  (60, 'Sticker Bandit'),
  (100, 'Street Rat'),
  (150, 'Marker Maniac'),
  (220, 'Alley Artist'),
  (300, 'Stencil Starter'),
  (420, 'Throwie Trainee'),
  (580, 'Rooftop Rookie'),
  (760, 'Trackside Tagger'),
  (1000, 'Train Bomber'),
  (1300, 'Night Shift Sprayer'),
  (1700, 'Chrome Chaser'),
  (2200, 'Outline Operator'),
  (2800, 'Fill-In Fiend'),
  (3500, 'Drip Doctor'),
  (4400, 'Wildstyle Wrangler'),
  (5500, 'Freight Phantom'),
  (7000, 'Tunnel Tactician'),
  (9000, 'Yard Ninja'),
  (11500, 'Roller Renegade'),
  (14500, 'Piece Prodigy'),
  (18500, 'Burner Maker'),
  (23500, 'Style General'),
  (30000, 'City-Wide'),
  (38000, 'Hall of Fame'),
  (48000, 'Graffiti Veteran'),
  (60000, 'Graffiti Legend'),
  (95000, 'Graffiti King');

CREATE TABLE IF NOT EXISTS tag_run_rank_announcements (
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  rank_threshold INTEGER NOT NULL CHECK(rank_threshold > 0),
  rank_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  total_points INTEGER NOT NULL CHECK(total_points > 0),
  source_message_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'attempted', 'sent', 'needs_review')),
  telegram_message_id INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempted_at TEXT,
  sent_at TEXT,
  PRIMARY KEY(chat_id, telegram_id, rank_threshold)
);
CREATE INDEX IF NOT EXISTS tag_run_rank_announcements_queue
  ON tag_run_rank_announcements(chat_id, status, created_at);

-- Incremental member totals keep every chat message O(1) rather than
-- rescanning the user's entire message history for every rank crossing.
CREATE TABLE IF NOT EXISTS tag_run_member_totals (
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score >= 0),
  posts INTEGER NOT NULL CHECK(posts >= 0),
  display_name TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id, telegram_id)
);
CREATE INDEX IF NOT EXISTS tag_run_member_totals_leaderboard
  ON tag_run_member_totals(chat_id, score DESC, posts DESC, telegram_id);

CREATE TRIGGER IF NOT EXISTS tag_run_message_rank_up
AFTER INSERT ON tag_run_messages
BEGIN
  INSERT INTO tag_run_member_totals
    (chat_id,telegram_id,score,posts,display_name)
  VALUES (NEW.chat_id,NEW.telegram_id,NEW.points,1,NEW.display_name)
  ON CONFLICT(chat_id,telegram_id) DO UPDATE SET
    score=tag_run_member_totals.score+excluded.score,
    posts=tag_run_member_totals.posts+1,
    display_name=excluded.display_name,
    updated_at=CURRENT_TIMESTAMP;

  INSERT OR IGNORE INTO tag_run_rank_announcements
    (chat_id,telegram_id,rank_threshold,rank_name,display_name,total_points,source_message_id)
  SELECT NEW.chat_id, NEW.telegram_id, levels.threshold, levels.name,
    NEW.display_name, totals.score, NEW.message_id
  FROM tag_run_rank_levels AS levels
  JOIN tag_run_member_totals AS totals
    ON totals.chat_id=NEW.chat_id AND totals.telegram_id=NEW.telegram_id
  WHERE levels.threshold > 0
    AND totals.score >= levels.threshold
    AND totals.score - NEW.points < levels.threshold
  ORDER BY levels.threshold DESC
  LIMIT 1;
END;

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
  planned_units INTEGER NOT NULL CHECK(planned_units > 0),
  recipient_count INTEGER NOT NULL CHECK(recipient_count BETWEEN 1 AND 1000),
  -- Frozen ranked results are the sole source of allocation rows. Never rescan
  -- live chat receipts after the budget validation or duplicate a payment plan.
  standings_json TEXT NOT NULL CHECK(
    json_valid(standings_json) AND json_type(standings_json)='array'
  ),
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
