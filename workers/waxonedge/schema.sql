-- WAXONEDGE D1 schema draft
-- This is a scaffold only. Do not deploy until Cloudflare D1 binding is confirmed.
--
-- Precision policy:
-- On-chain quantities, token prices, liquidity, volume, market cap, FDV, holder
-- percentages, and candle OHLC/volume are stored as decimal strings in TEXT
-- columns. This avoids binary floating-point drift. Adapter code should
-- preserve source precision and only convert for display/calculation at the edge.

CREATE TABLE IF NOT EXISTS waxonedge_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_waxonedge_sync_runs_source_started
  ON waxonedge_sync_runs (source, started_at);

CREATE TABLE IF NOT EXISTS waxonedge_tokens (
  contract TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INTEGER,
  total_supply TEXT,
  max_supply TEXT,
  price_wax TEXT,
  price_usd TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (contract, symbol)
);

CREATE INDEX IF NOT EXISTS idx_waxonedge_tokens_symbol
  ON waxonedge_tokens (symbol);

CREATE TABLE IF NOT EXISTS waxonedge_pairs (
  source TEXT NOT NULL,
  pair_id TEXT NOT NULL,
  token_a_contract TEXT,
  token_a_symbol TEXT,
  token_b_contract TEXT,
  token_b_symbol TEXT,
  price TEXT,
  change_24h TEXT,
  volume_24h TEXT,
  liquidity_wax TEXT,
  liquidity_usd TEXT,
  reserve_a TEXT,
  reserve_b TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, pair_id)
);

CREATE INDEX IF NOT EXISTS idx_waxonedge_pairs_token_a
  ON waxonedge_pairs (token_a_contract, token_a_symbol);

CREATE INDEX IF NOT EXISTS idx_waxonedge_pairs_token_b
  ON waxonedge_pairs (token_b_contract, token_b_symbol);

CREATE INDEX IF NOT EXISTS idx_waxonedge_pairs_volume_24h
  ON waxonedge_pairs (volume_24h);

CREATE TABLE IF NOT EXISTS waxonedge_token_stats (
  contract TEXT NOT NULL,
  symbol TEXT NOT NULL,
  holder_count INTEGER,
  circulating_supply TEXT,
  volume_24h TEXT,
  volume_7d TEXT,
  volume_30d TEXT,
  market_cap_wax TEXT,
  market_cap_usd TEXT,
  fdv_wax TEXT,
  fdv_usd TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (contract, symbol)
);

CREATE TABLE IF NOT EXISTS waxonedge_holders (
  contract TEXT NOT NULL,
  symbol TEXT NOT NULL,
  account TEXT NOT NULL,
  balance TEXT NOT NULL,
  percentage TEXT,
  snapshot_at TEXT NOT NULL,
  PRIMARY KEY (contract, symbol, account, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_waxonedge_holders_token_snapshot
  ON waxonedge_holders (contract, symbol, snapshot_at);

CREATE TABLE IF NOT EXISTS waxonedge_chart_candles (
  source TEXT NOT NULL,
  pair_id TEXT NOT NULL,
  interval TEXT NOT NULL,
  bucket_time TEXT NOT NULL,
  open TEXT,
  high TEXT,
  low TEXT,
  close TEXT,
  volume TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, pair_id, interval, bucket_time)
);

CREATE INDEX IF NOT EXISTS idx_waxonedge_chart_pair_interval_time
  ON waxonedge_chart_candles (source, pair_id, interval, bucket_time);
