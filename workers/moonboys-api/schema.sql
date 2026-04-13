-- ============================================================================
-- MOONBOYS API / WIKICOMS — HARDENED D1 SCHEMA
-- Stronger competitive version:
-- - one Telegram user = one comment vote per comment
-- - one Telegram user = one like per page
-- - one Telegram user = one citation vote per citation
-- - keeps current worker-compatible tables
-- - adds stronger uniqueness + auditability
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ── Comments ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comments (
  id                TEXT PRIMARY KEY,
  page_id           TEXT NOT NULL,
  name              TEXT NOT NULL,
  email_hash        TEXT DEFAULT '',
  telegram_username TEXT DEFAULT '',
  discord_username  TEXT DEFAULT '',
  avatar_url        TEXT DEFAULT '',
  text              TEXT NOT NULL,
  approved          INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comments_page_approved_created
  ON comments(page_id, approved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_created
  ON comments(created_at DESC);

-- ── Per-comment votes (HARDENED) ────────────────────────────────────────────
-- One telegram user can vote once per comment.
-- If you later want vote-changing, update existing row instead of inserting a new one.

CREATE TABLE IF NOT EXISTS votes (
  id          TEXT PRIMARY KEY,
  comment_id  TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  vote        TEXT NOT NULL CHECK (vote IN ('up','down')),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_votes_comment
  ON votes(comment_id);

CREATE INDEX IF NOT EXISTS idx_votes_telegram
  ON votes(telegram_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_unique_user_comment
  ON votes(comment_id, telegram_id);

-- ── Page likes (HARDENED) ───────────────────────────────────────────────────
-- One telegram user can like a page once.

CREATE TABLE IF NOT EXISTS page_likes (
  id          TEXT PRIMARY KEY,
  page_id      TEXT NOT NULL,
  telegram_id  TEXT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_page_likes_page
  ON page_likes(page_id);

CREATE INDEX IF NOT EXISTS idx_page_likes_telegram
  ON page_likes(telegram_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_page_likes_unique_user_page
  ON page_likes(page_id, telegram_id);

-- ── Citation votes (HARDENED) ───────────────────────────────────────────────
-- One telegram user can vote once per citation on a page.

CREATE TABLE IF NOT EXISTS citation_votes (
  id          TEXT PRIMARY KEY,
  page_id      TEXT NOT NULL,
  cite_id      TEXT NOT NULL,
  telegram_id  TEXT NOT NULL,
  vote         TEXT NOT NULL CHECK (vote IN ('up','down')),
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_citation_votes_page_cite
  ON citation_votes(page_id, cite_id);

CREATE INDEX IF NOT EXISTS idx_citation_votes_telegram
  ON citation_votes(telegram_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_citation_votes_unique_user_target
  ON citation_votes(page_id, cite_id, telegram_id);

-- ── Optional / unused by current worker, safe to keep ──────────────────────

CREATE TABLE IF NOT EXISTS daily_keywords (
  id         TEXT PRIMARY KEY,
  keyword    TEXT NOT NULL,
  rarity     TEXT,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_keywords_active_created
  ON daily_keywords(active, created_at DESC);

-- ── Telegram / Community XP tables ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_profiles (
  telegram_id       TEXT PRIMARY KEY,
  username          TEXT,
  display_name      TEXT,
  avatar_url        TEXT,
  linked_email_hash TEXT,
  linked_player_id  TEXT,
  link_confirmed    INTEGER NOT NULL DEFAULT 0 CHECK (link_confirmed IN (0,1)),
  faction           TEXT DEFAULT '',
  xp_total          INTEGER NOT NULL DEFAULT 0,
  xp_seasonal       INTEGER NOT NULL DEFAULT 0,
  xp_yearly         INTEGER NOT NULL DEFAULT 0,
  last_seen_at      DATETIME,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_profiles_xp_total
  ON telegram_profiles(xp_total DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_profiles_xp_seasonal
  ON telegram_profiles(xp_seasonal DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_profiles_xp_yearly
  ON telegram_profiles(xp_yearly DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_profiles_username
  ON telegram_profiles(username);

-- Immutable XP event log

CREATE TABLE IF NOT EXISTS telegram_xp_events (
  id          TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  xp_delta    INTEGER NOT NULL,
  source      TEXT NOT NULL,
  source_ref  TEXT DEFAULT '',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_xp_events_telegram_created
  ON telegram_xp_events(telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xp_events_type_created
  ON telegram_xp_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xp_events_source_ref
  ON telegram_xp_events(source, source_ref);

-- One row per telegram_id per UTC day

CREATE TABLE IF NOT EXISTS telegram_daily_claims (
  telegram_id TEXT NOT NULL,
  claim_date  TEXT NOT NULL,
  PRIMARY KEY (telegram_id, claim_date),
  FOREIGN KEY (telegram_id) REFERENCES telegram_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_claims_date
  ON telegram_daily_claims(claim_date);

-- Quests

CREATE TABLE IF NOT EXISTS telegram_quests (
  id          TEXT PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  quest_type  TEXT NOT NULL,
  answer_hash TEXT DEFAULT '',
  xp_reward   INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  starts_at   DATETIME,
  ends_at     DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quests_active_window
  ON telegram_quests(is_active, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_quests_slug
  ON telegram_quests(slug);

-- Quest submissions

CREATE TABLE IF NOT EXISTS telegram_quest_submissions (
  id              TEXT PRIMARY KEY,
  quest_id        TEXT NOT NULL,
  telegram_id     TEXT NOT NULL,
  submission_text TEXT NOT NULL,
  is_correct      INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0,1)),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quest_id) REFERENCES telegram_quests(id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quest_submissions_player
  ON telegram_quest_submissions(telegram_id, quest_id);

CREATE INDEX IF NOT EXISTS idx_quest_submissions_correct
  ON telegram_quest_submissions(quest_id, is_correct, telegram_id);

CREATE INDEX IF NOT EXISTS idx_quest_submissions_created
  ON telegram_quest_submissions(created_at DESC);

-- Raw Telegram group events

CREATE TABLE IF NOT EXISTS telegram_group_events (
  id           TEXT PRIMARY KEY,
  telegram_id  TEXT,
  chat_id      TEXT,
  event_type   TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_profiles(telegram_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_group_events_type_created
  ON telegram_group_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_group_events_telegram_created
  ON telegram_group_events(telegram_id, created_at DESC);

-- ── Telegram/community season & year reset tracking ────────────────────────

CREATE TABLE IF NOT EXISTS telegram_community_meta (
  meta_key      TEXT PRIMARY KEY DEFAULT 'current',
  season_start  DATETIME NOT NULL,
  season_number INTEGER NOT NULL DEFAULT 1,
  year_start    DATETIME NOT NULL,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_season_archives (
  season_number    INTEGER PRIMARY KEY,
  season_start     DATETIME NOT NULL,
  season_end       DATETIME NOT NULL,
  top_entries_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS telegram_year_archives (
  year             INTEGER PRIMARY KEY,
  year_start       DATETIME NOT NULL,
  year_end         DATETIME NOT NULL,
  top_entries_json TEXT NOT NULL DEFAULT '[]'
);

-- ── GK link tokens ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token        TEXT PRIMARY KEY,
  telegram_id  TEXT NOT NULL,
  expires_at   DATETIME NOT NULL,
  used         INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0,1)),
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_link_tokens_telegram_expires
  ON telegram_link_tokens(telegram_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_link_tokens_expires_used
  ON telegram_link_tokens(expires_at, used);
