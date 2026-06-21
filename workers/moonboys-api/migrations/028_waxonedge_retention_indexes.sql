-- Migration 028: WaxOnEdge retention cleanup indexes
-- App-table retention is separate from D1 Time Travel backups.

CREATE INDEX IF NOT EXISTS idx_waxonedge_trades_traded_at
  ON waxonedge_trades (traded_at);

CREATE INDEX IF NOT EXISTS idx_waxonedge_trades_raw_json_traded_at
  ON waxonedge_trades (traded_at)
  WHERE raw_json IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_waxonedge_chart_interval_time
  ON waxonedge_chart_candles (interval, bucket_time);

CREATE INDEX IF NOT EXISTS idx_waxonedge_sync_runs_started
  ON waxonedge_sync_runs (started_at);
