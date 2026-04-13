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

-- ── Telegram / Community XP tables ────────────────────────────────────────────

-- Telegram user profiles; also stores optional website identity link
CREATE TABLE IF NOT EXISTS telegram_profiles (
  telegram_id       TEXT PRIMARY KEY,
  username          TEXT,
  display_name      TEXT,
  avatar_url        TEXT,
  linked_email_hash TEXT,
  linked_player_id  TEXT,    -- reserved: future arcade/website player identity bridge
  link_confirmed    INTEGER  NOT NULL DEFAULT 0,  -- set to 1 after /gklink token confirmation
  faction           TEXT DEFAULT '',
  xp_total          INTEGER DEFAULT 0,
  xp_seasonal       INTEGER DEFAULT 0,
  xp_yearly         INTEGER DEFAULT 0,
  last_seen_at      DATETIME,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_profiles_xp
  ON telegram_profiles(xp_total DESC);

-- Immutable XP event log — never deleted, used for auditing and recomputation
CREATE TABLE IF NOT EXISTS telegram_xp_events (
  id          TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  xp_delta    INTEGER NOT NULL,
  source      TEXT NOT NULL,
  source_ref  TEXT DEFAULT '',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_xp_events_telegram
  ON telegram_xp_events(telegram_id, created_at DESC);

-- One row per (telegram_id, UTC date) — enforces single daily claim
CREATE TABLE IF NOT EXISTS telegram_daily_claims (
  telegram_id TEXT NOT NULL,
  claim_date  TEXT NOT NULL,
  PRIMARY KEY (telegram_id, claim_date)
);

-- Lore / puzzle quests authored by admins
CREATE TABLE IF NOT EXISTS telegram_quests (
  id          TEXT PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  quest_type  TEXT NOT NULL,
  answer_hash TEXT DEFAULT '',
  xp_reward   INTEGER DEFAULT 0,
  is_active   INTEGER DEFAULT 1,
  starts_at   DATETIME,
  ends_at     DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quests_active
  ON telegram_quests(is_active, starts_at, ends_at);

-- Player quest submission attempts
CREATE TABLE IF NOT EXISTS telegram_quest_submissions (
  id              TEXT PRIMARY KEY,
  quest_id        TEXT NOT NULL,
  telegram_id     TEXT NOT NULL,
  submission_text TEXT NOT NULL,
  is_correct      INTEGER DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quest_submissions_player
  ON telegram_quest_submissions(telegram_id, quest_id);

CREATE INDEX IF NOT EXISTS idx_quest_submissions_correct
  ON telegram_quest_submissions(quest_id, is_correct, telegram_id);

-- Raw Telegram group event log for audit and potential XP rewards
CREATE TABLE IF NOT EXISTS telegram_group_events (
  id           TEXT PRIMARY KEY,
  telegram_id  TEXT,
  chat_id      TEXT,
  event_type   TEXT NOT NULL,
  payload_json TEXT DEFAULT '{}',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_group_events_type
  ON telegram_group_events(event_type, created_at DESC);

-- ── Telegram/community season & year reset tracking ───────────────────────────

-- Single-row meta (meta_key always = 'current').
-- Mirrors leaderboard:meta KV key used by the arcade leaderboard-worker.
-- season_start advances every 90 days; year_start advances on New Year UTC.
CREATE TABLE IF NOT EXISTS telegram_community_meta (
  meta_key      TEXT PRIMARY KEY DEFAULT 'current',
  season_start  DATETIME NOT NULL,
  season_number INTEGER  NOT NULL DEFAULT 1,
  year_start    DATETIME NOT NULL,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- One row per finished 90-day season (top TG_ARCHIVE_TOP_N entries preserved).
CREATE TABLE IF NOT EXISTS telegram_season_archives (
  season_number    INTEGER  PRIMARY KEY,
  season_start     DATETIME NOT NULL,
  season_end       DATETIME NOT NULL,
  top_entries_json TEXT     NOT NULL DEFAULT '[]'
);

-- One row per finished calendar year (top TG_ARCHIVE_TOP_N yearly entries preserved).
CREATE TABLE IF NOT EXISTS telegram_year_archives (
  year             INTEGER  PRIMARY KEY,
  year_start       DATETIME NOT NULL,
  year_end         DATETIME NOT NULL,
  top_entries_json TEXT     NOT NULL DEFAULT '[]'
);

-- ── GK command system (migration 002) ─────────────────────────────────────────

-- Short-lived tokens issued by the /gklink bot command; single-use, 15-minute TTL.
-- Applied via: wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/002_gk_commands.sql --remote
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token        TEXT PRIMARY KEY,
  telegram_id  TEXT NOT NULL,
  expires_at   DATETIME NOT NULL,
  used         INTEGER NOT NULL DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_link_tokens_telegram
  ON telegram_link_tokens(telegram_id, expires_at);

-- Migration: add link_confirmed to telegram_profiles.
-- Run once manually against live D1 if adding to an existing database:
--   ALTER TABLE telegram_profiles ADD COLUMN link_confirmed INTEGER NOT NULL DEFAULT 0;
