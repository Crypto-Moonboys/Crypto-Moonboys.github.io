-- Migration 029: Wiki article engagement and mission rewards
-- Adds server-authoritative persistence for wiki comments, likes,
-- citation votes, and idempotent daily wiki mission completions.

CREATE TABLE IF NOT EXISTS wiki_comments (
  id                  TEXT PRIMARY KEY,
  page_id             TEXT NOT NULL,
  telegram_id          TEXT,
  name                TEXT NOT NULL,
  email_hash           TEXT NOT NULL,
  avatar_url           TEXT,
  telegram_username    TEXT,
  discord_username     TEXT,
  text                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  votes_up            INTEGER NOT NULL DEFAULT 0,
  votes_down          INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wiki_comments_page_created
  ON wiki_comments(page_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wiki_comment_votes (
  comment_id          TEXT NOT NULL,
  telegram_id         TEXT NOT NULL,
  vote                TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, telegram_id),
  FOREIGN KEY (comment_id) REFERENCES wiki_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wiki_page_likes (
  page_id             TEXT NOT NULL,
  telegram_id         TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (page_id, telegram_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wiki_page_likes_page
  ON wiki_page_likes(page_id);

CREATE TABLE IF NOT EXISTS wiki_citation_votes (
  page_id             TEXT NOT NULL,
  cite_id             TEXT NOT NULL,
  telegram_id         TEXT NOT NULL,
  vote                TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (page_id, cite_id, telegram_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wiki_citation_votes_citation
  ON wiki_citation_votes(page_id, cite_id);

CREATE TABLE IF NOT EXISTS wiki_mission_completions (
  page_id             TEXT NOT NULL,
  mission_id          TEXT NOT NULL,
  mission_window      TEXT NOT NULL,
  telegram_id         TEXT NOT NULL,
  source              TEXT,
  source_id           TEXT,
  xp_awarded          INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (page_id, mission_id, mission_window, telegram_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wiki_mission_completions_user_window
  ON wiki_mission_completions(telegram_id, mission_window);
