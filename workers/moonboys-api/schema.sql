-- ============================================================================
-- MOONBOYS API / WIKICOMS — REAL LIVE SCHEMA (HARDENED)
--
-- This schema matches the real live D1 structure and the rewritten worker:
-- - telegram_users
-- - telegram_xp_log
-- - telegram_activity_log
-- - telegram_factions
-- - telegram_faction_members
-- - telegram_leaderboard
-- - telegram_link_tokens (is_used)
-- - telegram_quests
-- - telegram_quest_completions
-- - telegram_seasons
-- - telegram_season_archives
-- - telegram_year_archives
--
-- It does NOT invent the abandoned/new model tables:
-- - telegram_profiles
-- - telegram_xp_events
-- - telegram_group_events
-- - telegram_daily_claims
-- - telegram_quest_submissions
-- - comments / votes / page_likes / citation_votes
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ── Core Telegram users ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id    TEXT UNIQUE NOT NULL,
  username       TEXT,
  first_name     TEXT,
  last_name      TEXT,
  wallet_address TEXT,
  xp             INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level          INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_users_telegram_id
  ON telegram_users(telegram_id);

CREATE INDEX IF NOT EXISTS idx_telegram_users_xp_desc
  ON telegram_users(xp DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_users_level_desc
  ON telegram_users(level DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_users_username
  ON telegram_users(username);

-- ── XP audit log ─────────────────────────────────────────────────────────────
-- Immutable log of all XP changes. Stronger than storing raw counters only.

CREATE TABLE IF NOT EXISTS telegram_xp_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id  TEXT NOT NULL,
  action       TEXT NOT NULL,
  xp_change    INTEGER NOT NULL,
  reference_id TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_xp_log_telegram_created
  ON telegram_xp_log(telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_xp_log_action_created
  ON telegram_xp_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_xp_log_reference
  ON telegram_xp_log(reference_id);

-- Prevent duplicate first-start grants if reference_id is used consistently.
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_xp_log_first_start_once
  ON telegram_xp_log(telegram_id, action)
  WHERE action = 'first_start';

-- ── Activity log ─────────────────────────────────────────────────────────────
-- General audit trail for bot/user actions.

CREATE TABLE IF NOT EXISTS telegram_activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  action      TEXT NOT NULL,
  metadata    TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_activity_log_telegram_created
  ON telegram_activity_log(telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_activity_log_action_created
  ON telegram_activity_log(action, created_at DESC);

-- ── Factions ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_factions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  icon        TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_factions_name
  ON telegram_factions(name);

CREATE TABLE IF NOT EXISTS telegram_faction_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  faction_id  INTEGER NOT NULL,
  role        TEXT DEFAULT 'member',
  joined_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (faction_id) REFERENCES telegram_factions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_faction_members_faction
  ON telegram_faction_members(faction_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_faction_members_telegram
  ON telegram_faction_members(telegram_id);

-- ── Seasons + leaderboard ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_seasons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT,
  start_date  DATETIME,
  end_date    DATETIME,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_seasons_active
  ON telegram_seasons(is_active, start_date DESC);

CREATE TABLE IF NOT EXISTS telegram_leaderboard (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  season_id   INTEGER NOT NULL,
  xp          INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  rank        INTEGER,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (season_id) REFERENCES telegram_seasons(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_leaderboard_unique_user_season
  ON telegram_leaderboard(telegram_id, season_id);

CREATE INDEX IF NOT EXISTS idx_telegram_leaderboard_season_xp
  ON telegram_leaderboard(season_id, xp DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_leaderboard_season_rank
  ON telegram_leaderboard(season_id, rank ASC);

-- Archives
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

-- Optional compatibility metadata table used by some branches
CREATE TABLE IF NOT EXISTS telegram_community_meta (
  meta_key      TEXT PRIMARY KEY DEFAULT 'current',
  season_start  DATETIME NOT NULL,
  season_number INTEGER NOT NULL DEFAULT 1,
  year_start    DATETIME NOT NULL,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Quests ───────────────────────────────────────────────────────────────────
-- Real live model: no answer_hash, no slug, no quest_type.

CREATE TABLE IF NOT EXISTS telegram_quests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  xp_reward   INTEGER NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  start_date  DATETIME,
  end_date    DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_quests_active_window
  ON telegram_quests(is_active, start_date, end_date);

CREATE TABLE IF NOT EXISTS telegram_quest_completions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id  TEXT NOT NULL,
  quest_id     INTEGER NOT NULL,
  completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  xp_awarded   INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  UNIQUE(telegram_id, quest_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (quest_id) REFERENCES telegram_quests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_quest_completions_telegram
  ON telegram_quest_completions(telegram_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_quest_completions_quest
  ON telegram_quest_completions(quest_id, completed_at DESC);

-- ── Link tokens ──────────────────────────────────────────────────────────────
-- Real live model uses is_used, not used.

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT UNIQUE NOT NULL,
  telegram_id TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  is_used    INTEGER NOT NULL DEFAULT 0 CHECK (is_used IN (0,1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_link_tokens_token
  ON telegram_link_tokens(token);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_telegram_expires
  ON telegram_link_tokens(telegram_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expires_used
  ON telegram_link_tokens(expires_at, is_used);

-- ── Optional event system already present in live DB ─────────────────────────

CREATE TABLE IF NOT EXISTS telegram_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  start_date  DATETIME,
  end_date    DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_event_participants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  event_id    INTEGER NOT NULL,
  joined_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id, event_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES telegram_events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_event_participants_event
  ON telegram_event_participants(event_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_event_participants_telegram
  ON telegram_event_participants(telegram_id, joined_at DESC);

-- ── Optional settings table already present in live DB ───────────────────────

CREATE TABLE IF NOT EXISTS telegram_settings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id, setting_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_settings_telegram
  ON telegram_settings(telegram_id);

-- ── Seed factions safely ─────────────────────────────────────────────────────

INSERT OR IGNORE INTO telegram_factions (name, description, icon) VALUES
  ('diamond-hands', 'Long-term holders with conviction.', '💎'),
  ('hodl-warriors', 'Battle-hardened holders in the trenches.', '⚔️'),
  ('graffpunks', 'Street-coded rebels of the culture.', '🎨');

-- ── Block Topia RPG progression extensions ───────────────────────────────────
-- The worker stores Block Topia progression in blocktopia_progression.
-- These columns back persistent RPG rewards/upgrades.

CREATE TABLE IF NOT EXISTS blocktopia_progression (
  telegram_id TEXT PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  gems INTEGER NOT NULL DEFAULT 0,
  tier INTEGER NOT NULL DEFAULT 1,
  win_streak INTEGER NOT NULL DEFAULT 0,
  upgrade_efficiency INTEGER NOT NULL DEFAULT 0,
  upgrade_signal INTEGER NOT NULL DEFAULT 0,
  upgrade_defense INTEGER NOT NULL DEFAULT 0,
  upgrade_gem INTEGER NOT NULL DEFAULT 0,
  upgrade_npc INTEGER NOT NULL DEFAULT 0,
  rpg_mode_active INTEGER NOT NULL DEFAULT 0,
  faction TEXT NOT NULL DEFAULT 'unaligned',
  faction_xp INTEGER NOT NULL DEFAULT 0,
  faction_last_switch INTEGER,
  last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blocktopia_progression_xp
  ON blocktopia_progression(xp DESC);

CREATE INDEX IF NOT EXISTS idx_blocktopia_progression_tier
  ON blocktopia_progression(tier DESC);

CREATE INDEX IF NOT EXISTS idx_blocktopia_progression_updated
  ON blocktopia_progression(updated_at DESC);

CREATE TABLE IF NOT EXISTS blocktopia_progression_events (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  action TEXT NOT NULL,
  action_type TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  xp_change INTEGER NOT NULL DEFAULT 0,
  gems_change INTEGER NOT NULL DEFAULT 0,
  admin_telegram_id TEXT,
  reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES blocktopia_progression(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blocktopia_events_user_created
  ON blocktopia_progression_events(telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blocktopia_events_user_action_created
  ON blocktopia_progression_events(telegram_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blocktopia_events_user_action_type_created
  ON blocktopia_progression_events(telegram_id, action, action_type, created_at DESC);

-- Block Topia covert network: player-owned covert agents.

CREATE TABLE IF NOT EXISTS blocktopia_covert_agents (
  id                  TEXT PRIMARY KEY,
  telegram_id         TEXT NOT NULL,
  agent_type          TEXT NOT NULL DEFAULT 'infiltrator',
  level               INTEGER NOT NULL DEFAULT 1,
  stealth             INTEGER NOT NULL DEFAULT 58,
  resilience          INTEGER NOT NULL DEFAULT 46,
  loyalty             INTEGER NOT NULL DEFAULT 62,
  heat                INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'exposed', 'captured')),
  current_node_id     TEXT,
  home_district_id    TEXT,
  assigned_operation  TEXT,
  assigned_until      DATETIME,
  stealth_boost_until DATETIME,
  recovery_count      INTEGER NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES blocktopia_progression(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_agents_user_status
  ON blocktopia_covert_agents(telegram_id, status);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_agents_assigned_operation
  ON blocktopia_covert_agents(assigned_operation);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_agents_type_status
  ON blocktopia_covert_agents(agent_type, status);

CREATE TABLE IF NOT EXISTS blocktopia_covert_operations (
  id                TEXT PRIMARY KEY,
  telegram_id       TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  operation_type    TEXT NOT NULL DEFAULT 'infiltrate',
  target_node_id    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'success', 'failed', 'critical_failure')),
  success_roll      INTEGER,
  detection_roll    INTEGER,
  reward_xp         INTEGER NOT NULL DEFAULT 0,
  reward_gems       INTEGER NOT NULL DEFAULT 0,
  heat_before       INTEGER NOT NULL DEFAULT 0,
  heat_after        INTEGER NOT NULL DEFAULT 0,
  node_interference_delta INTEGER NOT NULL DEFAULT 0,
  district_support_delta  INTEGER NOT NULL DEFAULT 0,
  district_pressure_delta INTEGER NOT NULL DEFAULT 0,
  faction_pressure_delta  INTEGER NOT NULL DEFAULT 0,
  sam_pressure_delta      INTEGER NOT NULL DEFAULT 0,
  local_risk_delta        INTEGER NOT NULL DEFAULT 0,
  started_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolves_at       DATETIME NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES blocktopia_progression(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES blocktopia_covert_agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_operations_user_status
  ON blocktopia_covert_operations(telegram_id, status, resolves_at);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_operations_agent_status
  ON blocktopia_covert_operations(agent_id, status);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_operations_target_created
  ON blocktopia_covert_operations(target_node_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_operations_pressure
  ON blocktopia_covert_operations(target_node_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blocktopia_covert_one_active_operation_per_agent
  ON blocktopia_covert_operations(agent_id)
  WHERE status = 'active';
