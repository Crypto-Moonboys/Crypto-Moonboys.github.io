CREATE TABLE IF NOT EXISTS waxonedge_source_index_state (
  source TEXT PRIMARY KEY,
  sync_cycle_id TEXT,
  cursor TEXT,
  page_count INTEGER DEFAULT 0,
  row_count INTEGER DEFAULT 0,
  complete INTEGER DEFAULT 0,
  truncated INTEGER DEFAULT 0,
  status TEXT,
  error TEXT,
  started_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_waxonedge_source_index_state_cycle
  ON waxonedge_source_index_state (sync_cycle_id, complete, truncated, status);
