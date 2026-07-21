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
  network_heat INTEGER NOT NULL DEFAULT 0,
  network_heat_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  player_pressure_score INTEGER NOT NULL DEFAULT 0,
  pps_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cooldown_strikes INTEGER NOT NULL DEFAULT 0,
  last_cooldown_at DATETIME,
  mini_game_skip_count INTEGER NOT NULL DEFAULT 0,
  mini_game_last_played TEXT,
  mini_game_entropy_seed INTEGER NOT NULL DEFAULT 0,
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

-- Shared arcade progression sync tables
-- Authoritative server-side bridge from local arcade runs -> community XP.

CREATE TABLE IF NOT EXISTS arcade_progression_state (
  telegram_id TEXT PRIMARY KEY,
  arcade_xp_total INTEGER NOT NULL DEFAULT 0,
  arcade_daily_xp INTEGER NOT NULL DEFAULT 0,
  arcade_daily_key TEXT NOT NULL DEFAULT '',
  arcade_restriction_level INTEGER NOT NULL DEFAULT 0,
  restricted_until DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS arcade_progression_events (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  client_run_id TEXT NOT NULL,
  game TEXT NOT NULL,
  raw_score INTEGER NOT NULL DEFAULT 0,
  local_meta_points INTEGER NOT NULL DEFAULT 0,
  normalized_points INTEGER NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'accepted',
  reason TEXT,
  processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id, client_run_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_arcade_progression_events_user_time
  ON arcade_progression_events(telegram_id, processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_arcade_progression_events_user_game_time
  ON arcade_progression_events(telegram_id, game, processed_at DESC);

CREATE TABLE IF NOT EXISTS arcade_game_enforcement_state (
  telegram_id TEXT NOT NULL,
  game TEXT NOT NULL,
  ceiling_hits INTEGER NOT NULL DEFAULT 0,
  cooldown_level INTEGER NOT NULL DEFAULT 0,
  cooldown_until DATETIME,
  last_ceiling_hit_at DATETIME,
  repeat_window_expires_at DATETIME,
  xp_weight REAL NOT NULL DEFAULT 1.0,
  lockout_until DATETIME,
  lockout_count INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, game),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

-- Crypto Moonboys Pets: Telegram-first pet roguelite progression.

CREATE TABLE IF NOT EXISTS telegram_pet_profiles (
  telegram_id     TEXT PRIMARY KEY,
  pet_name        TEXT NOT NULL DEFAULT 'Moonpet',
  species         TEXT NOT NULL DEFAULT 'moonbeast',
  stage           TEXT NOT NULL DEFAULT 'egg',
  pet_xp          INTEGER NOT NULL DEFAULT 0 CHECK (pet_xp >= 0),
  level           INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  hunger          INTEGER NOT NULL DEFAULT 25 CHECK (hunger BETWEEN 0 AND 100),
  happiness       INTEGER NOT NULL DEFAULT 70 CHECK (happiness BETWEEN 0 AND 100),
  cleanliness     INTEGER NOT NULL DEFAULT 70 CHECK (cleanliness BETWEEN 0 AND 100),
  energy          INTEGER NOT NULL DEFAULT 70 CHECK (energy BETWEEN 0 AND 100),
  health          INTEGER NOT NULL DEFAULT 75 CHECK (health BETWEEN 0 AND 100),
  streak_days     INTEGER NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  moon_gold       INTEGER NOT NULL DEFAULT 0 CHECK (moon_gold >= 0),
  moon_crystals   INTEGER NOT NULL DEFAULT 0 CHECK (moon_crystals >= 0),
  style_tokens    INTEGER NOT NULL DEFAULT 0 CHECK (style_tokens >= 0),
  equipped_food   TEXT,
  equipped_toy    TEXT,
  equipped_outfit TEXT,
  last_active_day TEXT,
  last_decay_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_profiles_pet_xp
  ON telegram_pet_profiles(pet_xp DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_profiles_updated
  ON telegram_pet_profiles(updated_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_events (
  id              TEXT PRIMARY KEY,
  telegram_id     TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  event_key       TEXT NOT NULL,
  xp_awarded      INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  pet_xp_awarded  INTEGER NOT NULL DEFAULT 0 CHECK (pet_xp_awarded >= 0),
  season_key      TEXT NOT NULL,
  day_key         TEXT NOT NULL,
  week_key        TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'accepted',
  reason          TEXT,
  metadata        TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id, event_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_user_created
  ON telegram_pet_events(telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_user_day
  ON telegram_pet_events(telegram_id, day_key, status);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_user_week
  ON telegram_pet_events(telegram_id, week_key, status);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_season_xp
  ON telegram_pet_events(season_key, pet_xp_awarded DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_runs (
  id                       TEXT PRIMARY KEY,
  telegram_id              TEXT NOT NULL,
  run_id                   TEXT NOT NULL,
  season_key               TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'extractable', 'completed', 'failed', 'extracted')),
  depth                    INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0),
  max_depth                INTEGER NOT NULL DEFAULT 5 CHECK (max_depth >= 1),
  risk_level               INTEGER NOT NULL DEFAULT 1 CHECK (risk_level >= 1),
  unbanked_pet_xp          INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_pet_xp >= 0),
  unbanked_moon_gold       INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_moon_gold >= 0),
  unbanked_moon_crystals   INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_moon_crystals >= 0),
  unbanked_style_tokens    INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_style_tokens >= 0),
  unbanked_items           TEXT NOT NULL DEFAULT '{}',
  started_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at             DATETIME,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id),
  UNIQUE(telegram_id, run_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_runs_one_open
  ON telegram_pet_runs(telegram_id)
  WHERE status IN ('active', 'extractable');

CREATE INDEX IF NOT EXISTS idx_telegram_pet_runs_user_status
  ON telegram_pet_runs(telegram_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_run_steps (
  id                       TEXT PRIMARY KEY,
  telegram_id              TEXT NOT NULL,
  run_id                   TEXT NOT NULL,
  step_index               INTEGER NOT NULL CHECK (step_index >= 1),
  choice_key               TEXT NOT NULL,
  choice_type              TEXT NOT NULL,
  event_key                TEXT NOT NULL,
  success                  INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0, 1)),
  risk_roll                REAL NOT NULL DEFAULT 0,
  pet_xp_delta             INTEGER NOT NULL DEFAULT 0,
  moon_gold_delta          INTEGER NOT NULL DEFAULT 0,
  moon_crystals_delta      INTEGER NOT NULL DEFAULT 0,
  style_tokens_delta       INTEGER NOT NULL DEFAULT 0,
  item_key                 TEXT,
  metadata                 TEXT,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id, event_key),
  UNIQUE(run_id, step_index),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_run_steps_run
  ON telegram_pet_run_steps(run_id, step_index);

CREATE TABLE IF NOT EXISTS telegram_pet_kaiju_matches (
  id                  TEXT PRIMARY KEY,
  match_id            TEXT NOT NULL UNIQUE,
  chat_id             TEXT NOT NULL,
  mode                TEXT NOT NULL DEFAULT 'solo' CHECK (mode IN ('solo', 'group')),
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'selecting', 'completed', 'cancelled')),
  player1_telegram_id TEXT NOT NULL,
  player2_telegram_id TEXT,
  player1_card_key    TEXT,
  player2_card_key    TEXT,
  cpu_card_key        TEXT,
  roll                INTEGER NOT NULL DEFAULT 0,
  category_key        TEXT,
  winner_telegram_id  TEXT,
  result              TEXT,
  score_json          TEXT,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at        DATETIME,
  FOREIGN KEY (player1_telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_kaiju_one_open_chat
  ON telegram_pet_kaiju_matches(chat_id)
  WHERE status IN ('open', 'selecting');

CREATE INDEX IF NOT EXISTS idx_telegram_pet_kaiju_chat_status
  ON telegram_pet_kaiju_matches(chat_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_kaiju_queue (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'played', 'left', 'expired')),
  queued_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  UNIQUE(chat_id, telegram_id, status)
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_kaiju_queue_chat
  ON telegram_pet_kaiju_queue(chat_id, status, queued_at ASC);

CREATE TABLE IF NOT EXISTS telegram_pet_effects (
  id          TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  effect_key  TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'pet_run',
  metadata    TEXT,
  expires_at  DATETIME,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_effects_user_effect
  ON telegram_pet_effects(telegram_id, effect_key, expires_at);

CREATE TABLE IF NOT EXISTS telegram_pet_season_state (
  telegram_id TEXT NOT NULL,
  season_key  TEXT NOT NULL,
  season_xp   INTEGER NOT NULL DEFAULT 0 CHECK (season_xp >= 0),
  weekly_xp   INTEGER NOT NULL DEFAULT 0 CHECK (weekly_xp >= 0),
  daily_xp    INTEGER NOT NULL DEFAULT 0 CHECK (daily_xp >= 0),
  daily_key   TEXT NOT NULL DEFAULT '',
  weekly_key  TEXT NOT NULL DEFAULT '',
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, season_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_season_state_rank
  ON telegram_pet_season_state(season_key, season_xp DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_notification_settings (
  telegram_id       TEXT PRIMARY KEY,
  enabled           INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  last_notified_at  DATETIME,
  last_reason       TEXT,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_notification_settings_due
  ON telegram_pet_notification_settings(enabled, last_notified_at);

CREATE TABLE IF NOT EXISTS telegram_pet_mission_completions (
  telegram_id TEXT NOT NULL,
  mission_key TEXT NOT NULL,
  window_key  TEXT NOT NULL,
  xp_awarded  INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, mission_key, window_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

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
  captured_until      DATETIME,
  capture_count       INTEGER NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_blocktopia_covert_agents_capture_window
  ON blocktopia_covert_agents(telegram_id, status, captured_until);

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
