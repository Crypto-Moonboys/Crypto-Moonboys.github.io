-- Lightweight WaxOnEdge price history.
-- This is not an OHLCV/candle table: one row is a meaningful current-state
-- price/liquidity snapshot for a token at an observed timestamp.

CREATE TABLE IF NOT EXISTS waxonedge_price_snapshots (
  timestamp TEXT NOT NULL,
  contract TEXT NOT NULL,
  symbol TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  pair_id TEXT NOT NULL DEFAULT '',
  price_wax TEXT,
  price_usd TEXT,
  liquidity_wax TEXT,
  volume_24h_wax TEXT,
  PRIMARY KEY (contract, symbol, source, pair_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_waxonedge_price_snapshots_token_time
  ON waxonedge_price_snapshots (contract, symbol, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_waxonedge_price_snapshots_source_pair_time
  ON waxonedge_price_snapshots (source, pair_id, timestamp DESC);
