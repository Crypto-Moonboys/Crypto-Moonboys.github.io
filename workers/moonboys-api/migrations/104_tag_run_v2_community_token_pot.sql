-- TAG RUN V2 Community Token Pot foundation. ADDITIVE; NEVER reset V1.
-- Public proposed WAX account: isthatajoint. Owner/custody unverified.
-- No token signing, payouts, price oracle, or transfer routes.
-- Apply to production D1 ONLY after backup and explicit migration review.

CREATE TABLE IF NOT EXISTS tag_run_v2_pool_config (
  config_id INTEGER PRIMARY KEY CHECK(config_id=1),
  wallet_account TEXT NOT NULL DEFAULT 'isthatajoint'
    CHECK(wallet_account='isthatajoint'),
  daily_bps INTEGER NOT NULL DEFAULT 500 CHECK(daily_bps BETWEEN 0 AND 500),
  historical_ticket_bps INTEGER NOT NULL DEFAULT 5000
    CHECK(historical_ticket_bps BETWEEN 0 AND 5000),
  status TEXT NOT NULL DEFAULT 'paused'
    CHECK(status IN ('paused','read_only','review_only')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO tag_run_v2_pool_config(config_id,wallet_account)
VALUES(1,'isthatajoint');

CREATE TABLE IF NOT EXISTS tag_run_v2_assets (
  asset_key TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL,
  token_contract TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_precision INTEGER NOT NULL CHECK(token_precision BETWEEN 0 AND 8),
  eligibility TEXT NOT NULL DEFAULT 'quarantined'
    CHECK(eligibility IN ('quarantined','approved','suspended')),
  verified_at TEXT,
  reviewed_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chain_id,token_contract,token_symbol,token_precision)
);
CREATE INDEX IF NOT EXISTS tag_run_v2_assets_eligibility
  ON tag_run_v2_assets(eligibility,token_symbol,token_contract);

-- Deposit events are NOT considered donated by default. Irreversible chain
-- history, memo policy, source and asset must be independently validated.
CREATE TABLE IF NOT EXISTS tag_run_v2_deposits (
  chain_id TEXT NOT NULL,
  global_action_seq TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  block_num INTEGER NOT NULL CHECK(block_num > 0),
  block_id TEXT NOT NULL,
  sender_account TEXT NOT NULL,
  recipient_account TEXT NOT NULL CHECK(recipient_account='isthatajoint'),
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  units TEXT NOT NULL CHECK(units GLOB '[0-9]*' AND length(units) BETWEEN 1 AND 78),
  memo_digest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'quarantined'
    CHECK(status IN ('quarantined','confirmed_donation','refund_review','rejected')),
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  PRIMARY KEY(chain_id,global_action_seq)
);
CREATE INDEX IF NOT EXISTS tag_run_v2_deposits_asset
  ON tag_run_v2_deposits(asset_key,status,block_num);

-- All units are decimal strings: SQLite INTEGER and JS Number cannot cover
-- arbitrary 8-decimal token holdings reliably. Never SQL SUM() these strings.
CREATE TABLE IF NOT EXISTS tag_run_v2_snapshots (
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  wallet_account TEXT NOT NULL CHECK(wallet_account='isthatajoint'),
  chain_irreversible_block INTEGER NOT NULL CHECK(chain_irreversible_block >= 0),
  chain_block_id TEXT NOT NULL,
  onchain_units TEXT NOT NULL,
  allocated_unpaid_units TEXT NOT NULL,
  excluded_units TEXT NOT NULL,
  spendable_units TEXT NOT NULL,
  five_percent_units TEXT NOT NULL,
  snapshot_digest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unverified'
    CHECK(status IN ('unverified','verified','quarantined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id,day_key,asset_key)
);
CREATE INDEX IF NOT EXISTS tag_run_v2_snapshots_day
  ON tag_run_v2_snapshots(chat_id,day_key,status);

-- A member's unspent ticket weight is not a fungible-token debt. Its creation
-- is tied to real V1 message receipts, which remain authoritative.
CREATE TABLE IF NOT EXISTS tag_run_v2_participation (
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  earned_weight INTEGER NOT NULL CHECK(earned_weight BETWEEN 0 AND 510),
  spent_historical_weight INTEGER NOT NULL DEFAULT 0
    CHECK(spent_historical_weight >= 0),
  source_receipts_digest TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id,day_key,telegram_id),
  CHECK(spent_historical_weight <= earned_weight)
);
CREATE INDEX IF NOT EXISTS tag_run_v2_participation_member
  ON tag_run_v2_participation(chat_id,telegram_id,day_key);

-- Immutable draw preview evidence. A review-only preview creates NO token
-- obligations. Funded reservations require a later approved custody release.
CREATE TABLE IF NOT EXISTS tag_run_v2_draws (
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview_only'
    CHECK(status IN ('preview_only','rejected','reviewed')),
  seed_commitment TEXT NOT NULL,
  seed_reveal TEXT,
  rules_digest TEXT NOT NULL,
  weights_digest TEXT NOT NULL,
  snapshots_digest TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT,
  PRIMARY KEY(chat_id,day_key)
);
CREATE TABLE IF NOT EXISTS tag_run_v2_bundles (
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  bundle_index INTEGER NOT NULL CHECK(bundle_index BETWEEN 0 AND 999),
  telegram_id TEXT NOT NULL,
  ticket_class TEXT NOT NULL CHECK(ticket_class IN ('current','historical')),
  units TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview_only' CHECK(status='preview_only'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id,day_key,asset_key,bundle_index),
  FOREIGN KEY(chat_id,day_key) REFERENCES tag_run_v2_draws(chat_id,day_key)
);
CREATE INDEX IF NOT EXISTS tag_run_v2_bundles_member
  ON tag_run_v2_bundles(chat_id,telegram_id,day_key);

-- Future token obligations require a separate migration and guarded write
-- authority. This schema deliberately cannot mark token bundles 'paid'.
CREATE TABLE IF NOT EXISTS tag_run_v2_audit (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  reviewed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
