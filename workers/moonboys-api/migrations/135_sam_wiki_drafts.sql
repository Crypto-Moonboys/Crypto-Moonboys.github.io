CREATE TABLE IF NOT EXISTS sam_wiki_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intake_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'queued',
  feedback TEXT NOT NULL DEFAULT '',
  pending_payload TEXT NOT NULL DEFAULT '',
  pr_number INTEGER NOT NULL DEFAULT 0,
  head_sha TEXT NOT NULL DEFAULT '',
  review_id INTEGER NOT NULL DEFAULT 0,
  reviewed INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  owner_notice INTEGER NOT NULL DEFAULT 0,
  polled_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sam_wiki_draft_polls ON sam_wiki_drafts (state, polled_at, id);
