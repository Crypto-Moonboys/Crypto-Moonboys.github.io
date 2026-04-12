-- Comments (self-contained: name/email_hash stored directly; no user FK required)
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email_hash TEXT DEFAULT '',
  telegram_username TEXT DEFAULT '',
  discord_username TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  text TEXT NOT NULL,
  approved INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migration: add discord_username and avatar_url to existing comments tables
-- Safe to run multiple times; D1 will ignore if column already exists.
-- Run manually if applying to a deployed database:
--   ALTER TABLE comments ADD COLUMN discord_username TEXT DEFAULT '';
--   ALTER TABLE comments ADD COLUMN avatar_url TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_comments_page_approved
  ON comments(page_id, approved, created_at DESC);

-- Per-comment up/down votes
CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  vote TEXT NOT NULL CHECK(vote IN ('up','down')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (comment_id) REFERENCES comments(id)
);

CREATE INDEX IF NOT EXISTS idx_votes_comment ON votes(comment_id);

-- Page likes
CREATE TABLE IF NOT EXISTS page_likes (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_page_likes_page ON page_likes(page_id);

-- Citation votes
CREATE TABLE IF NOT EXISTS citation_votes (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  cite_id TEXT NOT NULL,
  vote TEXT NOT NULL CHECK(vote IN ('up','down')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_citation_votes_page_cite
  ON citation_votes(page_id, cite_id);

-- Daily keywords
CREATE TABLE IF NOT EXISTS daily_keywords (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  rarity TEXT,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);