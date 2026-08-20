-- 069_nodes_wiki.sql
-- Crypto Moonboys Nodes Wiki v1 runtime index.
-- Git catalogue remains editorial source of truth; D1 is the query/live-data layer.

CREATE TABLE IF NOT EXISTS node_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_name TEXT,
  ticker TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  node_type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'needs_review',
  wiki_url TEXT NOT NULL,
  market_mode TEXT NOT NULL DEFAULT 'not_applicable_or_platform',
  market_provider TEXT,
  market_provider_id TEXT,
  last_verified TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_node_projects_ticker ON node_projects(ticker);
CREATE INDEX IF NOT EXISTS idx_node_projects_category ON node_projects(category);
CREATE INDEX IF NOT EXISTS idx_node_projects_status ON node_projects(status);
CREATE INDEX IF NOT EXISTS idx_node_projects_market_provider ON node_projects(market_provider, market_provider_id);

CREATE TABLE IF NOT EXISTS node_technical (
  project_id TEXT PRIMARY KEY,
  hardware TEXT NOT NULL DEFAULT '',
  reward_type TEXT NOT NULL DEFAULT '',
  process TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(project_id) REFERENCES node_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS node_links (
  project_id TEXT PRIMARY KEY,
  website TEXT,
  whitepaper TEXT,
  roadmap TEXT,
  docs TEXT,
  github TEXT,
  FOREIGN KEY(project_id) REFERENCES node_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS node_market_data (
  project_id TEXT PRIMARY KEY,
  price_usd REAL,
  market_cap_usd REAL,
  volume_24h_usd REAL,
  main_exchange TEXT,
  main_pair TEXT,
  source TEXT,
  updated_at TEXT,
  FOREIGN KEY(project_id) REFERENCES node_projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_node_market_volume ON node_market_data(volume_24h_usd DESC);
CREATE INDEX IF NOT EXISTS idx_node_market_updated ON node_market_data(updated_at);

CREATE TABLE IF NOT EXISTS node_source_state (
  project_id TEXT NOT NULL,
  field TEXT NOT NULL,
  url TEXT NOT NULL,
  status_code INTEGER,
  ok INTEGER NOT NULL DEFAULT 0,
  content_fingerprint TEXT,
  checked_at TEXT NOT NULL,
  error TEXT,
  PRIMARY KEY(project_id, field),
  FOREIGN KEY(project_id) REFERENCES node_projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_node_source_state_checked ON node_source_state(checked_at);
CREATE INDEX IF NOT EXISTS idx_node_source_state_ok ON node_source_state(ok);

CREATE TABLE IF NOT EXISTS node_review_queue (
  project_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  details TEXT,
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  PRIMARY KEY(project_id, reason),
  FOREIGN KEY(project_id) REFERENCES node_projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_node_review_open ON node_review_queue(resolved_at, severity, detected_at);

CREATE TABLE IF NOT EXISTS node_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT,
  event_type TEXT NOT NULL,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  source TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_node_audit_project ON node_audit_log(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS node_runtime_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
