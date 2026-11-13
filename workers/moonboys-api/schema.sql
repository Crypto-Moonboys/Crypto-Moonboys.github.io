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

-- Atomic Community awards; legacy XP logs remain immutable.
CREATE TABLE IF NOT EXISTS telegram_community_xp_awards (
  telegram_id TEXT NOT NULL,
  action TEXT NOT NULL,
  claim_key TEXT NOT NULL,
  reference_id TEXT,
  xp_change INTEGER NOT NULL CHECK (xp_change >= 0),
  season_id INTEGER,
  earned_at TEXT NOT NULL,
  settlement_token TEXT NOT NULL,
  PRIMARY KEY (telegram_id, action, claim_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id),
  FOREIGN KEY (season_id) REFERENCES telegram_seasons(id)
);

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

CREATE TABLE IF NOT EXISTS telegram_community_meta (
  meta_key      TEXT PRIMARY KEY DEFAULT 'current',
  season_start  DATETIME NOT NULL,
  season_number INTEGER NOT NULL DEFAULT 1,
  year_start    DATETIME NOT NULL,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Quests ───────────────────────────────────────────────────────────────────

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

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token       TEXT UNIQUE NOT NULL,
  telegram_id TEXT NOT NULL,
  expires_at  DATETIME NOT NULL,
  is_used     INTEGER NOT NULL DEFAULT 0 CHECK (is_used IN (0,1)),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_link_tokens_token
  ON telegram_link_tokens(token);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_telegram_expires
  ON telegram_link_tokens(telegram_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expires_used
  ON telegram_link_tokens(expires_at, is_used);

-- ── Optional event/settings system ───────────────────────────────────────────

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

CREATE TABLE IF NOT EXISTS telegram_settings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id   TEXT NOT NULL,
  setting_key   TEXT NOT NULL,
  setting_value TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id, setting_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_settings_telegram
  ON telegram_settings(telegram_id);

-- Moonpet owns a dedicated cursor table because historical production
-- telegram_settings uses the legacy global key/value schema.
CREATE TABLE IF NOT EXISTS telegram_pet_recovery_cursors (
  telegram_id   TEXT NOT NULL,
  setting_key   TEXT NOT NULL,
  setting_value TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, setting_key)
);

-- Beta correction history for impossible seasonal Pet XP surplus. This table
-- intentionally permits multiple corrections for one player/season so a
-- post-deployment rerun can record and repair drift recreated before rollout.
CREATE TABLE IF NOT EXISTS moonpet_beta_xp_rebaseline_v2 (
  correction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  previous_season_xp INTEGER NOT NULL,
  retained_season_xp INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT
);

INSERT OR IGNORE INTO telegram_factions (name, description, icon) VALUES
  ('diamond-hands', 'Long-term holders with conviction.', '💎'),
  ('hodl-warriors', 'Battle-hardened holders in the trenches.', '⚔️'),
  ('graffpunks', 'Street-coded rebels of the culture.', '🎨');

-- ── Block Topia RPG progression ──────────────────────────────────────────────

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

-- ── Shared arcade progression ────────────────────────────────────────────────

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

-- Spendable Arcade XP is intentionally not derived from the lifetime total.
CREATE TABLE IF NOT EXISTS arcade_xp_wallets (
  telegram_id TEXT PRIMARY KEY,
  arcade_xp_earned INTEGER NOT NULL DEFAULT 0 CHECK (arcade_xp_earned >= 0),
  arcade_xp_spendable INTEGER NOT NULL DEFAULT 0 CHECK (arcade_xp_spendable >= 0),
  arcade_xp_spent INTEGER NOT NULL DEFAULT 0 CHECK (arcade_xp_spent >= 0),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  CHECK (arcade_xp_earned = arcade_xp_spendable + arcade_xp_spent)
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

-- ── Crypto Moonboy Pets ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_pet_profiles (
  telegram_id     TEXT PRIMARY KEY,
  pet_name        TEXT NOT NULL DEFAULT 'Moonpet',
  species         TEXT NOT NULL DEFAULT '',
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
  equipped_armor  TEXT,
  equipped_weapon TEXT,
  equipped_charm  TEXT,
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

CREATE TABLE IF NOT EXISTS telegram_pet_equipment_progression (
  telegram_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  slot TEXT NOT NULL,
  item_level INTEGER NOT NULL DEFAULT 1 CHECK (item_level BETWEEN 1 AND 10),
  item_xp INTEGER NOT NULL DEFAULT 0 CHECK (item_xp >= 0),
  mastery_xp INTEGER NOT NULL DEFAULT 0 CHECK (mastery_xp >= 0),
  mastery_tier INTEGER NOT NULL DEFAULT 0 CHECK (mastery_tier BETWEEN 0 AND 5),
  unlocked_effects_json TEXT NOT NULL DEFAULT '{}',
  last_used_action TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, item_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_equipment_progression_owner_slot
  ON telegram_pet_equipment_progression (telegram_id, slot, item_level DESC, mastery_tier DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_equipment_events (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  action TEXT NOT NULL,
  event_key TEXT NOT NULL,
  item_xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (item_xp_awarded >= 0),
  mastery_xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (mastery_xp_awarded >= 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (telegram_id, item_key, event_key),
  FOREIGN KEY (telegram_id, item_key)
    REFERENCES telegram_pet_equipment_progression(telegram_id, item_key)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_equipment_events_owner_item_created
  ON telegram_pet_equipment_events (telegram_id, item_key, created_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_arena_queue (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  pet_id TEXT,
  season_key TEXT,
  rank_bucket TEXT NOT NULL,
  pet_snapshot_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'waiting',
  accept_any_rank INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_arena_queue_one_waiting
  ON telegram_pet_arena_queue(chat_id, telegram_id) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_pet_arena_queue_match
  ON telegram_pet_arena_queue(chat_id, status, rank_bucket, created_at);

CREATE TABLE IF NOT EXISTS telegram_pet_arena_battles (
  id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL,
  player1_telegram_id TEXT NOT NULL,
  player2_telegram_id TEXT,
  player1_pet_id TEXT,
  player1_season_key TEXT,
  player2_pet_id TEXT,
  player2_season_key TEXT,
  player1_pet_snapshot_json TEXT NOT NULL,
  player2_pet_snapshot_json TEXT NOT NULL,
  player1_power INTEGER NOT NULL DEFAULT 0,
  player2_power INTEGER NOT NULL DEFAULT 0,
  winner_telegram_id TEXT,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'readying',
  current_round INTEGER NOT NULL DEFAULT 1,
  max_rounds INTEGER NOT NULL DEFAULT 8,
  player1_hp INTEGER NOT NULL DEFAULT 100,
  player2_hp INTEGER NOT NULL DEFAULT 100,
  player1_special INTEGER NOT NULL DEFAULT 0,
  player2_special INTEGER NOT NULL DEFAULT 0,
  last_round_log_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT,
  player1_ready_at DATETIME,
  player2_ready_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (player1_telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_arena_battles_chat_status_rank_created
  ON telegram_pet_arena_battles(chat_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_arena_battles_p1_active
  ON telegram_pet_arena_battles(chat_id, player1_telegram_id) WHERE status IN ('readying', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_arena_battles_p2_active
  ON telegram_pet_arena_battles(chat_id, player2_telegram_id)
  WHERE status IN ('readying', 'active') AND player2_telegram_id IS NOT NULL AND player2_telegram_id <> 'app';
CREATE INDEX IF NOT EXISTS idx_pet_arena_battles_p1_status_completed
  ON telegram_pet_arena_battles(player1_telegram_id, status, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_arena_battles_p2_status_completed
  ON telegram_pet_arena_battles(player2_telegram_id, status, completed_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_arena_rounds (
  id TEXT PRIMARY KEY,
  battle_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  player1_move TEXT,
  player2_move TEXT,
  player1_damage INTEGER NOT NULL DEFAULT 0,
  player2_damage INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'selecting',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  UNIQUE(battle_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_pet_arena_rounds_battle_status
  ON telegram_pet_arena_rounds(battle_id, status, round_number);

CREATE TABLE IF NOT EXISTS telegram_pet_events (
  id TEXT PRIMARY KEY,
  pet_id TEXT,
  telegram_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  pet_xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (pet_xp_awarded >= 0),
  season_key TEXT NOT NULL,
  day_key TEXT NOT NULL,
  week_key TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'accepted',
  reason TEXT,
  metadata TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id, event_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_user_created
  ON telegram_pet_events(telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_user_type_status_created
  ON telegram_pet_events(telegram_id, event_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_user_day
  ON telegram_pet_events(telegram_id, day_key, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_pet_day
  ON telegram_pet_events(pet_id, day_key, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_user_week
  ON telegram_pet_events(telegram_id, week_key, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_events_season_xp
  ON telegram_pet_events(season_key, pet_xp_awarded DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_runs (
  id TEXT PRIMARY KEY,
  pet_id TEXT,
  telegram_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'moon_alley',
  difficulty INTEGER NOT NULL DEFAULT 1 CHECK (difficulty >= 1),
  seed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'abandoned', 'extractable', 'extracted')),
  current_room INTEGER NOT NULL DEFAULT 0 CHECK (current_room >= 0),
  max_room INTEGER NOT NULL DEFAULT 5 CHECK (max_room >= 1),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  depth INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0),
  max_depth INTEGER NOT NULL DEFAULT 5 CHECK (max_depth >= 1),
  risk_level INTEGER NOT NULL DEFAULT 1 CHECK (risk_level >= 1),
  unbanked_pet_xp INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_pet_xp >= 0),
  unbanked_moon_gold INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_moon_gold >= 0),
  unbanked_moon_crystals INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_moon_crystals >= 0),
  unbanked_style_tokens INTEGER NOT NULL DEFAULT 0 CHECK (unbanked_style_tokens >= 0),
  unbanked_items TEXT NOT NULL DEFAULT '{}',
  death_reason TEXT,
  rewards_earned TEXT NOT NULL DEFAULT '{}',
  rooms_completed INTEGER NOT NULL DEFAULT 0 CHECK (rooms_completed >= 0),
  modifiers_chosen TEXT NOT NULL DEFAULT '[]',
  boss_fought TEXT,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  completed_at DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id),
  UNIQUE(telegram_id, run_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_runs_one_open
  ON telegram_pet_runs(telegram_id) WHERE status IN ('active', 'extractable');
CREATE INDEX IF NOT EXISTS idx_telegram_pet_runs_user_status
  ON telegram_pet_runs(telegram_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_run_steps (
  id TEXT PRIMARY KEY,
  pet_id TEXT,
  telegram_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL CHECK (step_index >= 1),
  choice_key TEXT NOT NULL,
  choice_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0, 1)),
  risk_roll REAL NOT NULL DEFAULT 0,
  pet_xp_delta INTEGER NOT NULL DEFAULT 0,
  moon_gold_delta INTEGER NOT NULL DEFAULT 0,
  moon_crystals_delta INTEGER NOT NULL DEFAULT 0,
  style_tokens_delta INTEGER NOT NULL DEFAULT 0,
  item_key TEXT,
  metadata TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_id, event_key),
  UNIQUE(run_id, step_index),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_run_steps_run
  ON telegram_pet_run_steps(run_id, step_index);

CREATE TABLE IF NOT EXISTS telegram_pet_reward_claims (
  claim_id TEXT PRIMARY KEY,
  pet_id TEXT,
  telegram_id TEXT NOT NULL,
  source TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  day_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'awarded', 'rejected')),
  requested_rewards TEXT NOT NULL DEFAULT '{}',
  applied_rewards TEXT NOT NULL DEFAULT '{}',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  awarded_at DATETIME,
  UNIQUE(telegram_id, source, idempotency_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_reward_claims_source
  ON telegram_pet_reward_claims(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_reward_claims_user_day
  ON telegram_pet_reward_claims(telegram_id, day_key, source);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_reward_claims_pet
  ON telegram_pet_reward_claims(pet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_reward_assets (
  claim_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('material', 'item', 'relic')),
  asset_key TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  PRIMARY KEY (claim_id, asset_type, asset_key),
  FOREIGN KEY (claim_id) REFERENCES telegram_pet_reward_claims(claim_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_reward_assets_type
  ON telegram_pet_reward_assets(asset_type, asset_key);

CREATE TABLE IF NOT EXISTS telegram_pet_inventory (
  telegram_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('material', 'item')),
  asset_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, asset_type, asset_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE VIEW IF NOT EXISTS telegram_pet_legacy_item_balances_042 AS
SELECT telegram_id, asset_key, MAX(0, SUM(quantity_delta)) AS quantity
FROM (
  SELECT telegram_id,
    COALESCE(json_extract(metadata, '$.item_key'), json_extract(metadata, '$.inventory_key')) AS asset_key,
    MAX(1, CAST(COALESCE(json_extract(metadata, '$.count'), 1) AS INTEGER)) AS quantity_delta
  FROM telegram_pet_events
  WHERE status = 'accepted' AND json_valid(metadata)
    AND COALESCE(json_extract(metadata, '$.inventory_authority'), 0) <> 1
    AND COALESCE(json_extract(metadata, '$.item_key'), json_extract(metadata, '$.inventory_key')) IS NOT NULL
  UNION ALL
  SELECT telegram_id, json_extract(metadata, '$.consumed_item_key') AS asset_key, -1 AS quantity_delta
  FROM telegram_pet_events
  WHERE status = 'accepted' AND json_valid(metadata)
    AND COALESCE(json_extract(metadata, '$.inventory_authority'), 0) <> 1
    AND json_extract(metadata, '$.consumed_item_key') IS NOT NULL
)
WHERE asset_key IN ('moon_snack', 'energy_drink', 'clean_wipe', 'lucky_charm', 'style_patch', 'adventure_map')
GROUP BY telegram_id, asset_key
HAVING SUM(quantity_delta) > 0;

CREATE TABLE IF NOT EXISTS telegram_pet_inventory_legacy_sync_042 (
  telegram_id TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, asset_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_run_rooms (
  room_id TEXT PRIMARY KEY,
  pet_id TEXT,
  run_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  room_number INTEGER NOT NULL CHECK (room_number >= 1),
  room_type TEXT NOT NULL CHECK (room_type IN ('battle', 'choice_event', 'loot', 'elite', 'boss')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'failed')),
  generated_data TEXT NOT NULL DEFAULT '{}',
  outcome_data TEXT NOT NULL DEFAULT '{}',
  reward_claim_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  UNIQUE(run_id, room_number),
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_run_modifiers (
  run_id TEXT NOT NULL,
  pet_id TEXT,
  telegram_id TEXT NOT NULL,
  modifier_id TEXT NOT NULL,
  effects_json TEXT NOT NULL DEFAULT '{}',
  chosen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, modifier_id),
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_relics (
  telegram_id TEXT NOT NULL,
  relic_id TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  effects_json TEXT NOT NULL DEFAULT '{}',
  unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, relic_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_run_history (
  telegram_id TEXT PRIMARY KEY,
  runs_completed INTEGER NOT NULL DEFAULT 0 CHECK (runs_completed >= 0),
  bosses_defeated INTEGER NOT NULL DEFAULT 0 CHECK (bosses_defeated >= 0),
  highest_room_reached INTEGER NOT NULL DEFAULT 0 CHECK (highest_room_reached >= 0),
  best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  fastest_completion_seconds INTEGER,
  rare_discoveries TEXT NOT NULL DEFAULT '[]',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_run_analytics (
  analytics_id TEXT PRIMARY KEY,
  pet_id TEXT,
  run_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('run_start', 'room_generated', 'room_resolved', 'modifier_chosen', 'boss_fought', 'run_end')),
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_run_analytics_run
  ON telegram_pet_run_analytics(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_runs_pet_status ON telegram_pet_runs(pet_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_run_steps_pet ON telegram_pet_run_steps(pet_id, run_id, step_index);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_run_rooms_pet ON telegram_pet_run_rooms(pet_id, run_id, room_number);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_run_analytics_pet ON telegram_pet_run_analytics(pet_id, run_id, created_at);

CREATE TABLE IF NOT EXISTS telegram_pet_kaiju_matches (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'solo' CHECK (mode IN ('solo', 'group')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'selecting', 'completed', 'cancelled')),
  player1_telegram_id TEXT NOT NULL,
  player2_telegram_id TEXT,
  player1_card_key TEXT,
  player2_card_key TEXT,
  cpu_card_key TEXT,
  roll INTEGER NOT NULL DEFAULT 0,
  category_key TEXT,
  winner_telegram_id TEXT,
  result TEXT,
  score_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (player1_telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_kaiju_one_open_chat
  ON telegram_pet_kaiju_matches(chat_id) WHERE status IN ('open', 'selecting');
CREATE INDEX IF NOT EXISTS idx_telegram_pet_kaiju_chat_status
  ON telegram_pet_kaiju_matches(chat_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_kaiju_matches_p1_status_completed
  ON telegram_pet_kaiju_matches(player1_telegram_id, status, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_kaiju_matches_p2_status_completed
  ON telegram_pet_kaiju_matches(player2_telegram_id, status, completed_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_kaiju_queue (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'played', 'left', 'expired')),
  queued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_kaiju_queue_one_waiting
  ON telegram_pet_kaiju_queue(chat_id, telegram_id) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_telegram_pet_kaiju_queue_chat
  ON telegram_pet_kaiju_queue(chat_id, status, queued_at ASC);

CREATE TABLE IF NOT EXISTS telegram_pet_repeat_reward_slots (
  telegram_id   TEXT NOT NULL,
  day_key       TEXT NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('event', 'kaiju')),
  claimed_count INTEGER NOT NULL DEFAULT 0 CHECK (claimed_count >= 0),
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, day_key, mode),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_repeat_reward_slots_day_mode
  ON telegram_pet_repeat_reward_slots(day_key, mode);

CREATE TABLE IF NOT EXISTS telegram_pet_activity_sessions (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('sleep', 'train', 'work', 'explore')),
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at DATETIME NOT NULL,
  claimed_at DATETIME,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
  metadata TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_activity_one_active
  ON telegram_pet_activity_sessions(telegram_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_telegram_pet_activity_user_status
  ON telegram_pet_activity_sessions(telegram_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_activity_expiry
  ON telegram_pet_activity_sessions(status, ends_at);

CREATE TABLE IF NOT EXISTS telegram_pet_effects (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  effect_key TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'pet_run',
  metadata TEXT,
  expires_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_effects_user_effect
  ON telegram_pet_effects(telegram_id, effect_key, expires_at);

CREATE TABLE IF NOT EXISTS telegram_pet_season_state (
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  season_xp INTEGER NOT NULL DEFAULT 0 CHECK (season_xp >= 0),
  weekly_xp INTEGER NOT NULL DEFAULT 0 CHECK (weekly_xp >= 0),
  daily_xp INTEGER NOT NULL DEFAULT 0 CHECK (daily_xp >= 0),
  daily_key TEXT NOT NULL DEFAULT '',
  weekly_key TEXT NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, season_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_season_state_rank
  ON telegram_pet_season_state(season_key, season_xp DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_season_slots (
  pet_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  slot_number INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 3),
  acquisition_type TEXT NOT NULL CHECK (acquisition_type IN ('free', 'arcade_xp', 'breeding')),
  source_event_key TEXT,
  journey_clock TEXT NOT NULL DEFAULT 'legacy_quarter' CHECK (journey_clock IN ('legacy_quarter', 'created_at')),
  arcade_xp_spent INTEGER NOT NULL DEFAULT 0 CHECK (arcade_xp_spent >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired', 'archived')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (telegram_id, season_key, slot_number),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_active_slots (
  telegram_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_season_slots(pet_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_slots_owner_active_order
  ON telegram_pet_season_slots(telegram_id, status, created_at, pet_id);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_owner_season
  ON telegram_pet_season_slots(telegram_id, season_key, slot_number);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_season_rank
  ON telegram_pet_season_slots(season_key, status, slot_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_source_event
  ON telegram_pet_season_slots(telegram_id, season_key, source_event_key)
  WHERE source_event_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_pet_owner_tuple
  ON telegram_pet_season_slots(pet_id, telegram_id, season_key, slot_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_pet_season_slots_completion_tuple
  ON telegram_pet_season_slots(pet_id, telegram_id, season_key);

CREATE TABLE IF NOT EXISTS telegram_pet_instances (
  pet_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  slot_number INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 3),
  pet_name TEXT NOT NULL DEFAULT 'Moonpet',
  species TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'egg',
  pet_xp INTEGER NOT NULL DEFAULT 0 CHECK (pet_xp >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  hunger INTEGER NOT NULL DEFAULT 25 CHECK (hunger BETWEEN 0 AND 100),
  happiness INTEGER NOT NULL DEFAULT 70 CHECK (happiness BETWEEN 0 AND 100),
  cleanliness INTEGER NOT NULL DEFAULT 70 CHECK (cleanliness BETWEEN 0 AND 100),
  energy INTEGER NOT NULL DEFAULT 70 CHECK (energy BETWEEN 0 AND 100),
  health INTEGER NOT NULL DEFAULT 75 CHECK (health BETWEEN 0 AND 100),
  streak_days INTEGER NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  moon_gold INTEGER NOT NULL DEFAULT 0 CHECK (moon_gold >= 0),
  moon_crystals INTEGER NOT NULL DEFAULT 0 CHECK (moon_crystals >= 0),
  style_tokens INTEGER NOT NULL DEFAULT 0 CHECK (style_tokens >= 0),
  equipped_food TEXT,
  equipped_toy TEXT,
  equipped_outfit TEXT,
  equipped_armor TEXT,
  equipped_weapon TEXT,
  equipped_charm TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired', 'archived')),
  last_active_day TEXT,
  last_decay_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_profile_updated_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (telegram_id, season_key, slot_number),
  FOREIGN KEY (pet_id, telegram_id, season_key, slot_number)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key, slot_number)
    ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_instances_owner_season_slot
  ON telegram_pet_instances(telegram_id, season_key, slot_number);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_instances_season_status_pet_xp
  ON telegram_pet_instances(season_key, status, pet_xp DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_notification_settings (
  telegram_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  last_notified_at DATETIME,
  last_reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_notification_settings_due
  ON telegram_pet_notification_settings(enabled, last_notified_at);

CREATE TABLE IF NOT EXISTS telegram_pet_mission_completions (
  telegram_id TEXT NOT NULL,
  mission_key TEXT NOT NULL,
  window_key TEXT NOT NULL,
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, mission_key, window_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

-- ── Block Topia covert network ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS blocktopia_covert_agents (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  agent_type TEXT NOT NULL DEFAULT 'infiltrator',
  level INTEGER NOT NULL DEFAULT 1,
  stealth INTEGER NOT NULL DEFAULT 58,
  resilience INTEGER NOT NULL DEFAULT 46,
  loyalty INTEGER NOT NULL DEFAULT 62,
  heat INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'exposed', 'captured')),
  current_node_id TEXT,
  home_district_id TEXT,
  assigned_operation TEXT,
  assigned_until DATETIME,
  stealth_boost_until DATETIME,
  captured_until DATETIME,
  capture_count INTEGER NOT NULL DEFAULT 0,
  recovery_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  operation_type TEXT NOT NULL DEFAULT 'infiltrate',
  target_node_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'success', 'failed', 'critical_failure')),
  success_roll INTEGER,
  detection_roll INTEGER,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  reward_gems INTEGER NOT NULL DEFAULT 0,
  heat_before INTEGER NOT NULL DEFAULT 0,
  heat_after INTEGER NOT NULL DEFAULT 0,
  node_interference_delta INTEGER NOT NULL DEFAULT 0,
  district_support_delta INTEGER NOT NULL DEFAULT 0,
  district_pressure_delta INTEGER NOT NULL DEFAULT 0,
  faction_pressure_delta INTEGER NOT NULL DEFAULT 0,
  sam_pressure_delta INTEGER NOT NULL DEFAULT 0,
  local_risk_delta INTEGER NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolves_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  ON blocktopia_covert_operations(agent_id) WHERE status = 'active';

-- ── Crypto Moonboy Pets Phase 5A runtime progression ─────────────────────────

-- Crypto Moonboy Pets Phase 5A runtime persistence.

CREATE TABLE IF NOT EXISTS telegram_pet_progression_state (
  telegram_id TEXT PRIMARY KEY,
  care_xp INTEGER NOT NULL DEFAULT 0 CHECK (care_xp >= 0),
  training_xp INTEGER NOT NULL DEFAULT 0 CHECK (training_xp >= 0),
  adventure_xp INTEGER NOT NULL DEFAULT 0 CHECK (adventure_xp >= 0),
  arena_xp INTEGER NOT NULL DEFAULT 0 CHECK (arena_xp >= 0),
  job_xp INTEGER NOT NULL DEFAULT 0 CHECK (job_xp >= 0),
  bond_xp INTEGER NOT NULL DEFAULT 0 CHECK (bond_xp >= 0),
  daily_key TEXT NOT NULL DEFAULT '',
  care_daily INTEGER NOT NULL DEFAULT 0 CHECK (care_daily >= 0),
  training_daily INTEGER NOT NULL DEFAULT 0 CHECK (training_daily >= 0),
  adventure_daily INTEGER NOT NULL DEFAULT 0 CHECK (adventure_daily >= 0),
  arena_daily INTEGER NOT NULL DEFAULT 0 CHECK (arena_daily >= 0),
  job_daily INTEGER NOT NULL DEFAULT 0 CHECK (job_daily >= 0),
  bond_daily INTEGER NOT NULL DEFAULT 0 CHECK (bond_daily >= 0),
  traits_json TEXT NOT NULL DEFAULT '{}',
  region_mastery_json TEXT NOT NULL DEFAULT '{}',
  completed_regions_json TEXT NOT NULL DEFAULT '[]',
  event_chains_json TEXT NOT NULL DEFAULT '{}',
  prestige_count INTEGER NOT NULL DEFAULT 0 CHECK (prestige_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_material_balances (
  telegram_id TEXT NOT NULL,
  material_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, material_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_runtime_events (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (telegram_id, event_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_runtime_events_owner_created
  ON telegram_pet_runtime_events (telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pet_material_balances_owner
  ON telegram_pet_material_balances (telegram_id, material_key);

CREATE TABLE IF NOT EXISTS telegram_pet_specialist_progression (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  care_xp INTEGER NOT NULL DEFAULT 0 CHECK (care_xp >= 0),
  training_xp INTEGER NOT NULL DEFAULT 0 CHECK (training_xp >= 0),
  adventure_xp INTEGER NOT NULL DEFAULT 0 CHECK (adventure_xp >= 0),
  arena_xp INTEGER NOT NULL DEFAULT 0 CHECK (arena_xp >= 0),
  job_xp INTEGER NOT NULL DEFAULT 0 CHECK (job_xp >= 0),
  bond_xp INTEGER NOT NULL DEFAULT 0 CHECK (bond_xp >= 0),
  daily_key TEXT NOT NULL DEFAULT '',
  care_daily INTEGER NOT NULL DEFAULT 0 CHECK (care_daily >= 0),
  training_daily INTEGER NOT NULL DEFAULT 0 CHECK (training_daily >= 0),
  adventure_daily INTEGER NOT NULL DEFAULT 0 CHECK (adventure_daily >= 0),
  arena_daily INTEGER NOT NULL DEFAULT 0 CHECK (arena_daily >= 0),
  job_daily INTEGER NOT NULL DEFAULT 0 CHECK (job_daily >= 0),
  bond_daily INTEGER NOT NULL DEFAULT 0 CHECK (bond_daily >= 0),
  traits_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, telegram_id, season_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_specialist_events (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  event_key TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, telegram_id, season_key, event_key),
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_specialist_progression(pet_id, telegram_id, season_key)
    ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_specialist_progression_owner
  ON telegram_pet_specialist_progression(telegram_id, season_key, pet_id);

CREATE INDEX IF NOT EXISTS idx_pet_specialist_events_owner_created
  ON telegram_pet_specialist_events(telegram_id, season_key, pet_id, created_at DESC);

-- Crypto Moonboy Pets identity expansion.
CREATE TABLE IF NOT EXISTS telegram_pet_evolutions (
  telegram_id TEXT NOT NULL,
  evolution_id TEXT NOT NULL,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 0 AND 5),
  unlock_event_key TEXT NOT NULL,
  cosmetic_unlocks TEXT NOT NULL DEFAULT '[]',
  achievement_unlocks TEXT NOT NULL DEFAULT '[]',
  materials_consumed INTEGER NOT NULL DEFAULT 0 CHECK (materials_consumed IN (0, 1)),
  unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, evolution_id),
  UNIQUE (telegram_id, stage),
  UNIQUE (telegram_id, unlock_event_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_evolutions_by_pet (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  evolution_id TEXT NOT NULL,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 0 AND 5),
  unlock_event_key TEXT NOT NULL,
  cosmetic_unlocks TEXT NOT NULL DEFAULT '[]',
  achievement_unlocks TEXT NOT NULL DEFAULT '[]',
  materials_consumed INTEGER NOT NULL DEFAULT 0 CHECK (materials_consumed IN (0, 1)),
  unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, evolution_id),
  UNIQUE (pet_id, stage),
  UNIQUE (pet_id, unlock_event_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_personality_traits (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  trait_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  unlocked_at DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, trait_id),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_memories (
  pet_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  first_adoption_at DATETIME,
  first_run_at DATETIME,
  first_extraction_at DATETIME,
  first_boss_victory_at DATETIME,
  first_boss_id TEXT,
  biggest_reward_amount INTEGER NOT NULL DEFAULT 0 CHECK (biggest_reward_amount >= 0),
  biggest_reward_currency TEXT,
  favourite_activity TEXT,
  total_runs INTEGER NOT NULL DEFAULT 0 CHECK (total_runs >= 0),
  total_bosses_defeated INTEGER NOT NULL DEFAULT 0 CHECK (total_bosses_defeated >= 0),
  milestones TEXT NOT NULL DEFAULT '[]',
  combat_actions INTEGER NOT NULL DEFAULT 0 CHECK (combat_actions >= 0),
  exploration_actions INTEGER NOT NULL DEFAULT 0 CHECK (exploration_actions >= 0),
  care_actions INTEGER NOT NULL DEFAULT 0 CHECK (care_actions >= 0),
  event_actions INTEGER NOT NULL DEFAULT 0 CHECK (event_actions >= 0),
  adventure_actions INTEGER NOT NULL DEFAULT 0 CHECK (adventure_actions >= 0),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_boss_victories (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  boss_id TEXT NOT NULL,
  victories INTEGER NOT NULL DEFAULT 0 CHECK (victories >= 0),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, boss_id),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_identity_events (
  event_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  event_key TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('personality', 'memory')),
  payload TEXT NOT NULL DEFAULT '{}',
  day_key TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
  progress_delta INTEGER NOT NULL DEFAULT 0 CHECK (progress_delta >= 0),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME,
  UNIQUE (pet_id, event_key, event_kind),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_identity_analytics (
  analytics_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('evolution_unlock', 'personality_unlock', 'memory_milestone')),
  evolution_id TEXT,
  trait_id TEXT,
  milestone_id TEXT,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_identity_events_owner ON telegram_pet_identity_events(telegram_id, pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_identity_events_pet_kind_day ON telegram_pet_identity_events(pet_id, event_kind, day_key);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_identity_analytics_owner
  ON telegram_pet_identity_analytics(pet_id, telegram_id, season_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_identity_analytics_type ON telegram_pet_identity_analytics(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_identity_analytics_evolution ON telegram_pet_identity_analytics(evolution_id, duration_seconds);

CREATE TABLE IF NOT EXISTS telegram_pet_achievements (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  target INTEGER NOT NULL CHECK (target > 0),
  unlocked_at DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, achievement_id),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_achievements_unlocked
  ON telegram_pet_achievements(achievement_id, unlocked_at);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_achievements_owner
  ON telegram_pet_achievements(telegram_id, pet_id, unlocked_at);

CREATE VIEW IF NOT EXISTS moonpet_invalid_identity_authority_rows AS
  SELECT 'telegram_pet_memories' AS table_name, r.pet_id, r.telegram_id, r.season_key, r.pet_id AS row_key,
         CASE
           WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
           WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
           WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
           WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
           WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
           ELSE 'authority_tuple_mismatch'
         END AS reason
  FROM telegram_pet_memories r
  LEFT JOIN telegram_pet_season_slots s
    ON s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  LEFT JOIN telegram_pet_instances i
    ON i.pet_id = r.pet_id AND i.telegram_id = r.telegram_id AND i.season_key = r.season_key
  WHERE r.pet_id IS NULL OR r.pet_id = ''
     OR r.telegram_id IS NULL OR r.telegram_id = ''
     OR r.season_key IS NULL OR r.season_key = ''
     OR s.pet_id IS NULL
     OR i.pet_id IS NULL
     OR s.slot_number <> i.slot_number
  UNION ALL
  SELECT 'telegram_pet_personality_traits', r.pet_id, r.telegram_id, r.season_key, r.pet_id || ':' || r.trait_id,
         CASE
           WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
           WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
           WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
           WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
           WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
           ELSE 'authority_tuple_mismatch'
         END
  FROM telegram_pet_personality_traits r
  LEFT JOIN telegram_pet_season_slots s
    ON s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  LEFT JOIN telegram_pet_instances i
    ON i.pet_id = r.pet_id AND i.telegram_id = r.telegram_id AND i.season_key = r.season_key
  WHERE r.pet_id IS NULL OR r.pet_id = ''
     OR r.telegram_id IS NULL OR r.telegram_id = ''
     OR r.season_key IS NULL OR r.season_key = ''
     OR s.pet_id IS NULL
     OR i.pet_id IS NULL
     OR s.slot_number <> i.slot_number
  UNION ALL
  SELECT 'telegram_pet_boss_victories', r.pet_id, r.telegram_id, r.season_key, r.pet_id || ':' || r.boss_id,
         CASE
           WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
           WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
           WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
           WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
           WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
           ELSE 'authority_tuple_mismatch'
         END
  FROM telegram_pet_boss_victories r
  LEFT JOIN telegram_pet_season_slots s
    ON s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  LEFT JOIN telegram_pet_instances i
    ON i.pet_id = r.pet_id AND i.telegram_id = r.telegram_id AND i.season_key = r.season_key
  WHERE r.pet_id IS NULL OR r.pet_id = ''
     OR r.telegram_id IS NULL OR r.telegram_id = ''
     OR r.season_key IS NULL OR r.season_key = ''
     OR s.pet_id IS NULL
     OR i.pet_id IS NULL
     OR s.slot_number <> i.slot_number
  UNION ALL
  SELECT 'telegram_pet_identity_events', r.pet_id, r.telegram_id, r.season_key, r.event_id,
         CASE
           WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
           WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
           WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
           WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
           WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
           ELSE 'authority_tuple_mismatch'
         END
  FROM telegram_pet_identity_events r
  LEFT JOIN telegram_pet_season_slots s
    ON s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  LEFT JOIN telegram_pet_instances i
    ON i.pet_id = r.pet_id AND i.telegram_id = r.telegram_id AND i.season_key = r.season_key
  WHERE r.pet_id IS NULL OR r.pet_id = ''
     OR r.telegram_id IS NULL OR r.telegram_id = ''
     OR r.season_key IS NULL OR r.season_key = ''
     OR s.pet_id IS NULL
     OR i.pet_id IS NULL
     OR s.slot_number <> i.slot_number
  UNION ALL
  SELECT 'telegram_pet_identity_analytics', r.pet_id, r.telegram_id, r.season_key, r.analytics_id,
         CASE
           WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
           WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
           WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
           WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
           WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
           ELSE 'authority_tuple_mismatch'
         END
  FROM telegram_pet_identity_analytics r
  LEFT JOIN telegram_pet_season_slots s
    ON s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  LEFT JOIN telegram_pet_instances i
    ON i.pet_id = r.pet_id AND i.telegram_id = r.telegram_id AND i.season_key = r.season_key
  WHERE r.pet_id IS NULL OR r.pet_id = ''
     OR r.telegram_id IS NULL OR r.telegram_id = ''
     OR r.season_key IS NULL OR r.season_key = ''
     OR s.pet_id IS NULL
     OR i.pet_id IS NULL
     OR s.slot_number <> i.slot_number
  UNION ALL
  SELECT 'telegram_pet_achievements', r.pet_id, r.telegram_id, r.season_key, r.pet_id || ':' || r.achievement_id,
         CASE
           WHEN r.pet_id IS NULL OR r.pet_id = '' THEN 'pet_id_missing'
           WHEN r.telegram_id IS NULL OR r.telegram_id = '' THEN 'telegram_id_missing'
           WHEN r.season_key IS NULL OR r.season_key = '' THEN 'season_key_missing'
           WHEN s.pet_id IS NULL THEN 'season_slot_tuple_missing'
           WHEN i.pet_id IS NULL THEN 'pet_instance_tuple_missing'
           ELSE 'authority_tuple_mismatch'
         END
  FROM telegram_pet_achievements r
  LEFT JOIN telegram_pet_season_slots s
    ON s.pet_id = r.pet_id AND s.telegram_id = r.telegram_id AND s.season_key = r.season_key
  LEFT JOIN telegram_pet_instances i
    ON i.pet_id = r.pet_id AND i.telegram_id = r.telegram_id AND i.season_key = r.season_key
  WHERE r.pet_id IS NULL OR r.pet_id = ''
     OR r.telegram_id IS NULL OR r.telegram_id = ''
     OR r.season_key IS NULL OR r.season_key = ''
     OR s.pet_id IS NULL
     OR i.pet_id IS NULL
     OR s.slot_number <> i.slot_number;

-- Recent player-facing dialogue. Runtime writes retain only the latest 40 rows
-- per Moonpet; the table exists solely for reaction de-duplication.
CREATE TABLE IF NOT EXISTS telegram_pet_dialogue_history (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  context TEXT NOT NULL CHECK (length(context) BETWEEN 1 AND 40),
  reaction_key TEXT NOT NULL CHECK (length(reaction_key) BETWEEN 1 AND 100),
  reaction_text TEXT NOT NULL CHECK (length(reaction_text) BETWEEN 1 AND 500),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_dialogue_history_owner
  ON telegram_pet_dialogue_history (telegram_id, created_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_guidance_notices (
  telegram_id TEXT NOT NULL,
  notice_key TEXT NOT NULL CHECK (length(notice_key) BETWEEN 1 AND 160),
  notice_type TEXT NOT NULL CHECK (notice_type IN ('evolution_ready', 'season_reward', 'personality', 'achievement', 'feature', 'job', 'shop')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  detail TEXT NOT NULL DEFAULT '' CHECK (length(detail) <= 500),
  callback_data TEXT NOT NULL DEFAULT 'pet:coach' CHECK (length(callback_data) BETWEEN 1 AND 100),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  shown_at DATETIME,
  PRIMARY KEY (telegram_id, notice_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_guidance_notices_unshown
  ON telegram_pet_guidance_notices (telegram_id, shown_at, created_at);

-- Crypto Moonboy Pets daily retention foundation.
CREATE TABLE IF NOT EXISTS telegram_pet_daily_runs (
  telegram_id TEXT NOT NULL,
  pet_id TEXT,
  utc_day TEXT NOT NULL CHECK (utc_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  seed TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'abandoned', 'extracted')),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  depth INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0),
  boss_defeated INTEGER NOT NULL DEFAULT 0 CHECK (boss_defeated IN (0, 1)),
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, utc_day),
  UNIQUE (run_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_daily_challenge_progress (
  telegram_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  completed_at DATETIME,
  PRIMARY KEY (telegram_id, utc_day, challenge_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_daily_challenge_events (
  event_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  progress_value INTEGER NOT NULL CHECK (progress_value >= 0),
  evidence TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME,
  UNIQUE (telegram_id, utc_day, challenge_id, event_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_daily_journey_objectives (
  event_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  utc_day TEXT NOT NULL CHECK (utc_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  challenge_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  progress_value INTEGER NOT NULL CHECK (progress_value >= 0),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  evidence TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, season_key, utc_day, challenge_id, event_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_daily_journey_receipts (
  receipt_id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  utc_day TEXT NOT NULL CHECK (utc_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  completed_objectives INTEGER NOT NULL CHECK (completed_objectives >= 0),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  reason TEXT NOT NULL,
  growth_mark_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_daily_leaderboard_records (
  telegram_id TEXT PRIMARY KEY,
  highest_score INTEGER NOT NULL DEFAULT 0 CHECK (highest_score >= 0),
  fastest_completion_seconds INTEGER CHECK (fastest_completion_seconds IS NULL OR fastest_completion_seconds >= 0),
  deepest_run INTEGER NOT NULL DEFAULT 0 CHECK (deepest_run >= 0),
  boss_completions INTEGER NOT NULL DEFAULT 0 CHECK (boss_completions >= 0),
  extraction_successes INTEGER NOT NULL DEFAULT 0 CHECK (extraction_successes >= 0),
  streak_length INTEGER NOT NULL DEFAULT 0 CHECK (streak_length >= 0),
  longest_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  runs_recorded INTEGER NOT NULL DEFAULT 0 CHECK (runs_recorded >= 0),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_seasonal_challenge_state (
  telegram_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  completed_daily_challenges INTEGER NOT NULL DEFAULT 0 CHECK (completed_daily_challenges >= 0),
  daily_streak INTEGER NOT NULL DEFAULT 0 CHECK (daily_streak >= 0),
  boss_records INTEGER NOT NULL DEFAULT 0 CHECK (boss_records >= 0),
  personal_achievements INTEGER NOT NULL DEFAULT 0 CHECK (personal_achievements >= 0),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, season_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_seasonal_achievements (
  telegram_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  achieved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, season_id, achievement_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_daily_analytics (
  analytics_id TEXT PRIMARY KEY,
  pet_id TEXT,
  telegram_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  run_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('run_created', 'run_terminal', 'challenge_completed')),
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES telegram_pet_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_runs_day_score ON telegram_pet_daily_runs(utc_day, score DESC, depth DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_runs_status ON telegram_pet_daily_runs(utc_day, status, completed_at);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_challenges_day ON telegram_pet_daily_challenge_progress(utc_day, challenge_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_challenge_events_owner ON telegram_pet_daily_challenge_events(telegram_id, utc_day, created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_journey_objectives_pet_day ON telegram_pet_daily_journey_objectives(pet_id, season_key, utc_day, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_journey_receipts_pet_day ON telegram_pet_daily_journey_receipts(pet_id, season_key, utc_day, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_journey_receipts_event_status ON telegram_pet_daily_journey_receipts(event_key, status);

CREATE TABLE IF NOT EXISTS telegram_pet_weekly_journey_objectives (
  event_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  qualification_week INTEGER NOT NULL CHECK (qualification_week >= 1),
  objective_id TEXT NOT NULL,
  source_event_key TEXT NOT NULL,
  source_event_type TEXT NOT NULL,
  progress_value INTEGER NOT NULL CHECK (progress_value >= 0),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  evidence TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, season_key, qualification_week, objective_id, source_event_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_weekly_journey_receipts (
  receipt_id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  qualification_week INTEGER NOT NULL CHECK (qualification_week >= 1),
  completed_objectives INTEGER NOT NULL CHECK (completed_objectives >= 0),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  reason TEXT NOT NULL,
  crest_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_key, status),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_weekly_journey_objectives_pet_week ON telegram_pet_weekly_journey_objectives(pet_id, season_key, qualification_week, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_weekly_journey_objectives_source ON telegram_pet_weekly_journey_objectives(source_event_key, pet_id, season_key, qualification_week);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_weekly_journey_receipts_pet_week ON telegram_pet_weekly_journey_receipts(pet_id, season_key, qualification_week, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_weekly_journey_receipts_event_status ON telegram_pet_weekly_journey_receipts(event_key, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_weekly_journey_receipts_crest ON telegram_pet_weekly_journey_receipts(crest_id, pet_id, season_key, qualification_week);

CREATE TABLE IF NOT EXISTS telegram_pet_breeding_receipts (
  receipt_id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL,
  request_key TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  parent_pet_a_id TEXT NOT NULL,
  parent_pet_b_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  seed TEXT NOT NULL,
  offspring_pet_id TEXT NOT NULL,
  offspring_slot_number INTEGER NOT NULL CHECK (offspring_slot_number BETWEEN 1 AND 3),
  offspring_traits_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(offspring_traits_json)),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  reason TEXT NOT NULL,
  cooldown_available_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_key),
  UNIQUE (telegram_id, season_key, parent_pet_a_id, parent_pet_b_id, request_key),
  UNIQUE (offspring_pet_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_pet_a_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE,
  FOREIGN KEY (parent_pet_b_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_breeding_cooldowns (
  parent_pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  available_at DATETIME NOT NULL,
  last_receipt_id TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parent_pet_id, season_key),
  FOREIGN KEY (parent_pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (last_receipt_id) REFERENCES telegram_pet_breeding_receipts(receipt_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pet_breeding_receipts_owner_season
  ON telegram_pet_breeding_receipts(telegram_id, season_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_breeding_receipts_parent_pair
  ON telegram_pet_breeding_receipts(parent_pet_a_id, parent_pet_b_id, season_key, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_breeding_receipts_offspring
  ON telegram_pet_breeding_receipts(offspring_pet_id, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_breeding_cooldowns_owner
  ON telegram_pet_breeding_cooldowns(telegram_id, season_key, available_at);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_analytics_day ON telegram_pet_daily_analytics(utc_day, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_runs_pet_day ON telegram_pet_daily_runs(pet_id, utc_day);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_daily_analytics_pet ON telegram_pet_daily_analytics(pet_id, utc_day, created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_seasonal_state_season ON telegram_pet_seasonal_challenge_state(season_id, daily_streak DESC);

-- Player-facing live systems (districts, story chains, raids, upgrades and style sinks).
CREATE TABLE IF NOT EXISTS telegram_pet_system_events (
  id TEXT PRIMARY KEY, pet_id TEXT NOT NULL DEFAULT '', telegram_id TEXT NOT NULL, season_key TEXT NOT NULL DEFAULT '',
  system_key TEXT NOT NULL, action_key TEXT NOT NULL,
  period_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settling','completed','rejected')),
  payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (pet_id, telegram_id, season_key, system_key, action_key, period_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_system_events_owner ON telegram_pet_system_events (telegram_id, system_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_system_events_pet_owner ON telegram_pet_system_events (pet_id, telegram_id, season_key, system_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_system_events_radio_delivery
  ON telegram_pet_system_events (created_at ASC)
  WHERE system_key='radio_request' AND action_key='submission' AND status='completed'
    AND period_key>='2026-10-12'
    AND json_extract(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,'$.telegram_group_delivery')='pending';
CREATE TABLE IF NOT EXISTS telegram_pet_live_progression_state (
  pet_id TEXT NOT NULL, telegram_id TEXT NOT NULL, season_key TEXT NOT NULL,
  region_mastery_json TEXT NOT NULL DEFAULT '{}', completed_regions_json TEXT NOT NULL DEFAULT '[]',
  prestige_count INTEGER NOT NULL DEFAULT 0 CHECK (prestige_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, telegram_id, season_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key)
    REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS telegram_pet_event_chain_progress (
  pet_id TEXT NOT NULL DEFAULT '', telegram_id TEXT NOT NULL, season_key TEXT NOT NULL DEFAULT '',
  chain_key TEXT NOT NULL, step_index INTEGER NOT NULL DEFAULT 0 CHECK (step_index >= 0),
  completed_cycles INTEGER NOT NULL DEFAULT 0 CHECK (completed_cycles >= 0), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, telegram_id, season_key, chain_key), FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS telegram_pet_seasonal_boss_progress (
  pet_id TEXT NOT NULL DEFAULT '', telegram_id TEXT NOT NULL, pet_season_key TEXT NOT NULL DEFAULT '',
  season_key TEXT NOT NULL, boss_key TEXT NOT NULL, damage INTEGER NOT NULL DEFAULT 0 CHECK (damage >= 0),
  defeated_at TEXT, reward_claimed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id, telegram_id, pet_season_key, season_key, boss_key), FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS telegram_pet_cosmetic_unlocks (
  telegram_id TEXT NOT NULL, cosmetic_key TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, cosmetic_key), FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

-- Moonpet species lifecycle (migration 053).
CREATE TABLE IF NOT EXISTS telegram_pet_lifecycle (
  telegram_id TEXT PRIMARY KEY,
  lifecycle_version INTEGER NOT NULL DEFAULT 1,
  identity_seed TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'egg' CHECK (phase IN ('egg', 'young', 'adult', 'rare')),
  species_id TEXT,
  palette_id TEXT,
  marking_id TEXT,
  eye_style TEXT,
  temperament TEXT,
  innate_traits_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(innate_traits_json)),
  incubation_progress INTEGER NOT NULL DEFAULT 0 CHECK (incubation_progress BETWEEN 0 AND 12),
  incubation_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(incubation_json)),
  rare_route_index INTEGER CHECK (rare_route_index BETWEEN 0 AND 3),
  rare_morph_id TEXT,
  hatched_at DATETIME,
  adult_at DATETIME,
  rare_morphed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pet_lifecycle_events (
  event_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('egg_created', 'incubate_warm', 'incubate_talk', 'incubate_music', 'incubate_rest', 'hatch', 'rare_morph')),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
  progress_delta INTEGER NOT NULL DEFAULT 0 CHECK (progress_delta BETWEEN 0 AND 2),
  day_key TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
  applied_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (telegram_id, event_key),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_lifecycle(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_lifecycle_phase ON telegram_pet_lifecycle(phase, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_lifecycle_events_daily ON telegram_pet_lifecycle_events(telegram_id, day_key, action);


CREATE TABLE IF NOT EXISTS telegram_pet_lifecycle_by_pet (
  pet_id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, lifecycle_version INTEGER NOT NULL DEFAULT 1,
  identity_seed TEXT NOT NULL, phase TEXT NOT NULL DEFAULT 'egg' CHECK (phase IN ('egg', 'young', 'adult', 'rare')),
  species_id TEXT, palette_id TEXT, marking_id TEXT, eye_style TEXT, temperament TEXT,
  innate_traits_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(innate_traits_json)),
  incubation_progress INTEGER NOT NULL DEFAULT 0 CHECK (incubation_progress BETWEEN 0 AND 12),
  incubation_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(incubation_json)),
  rare_route_index INTEGER CHECK (rare_route_index BETWEEN 0 AND 3), rare_morph_id TEXT,
  hatched_at DATETIME, adult_at DATETIME, rare_morphed_at DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (telegram_id, pet_id),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS telegram_pet_lifecycle_events_by_pet (
  event_id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, telegram_id TEXT NOT NULL, event_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('egg_created', 'incubate_warm', 'incubate_talk', 'incubate_music', 'incubate_rest', 'hatch', 'rare_morph')),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)), progress_delta INTEGER NOT NULL DEFAULT 0 CHECK (progress_delta BETWEEN 0 AND 2),
  day_key TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')), applied_at DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, event_key), FOREIGN KEY (pet_id) REFERENCES telegram_pet_lifecycle_by_pet(pet_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_lifecycle_owner ON telegram_pet_lifecycle_by_pet(telegram_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_lifecycle_phase ON telegram_pet_lifecycle_by_pet(phase, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_lifecycle_events_daily ON telegram_pet_lifecycle_events_by_pet(pet_id, day_key, action);
CREATE INDEX IF NOT EXISTS idx_pet_evolutions_by_pet_owner ON telegram_pet_evolutions_by_pet(telegram_id, stage DESC, unlocked_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_evolutions_by_pet_stage ON telegram_pet_evolutions_by_pet(stage, unlocked_at DESC);

CREATE TABLE IF NOT EXISTS telegram_pet_client_performance (
  sample_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  quality_tier TEXT NOT NULL CHECK (quality_tier IN ('low', 'medium', 'high')),
  average_fps REAL NOT NULL CHECK (average_fps >= 0 AND average_fps <= 240),
  slow_frame_pct REAL NOT NULL CHECK (slow_frame_pct >= 0 AND slow_frame_pct <= 100),
  render_duration_ms REAL CHECK (render_duration_ms > 0 AND render_duration_ms <= 10000),
  device_memory REAL,
  hardware_concurrency INTEGER,
  viewport_width INTEGER NOT NULL CHECK (viewport_width BETWEEN 1 AND 10000),
  viewport_height INTEGER NOT NULL CHECK (viewport_height BETWEEN 1 AND 10000),
  reduced_motion INTEGER NOT NULL DEFAULT 0 CHECK (reduced_motion IN (0, 1)),
  sampled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_client_performance_tuning ON telegram_pet_client_performance(sampled_at DESC, quality_tier, average_fps);

-- 075_dead_run_gps_survival.sql
-- Dead Run: Telegram GPS survival authority.
-- Precise coordinates exist only while a run is active and are nulled when a run settles.

CREATE TABLE IF NOT EXISTS dead_run_players (
  telegram_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Runner',
  xp_total INTEGER NOT NULL DEFAULT 0 CHECK (xp_total >= 0),
  runs_total INTEGER NOT NULL DEFAULT 0 CHECK (runs_total >= 0),
  ranked_runs_total INTEGER NOT NULL DEFAULT 0 CHECK (ranked_runs_total >= 0),
  best_survival_seconds INTEGER NOT NULL DEFAULT 0 CHECK (best_survival_seconds >= 0),
  best_distance_m INTEGER NOT NULL DEFAULT 0 CHECK (best_distance_m >= 0),
  best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  kills_total INTEGER NOT NULL DEFAULT 0 CHECK (kills_total >= 0),
  crates_total INTEGER NOT NULL DEFAULT 0 CHECK (crates_total >= 0),
  horde_events_total INTEGER NOT NULL DEFAULT 0 CHECK (horde_events_total >= 0),
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  last_run_day TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dead_run_horde_events (
  event_id TEXT PRIMARY KEY,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  target_kills INTEGER NOT NULL CHECK (target_kills > 0),
  kills_total INTEGER NOT NULL DEFAULT 0 CHECK (kills_total >= 0),
  participants INTEGER NOT NULL DEFAULT 0 CHECK (participants >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cleared', 'expired')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dead_run_sessions (
  session_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settling', 'finished', 'abandoned', 'rejected')),
  ranked INTEGER NOT NULL DEFAULT 1 CHECK (ranked IN (0,1)),
  seed INTEGER NOT NULL,
  event_id TEXT,
  difficulty_tier INTEGER NOT NULL DEFAULT 1 CHECK (difficulty_tier BETWEEN 1 AND 5),
  difficulty_xp_basis INTEGER NOT NULL DEFAULT 0 CHECK (difficulty_xp_basis >= 0),
  difficulty_best_basis INTEGER NOT NULL DEFAULT 0 CHECK (difficulty_best_basis >= 0),
  difficulty_runs_basis INTEGER NOT NULL DEFAULT 0 CHECK (difficulty_runs_basis >= 0),
  heading_deg REAL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME,
  start_lat REAL,
  start_lng REAL,
  last_lat REAL,
  last_lng REAL,
  last_accuracy_m REAL,
  last_sample_at_ms INTEGER NOT NULL DEFAULT 0,
  last_client_seq INTEGER NOT NULL DEFAULT 0,
  last_speed_mps REAL NOT NULL DEFAULT 0,
  max_speed_mps REAL NOT NULL DEFAULT 0,
  verified_distance_m REAL NOT NULL DEFAULT 0 CHECK (verified_distance_m >= 0),
  suspicious_points REAL NOT NULL DEFAULT 0 CHECK (suspicious_points >= 0),
  ammo INTEGER NOT NULL DEFAULT 3 CHECK (ammo >= 0 AND ammo <= 6),
  slow_inventory INTEGER NOT NULL DEFAULT 0 CHECK (slow_inventory >= 0),
  charge_m REAL NOT NULL DEFAULT 0 CHECK (charge_m >= 0),
  slow_until_ms INTEGER NOT NULL DEFAULT 0,
  current_wave INTEGER NOT NULL DEFAULT 0 CHECK (current_wave >= 0),
  kills INTEGER NOT NULL DEFAULT 0 CHECK (kills >= 0),
  crates INTEGER NOT NULL DEFAULT 0 CHECK (crates >= 0),
  shove_count INTEGER NOT NULL DEFAULT 0 CHECK (shove_count >= 0),
  survival_seconds INTEGER NOT NULL DEFAULT 0 CHECK (survival_seconds >= 0),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  finish_reason TEXT,
  player_stats_applied INTEGER NOT NULL DEFAULT 0 CHECK (player_stats_applied IN (0,1)),
  arcade_xp_applied INTEGER NOT NULL DEFAULT 0 CHECK (arcade_xp_applied IN (0,1)),
  horde_applied INTEGER NOT NULL DEFAULT 0 CHECK (horde_applied IN (0,1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES dead_run_horde_events(event_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dead_run_one_active_session
  ON dead_run_sessions(telegram_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_dead_run_sessions_daily_ranked
  ON dead_run_sessions(day_key, ranked, status, score DESC);
CREATE INDEX IF NOT EXISTS idx_dead_run_sessions_survival
  ON dead_run_sessions(status, ranked, survival_seconds DESC);
CREATE INDEX IF NOT EXISTS idx_dead_run_sessions_distance
  ON dead_run_sessions(status, ranked, verified_distance_m DESC);
CREATE INDEX IF NOT EXISTS idx_dead_run_sessions_user_time
  ON dead_run_sessions(telegram_id, started_at DESC);

CREATE TABLE IF NOT EXISTS dead_run_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('shoot', 'pickup', 'slow', 'shove')),
  target_id TEXT,
  accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted IN (0,1)),
  reason TEXT,
  response_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, action_id),
  FOREIGN KEY (session_id) REFERENCES dead_run_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dead_run_single_target_accept
  ON dead_run_actions(session_id, action_type, target_id)
  WHERE accepted = 1 AND target_id IS NOT NULL AND action_type IN ('shoot', 'pickup');
CREATE INDEX IF NOT EXISTS idx_dead_run_actions_session_time
  ON dead_run_actions(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dead_run_horde_contributions (
  event_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0 CHECK (kills >= 0),
  distance_m REAL NOT NULL DEFAULT 0 CHECK (distance_m >= 0),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, session_id),
  FOREIGN KEY (event_id) REFERENCES dead_run_horde_events(event_id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES dead_run_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dead_run_horde_contrib_event_kills
  ON dead_run_horde_contributions(event_id, kills DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_dead_run_horde_contrib_user
  ON dead_run_horde_contributions(telegram_id, created_at DESC);

-- Continuing play has its own pet-owned record. Economic rewards remain capped.
CREATE TABLE IF NOT EXISTS telegram_pet_contracts (
  contract_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'failed', 'abandoned')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  rank_points INTEGER NOT NULL DEFAULT 0 CHECK (rank_points >= 0),
  reward_xp INTEGER NOT NULL DEFAULT 0 CHECK (reward_xp IN (0, 20)),
  reward_day TEXT,
  reward_settled INTEGER NOT NULL DEFAULT 0 CHECK (reward_settled IN (0, 1)),
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded BETWEEN 0 AND 20),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, sequence),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key) REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_contract_active ON telegram_pet_contracts(pet_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_pet_contract_owner_pet ON telegram_pet_contracts(telegram_id, pet_id, season_key, sequence);
CREATE INDEX IF NOT EXISTS idx_pet_contract_bonus_day ON telegram_pet_contracts(telegram_id, reward_day, reward_xp);

-- Earned daily checklist bits survive spending, refresh failures and midnight.
-- Reward assignment is frozen on the first claim; currency remains account-owned.
CREATE TABLE IF NOT EXISTS telegram_pet_daily_completion (
  telegram_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  progress_bits INTEGER NOT NULL DEFAULT 0 CHECK (progress_bits BETWEEN 0 AND 255),
  pet_id TEXT,
  season_key TEXT,
  claimed_at TEXT,
  PRIMARY KEY (telegram_id, utc_day),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id, telegram_id, season_key) REFERENCES telegram_pet_season_slots(pet_id, telegram_id, season_key) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS pet_daily_completion_event_insert
AFTER INSERT ON telegram_pet_events
WHEN NEW.status='accepted' AND NEW.event_type IN ('feed','play','clean','train','trade','buy','adventure','run_extract','run_complete','daily_moon_run','district_mission','event_chain','seasonal_boss')
  AND NEW.event_key NOT LIKE 'moonpet_wallet_reconcile:%'
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits)
  VALUES (NEW.telegram_id,NEW.day_key,CASE NEW.event_type WHEN 'feed' THEN 1 WHEN 'play' THEN 2 WHEN 'clean' THEN 4 WHEN 'train' THEN 8 WHEN 'trade' THEN 16 WHEN 'buy' THEN 32 ELSE 64 END)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|excluded.progress_bits
  WHERE (progress_bits|excluded.progress_bits)<>progress_bits;
END;
CREATE TRIGGER IF NOT EXISTS pet_daily_completion_event_accept
AFTER UPDATE OF status ON telegram_pet_events
WHEN NEW.status='accepted' AND OLD.status<>'accepted'
  AND NEW.event_type IN ('feed','play','clean','train','trade','buy','adventure','run_extract','run_complete','daily_moon_run','district_mission','event_chain','seasonal_boss')
  AND NEW.event_key NOT LIKE 'moonpet_wallet_reconcile:%'
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits)
  VALUES (NEW.telegram_id,NEW.day_key,CASE NEW.event_type WHEN 'feed' THEN 1 WHEN 'play' THEN 2 WHEN 'clean' THEN 4 WHEN 'train' THEN 8 WHEN 'trade' THEN 16 WHEN 'buy' THEN 32 ELSE 64 END)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|excluded.progress_bits
  WHERE (progress_bits|excluded.progress_bits)<>progress_bits;
END;
CREATE TRIGGER IF NOT EXISTS pet_daily_completion_bank_insert
AFTER INSERT ON telegram_pet_profiles WHEN NEW.moon_gold>=50
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits) VALUES (NEW.telegram_id,date('now'),128)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|128 WHERE (progress_bits&128)=0;
END;
CREATE TRIGGER IF NOT EXISTS pet_daily_completion_bank_update
AFTER UPDATE OF moon_gold ON telegram_pet_profiles WHEN NEW.moon_gold>=50 OR OLD.moon_gold>=50
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits) VALUES (NEW.telegram_id,date('now'),128)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|128 WHERE (progress_bits&128)=0;
END;
CREATE TRIGGER IF NOT EXISTS pet_daily_completion_upgrade_insert
AFTER INSERT ON telegram_pet_system_events WHEN NEW.system_key='equipment_upgrade' AND NEW.status='completed'
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits) VALUES (NEW.telegram_id,date(NEW.updated_at),32)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|32 WHERE (progress_bits&32)=0;
END;
CREATE TRIGGER IF NOT EXISTS pet_daily_completion_upgrade_finish
AFTER UPDATE OF status ON telegram_pet_system_events WHEN NEW.system_key='equipment_upgrade' AND NEW.status='completed' AND OLD.status<>'completed'
BEGIN
  INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits) VALUES (NEW.telegram_id,date(NEW.updated_at),32)
  ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|32 WHERE (progress_bits&32)=0;
END;

-- One saved finale per pet/competition quarter; season_key remains ownership provenance. Revision stays monotonic across retries.
CREATE TABLE IF NOT EXISTS telegram_pet_season_finales (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  competition_season_key TEXT NOT NULL,
  reward_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active','failed','won')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt>0),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision>=0),
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  defeated_at TEXT,
  claimed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id,competition_season_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id,telegram_id,season_key) REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_finales_owner ON telegram_pet_season_finales(telegram_id,competition_season_key);
-- Per-pet equipped cosmetic styles.
CREATE TABLE IF NOT EXISTS telegram_pet_style_loadouts (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  cosmetic_key TEXT NOT NULL CHECK(cosmetic_key IN ('rename_badge','profile_frame','victory_pose','run_trail','neon_aura','street_sparks','gold_frame','cyber_scanlines')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  PRIMARY KEY(pet_id,cosmetic_key),
  FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id)
);

-- Audit-preserving quarantine for unverifiable pre-launch Pet XP receipts.
CREATE TABLE IF NOT EXISTS moonpet_beta_xp_quarantine (
  event_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  pet_id TEXT,
  season_key TEXT NOT NULL,
  pet_xp_awarded INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('missing_pet_authority','receipt_total_exceeds_retained_pet_xp')),
  quarantined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_moonpet_beta_xp_quarantine_owner
  ON moonpet_beta_xp_quarantine(telegram_id,season_key,reason);

-- MoonPet House E1 / D1 migration 092: cosmetic per-pet starter room.
CREATE TABLE IF NOT EXISTS telegram_pet_house_layouts (
  pet_id TEXT NOT NULL, telegram_id TEXT NOT NULL, season_key TEXT NOT NULL,
  slot_key TEXT NOT NULL CHECK(slot_key IN ('wall','floor','furniture')),
  item_key TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id,slot_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id,telegram_id,season_key) REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key) ON DELETE CASCADE,
  CHECK ((slot_key='wall' AND item_key IN ('warehouse_brick','night_wall','studio_white')) OR
    (slot_key='floor' AND item_key IN ('concrete','checkerboard','steel')) OR
    (slot_key='furniture' AND item_key IN ('sleep_mat','record_deck','plant_pot')))
);
CREATE INDEX IF NOT EXISTS idx_pet_house_layout_owner ON telegram_pet_house_layouts(telegram_id,pet_id,season_key);

-- Home E2: permanent account-owned furniture, saved separately per pet.
-- No modifications to E1 free layout, lifetime pets, balances or reward receipts.
CREATE TABLE IF NOT EXISTS telegram_pet_furniture_unlocks (
  telegram_id TEXT NOT NULL,
  item_key TEXT NOT NULL CHECK(item_key IN (
    'neon_lamp','speaker_stack','arcade_cabinet','tool_chest',
    'street_sofa','retro_tv','crystal_altar','gold_throne',
    'graffiti_frame','moon_clock','neon_sign','trophy_shelf')),
  price_gold INTEGER NOT NULL CHECK(price_gold>0),
  purchase_event_key TEXT NOT NULL,
  purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(telegram_id,item_key),
  UNIQUE(telegram_id,purchase_event_key),
  FOREIGN KEY(telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS telegram_pet_furniture_placements (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  slot_key TEXT NOT NULL CHECK(slot_key IN ('left','right','wall')),
  item_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(pet_id,slot_key),
  FOREIGN KEY(pet_id,telegram_id,season_key)
    REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key) ON DELETE CASCADE,
  FOREIGN KEY(telegram_id,item_key)
    REFERENCES telegram_pet_furniture_unlocks(telegram_id,item_key)
);
CREATE INDEX IF NOT EXISTS idx_pet_furniture_placements_owner
  ON telegram_pet_furniture_placements(telegram_id,pet_id,season_key);


-- Home E3: one server-timed garden plot per persistent MoonPet.
-- Kitchen and Gym reuse existing crafting/Train authorities.
CREATE TABLE IF NOT EXISTS telegram_pet_garden_plots (
  pet_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  crop_key TEXT NOT NULL CHECK(crop_key='garden_veggies'),
  status TEXT NOT NULL CHECK(status IN ('growing','harvesting')),
  planted_at TEXT NOT NULL,
  ready_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(julianday(ready_at)>julianday(planted_at)),
  FOREIGN KEY(pet_id,telegram_id,season_key)
    REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_garden_owner
  ON telegram_pet_garden_plots(telegram_id,pet_id,season_key,status,ready_at);

CREATE TABLE IF NOT EXISTS telegram_pet_garden_harvests (
  telegram_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  crop_key TEXT NOT NULL CHECK(crop_key='garden_veggies'),
  crop_planted_at TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity=1),
  status TEXT NOT NULL CHECK(status IN ('pending','settling','completed')),
  harvested_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(telegram_id,event_key),
  UNIQUE(pet_id,crop_planted_at),
  -- Harvest receipts are account history. Pet deletion must not erase them.
  FOREIGN KEY(telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_garden_harvest_crop
  ON telegram_pet_garden_harvests(pet_id,crop_planted_at,status);

-- Telegram website authentication (migration 090).

-- MoonPet Profile room selection / migration 096.
-- Persistent per-pet room choice. Main Room is implicit until a selection is saved.
-- Existing wall/floor/furniture rows, pets, progression and balances are untouched.
CREATE TABLE IF NOT EXISTS telegram_pet_house_rooms (
  pet_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  room_key TEXT NOT NULL CHECK(room_key IN ('main','kitchen','garden','gym')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id,telegram_id,season_key)
    REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_house_room_owner
  ON telegram_pet_house_rooms(telegram_id,pet_id,season_key);


-- Additive room arrangements; existing furniture ownership/placements are retained.
CREATE TABLE IF NOT EXISTS telegram_pet_room_furniture (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  room_key TEXT NOT NULL CHECK(room_key IN ('main','kitchen','garden','gym')),
  items_json TEXT NOT NULL CHECK(json_valid(items_json) AND json_type(items_json)='array' AND json_array_length(items_json)<=8),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(pet_id,room_key),
  FOREIGN KEY(pet_id,telegram_id,season_key) REFERENCES telegram_pet_season_slots(pet_id,telegram_id,season_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_room_furniture_owner ON telegram_pet_room_furniture(telegram_id,pet_id,season_key);

-- Additive authentication metadata. Existing player and ownership keys stay intact.
CREATE TABLE IF NOT EXISTS telegram_oidc_accounts (
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (issuer, client_id, subject),
  UNIQUE (issuer, client_id, telegram_id)
);

CREATE TABLE IF NOT EXISTS telegram_login_transactions (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  return_url TEXT NOT NULL,
  expected_telegram_id TEXT,
  previous_session_hash TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_login_expiry ON telegram_login_transactions(expires_at);

CREATE TABLE IF NOT EXISTS telegram_website_sessions (
  session_hash TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  csrf_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_telegram_session_expiry ON telegram_website_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_telegram_session_last_seen ON telegram_website_sessions(last_seen_at);

CREATE TABLE IF NOT EXISTS telegram_website_credentials (
  token_hash TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL REFERENCES telegram_website_sessions(session_hash) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_credential_expiry ON telegram_website_credentials(expires_at);
CREATE INDEX IF NOT EXISTS idx_telegram_credential_session ON telegram_website_credentials(session_hash);

-- One-time Telegram per-chat Web App menu cleanup (migration 102).
-- The five-minute Worker cron scans registered users incrementally and
-- tracks successful, permanently unavailable and retryable menu resets.
CREATE TABLE IF NOT EXISTS telegram_chat_menu_cleanup (
  user_id INTEGER PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'retry', 'cleared', 'unavailable', 'exhausted')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_telegram_chat_menu_cleanup_due
  ON telegram_chat_menu_cleanup(state, next_attempt_at, user_id);

-- One row shared by all scheduled chunks and Worker instances. Telegram 429
-- retry_after can apply to the entire bot, not only one target chat.
CREATE TABLE IF NOT EXISTS telegram_chat_menu_cleanup_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cooldown_until INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO telegram_chat_menu_cleanup_control (id, cooldown_until) VALUES (1, 0);

-- Website session proof consumption for Telegram Mini App sign-in (migration 101).
CREATE TABLE IF NOT EXISTS telegram_mini_app_login_replay (
  proof_hash TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_mini_app_login_replay_expiry ON telegram_mini_app_login_replay(expires_at);


-- NBG London Telegram leaderboard tables (migrations 098 and 099).
-- Permanent NBG London Level 1 leaderboard records.
-- Only verified Telegram-linked users can be inserted by the Worker.
-- Metrics: fastest run, XP per minute (speed + points), highest score XP.
CREATE TABLE IF NOT EXISTS nbg_london_runs (
  run_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  started_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  finished_at_ms INTEGER,
  finish_token TEXT UNIQUE,
  CHECK (expires_at_ms > started_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_nbg_london_runs_player ON nbg_london_runs(telegram_id, started_at_ms);

CREATE TABLE IF NOT EXISTS nbg_london_records (
  telegram_id TEXT PRIMARY KEY REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  fastest_ms INTEGER NOT NULL CHECK (fastest_ms > 0),
  fastest_xp INTEGER NOT NULL CHECK (fastest_xp >= 0),
  speed_xp_rate REAL NOT NULL CHECK (speed_xp_rate >= 0),
  speed_xp_ms INTEGER NOT NULL CHECK (speed_xp_ms > 0),
  speed_xp_xp INTEGER NOT NULL CHECK (speed_xp_xp >= 0),
  best_xp INTEGER NOT NULL CHECK (best_xp >= 0),
  best_xp_ms INTEGER NOT NULL CHECK (best_xp_ms > 0),
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nbg_london_fastest ON nbg_london_records(fastest_ms ASC, fastest_xp DESC);
CREATE INDEX IF NOT EXISTS idx_nbg_london_speed_xp ON nbg_london_records(speed_xp_rate DESC, speed_xp_ms ASC);
CREATE INDEX IF NOT EXISTS idx_nbg_london_xp ON nbg_london_records(best_xp DESC, best_xp_ms ASC);

-- NBG London bounded prize competitions: daily, weekly and fixed 90-day seasonal.
-- Periods are [start,end) and turn over at 01:00 UTC.
-- A player appears once per period; competition rank is cumulative verified run XP.
CREATE TABLE IF NOT EXISTS nbg_london_period_scores (
  period_kind TEXT NOT NULL CHECK (period_kind IN ('daily', 'weekly', 'seasonal')),
  period_start_ms INTEGER NOT NULL,
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  trusted_xp INTEGER NOT NULL DEFAULT 0 CHECK (trusted_xp >= 0),
  verified_run_count INTEGER NOT NULL DEFAULT 0 CHECK (verified_run_count >= 0),
  run_count INTEGER NOT NULL DEFAULT 0 CHECK (run_count >= 0),
  best_time_ms INTEGER NOT NULL CHECK (best_time_ms > 0),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (period_kind, period_start_ms, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_nbg_london_period_ranks
  ON nbg_london_period_scores (period_kind, period_start_ms, total_xp DESC, best_time_ms ASC);

-- The existing Arcade midnight-UTC Worker cron freezes winner rosters and
-- settles rewards. Closed periods remain retryable until every prize is paid.
CREATE TABLE IF NOT EXISTS nbg_london_prize_periods (
  period_kind TEXT NOT NULL CHECK(period_kind IN ('daily','weekly','seasonal')),
  period_start_ms INTEGER NOT NULL,
  period_end_ms INTEGER NOT NULL,
  frozen_at_ms INTEGER NOT NULL,
  freeze_token TEXT NOT NULL UNIQUE,
  PRIMARY KEY(period_kind, period_start_ms)
);

-- An immutable period/rank/player receipt prevents ranking changes across retries.
CREATE TABLE IF NOT EXISTS nbg_london_prize_awards (
  event_id TEXT PRIMARY KEY,
  period_kind TEXT NOT NULL CHECK (period_kind IN ('daily', 'weekly', 'seasonal')),
  period_start_ms INTEGER NOT NULL,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 3),
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  prize_arcade_xp INTEGER NOT NULL CHECK (prize_arcade_xp > 0),
  settled_at_ms INTEGER NOT NULL,
  payout_token TEXT UNIQUE,
  paid_at_ms INTEGER,
  UNIQUE (period_kind, period_start_ms, rank),
  UNIQUE (period_kind, period_start_ms, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_nbg_london_prizes_player ON nbg_london_prize_awards (telegram_id, settled_at_ms);

CREATE INDEX IF NOT EXISTS idx_nbg_london_unpaid_prizes ON nbg_london_prize_awards(paid_at_ms, period_kind, period_start_ms);

-- Issue #1530 PR1: additive foundation for non-spendable Championship Clout.
-- This does NOT award Clout; a future receipt-verified adapter alone may write.
-- Does not alter Arcade XP, Community XP, Moonpet XP, faction clout or wallets.
-- Do not apply remotely until reviewed, backed up and explicitly approved.
--
-- A source_event_id MUST be unique to the accepted user's qualifying source
-- event. A shared boss/event must use its PER-OWNER accepted receipt, never its
-- global event identifier, to avoid falsely treating multiple owners as one.
-- A source is established once for exactly ONE owner, earned day and
-- verification. Its individual Clout effects must reference this immutable
-- claim. Two effect kinds cannot launder one receipt into another account/day.
-- This is a ledger constraint, NOT independent proof of gameplay: later
-- trusted source adapters must validate the original receipt before insert.
CREATE TABLE IF NOT EXISTS championship_clout_sources (
  source_system TEXT NOT NULL CHECK(length(source_system) BETWEEN 1 AND 64),
  source_event_id TEXT NOT NULL CHECK(length(source_event_id) BETWEEN 1 AND 180),
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 48),
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id),
  day_key TEXT NOT NULL CHECK(length(day_key)=10),
  earned_at_ms INTEGER NOT NULL CHECK(earned_at_ms >= 1704067200000),
  verified_at_ms INTEGER NOT NULL
    CHECK(verified_at_ms >= earned_at_ms),
  verification_kind TEXT NOT NULL
    CHECK(verification_kind IN ('server_receipt','server_replay','server_settlement')),
  recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= verified_at_ms),
  PRIMARY KEY (source_system,source_event_id,policy_version),
  UNIQUE (source_system,source_event_id,policy_version,telegram_id,
    day_key,earned_at_ms,verified_at_ms,verification_kind),
  CHECK(strftime('%Y-%m-%d', earned_at_ms / 1000, 'unixepoch') = day_key)
);
CREATE INDEX IF NOT EXISTS idx_championship_clout_source_owner_day
  ON championship_clout_sources (telegram_id,day_key,policy_version);

CREATE TABLE IF NOT EXISTS championship_clout_effects (
  source_system TEXT NOT NULL CHECK(length(source_system) BETWEEN 1 AND 64),
  source_event_id TEXT NOT NULL CHECK(length(source_event_id) BETWEEN 1 AND 180),
  effect_kind TEXT NOT NULL
    CHECK(effect_kind IN ('skill','mission','variety','community','streak')),
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 48),
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id),
  verification_kind TEXT NOT NULL
    CHECK(verification_kind IN ('server_receipt','server_replay','server_settlement')),
  earned_at_ms INTEGER NOT NULL CHECK(earned_at_ms >= 1704067200000),
  verified_at_ms INTEGER NOT NULL CHECK(verified_at_ms >= 1704067200000 AND verified_at_ms >= earned_at_ms),
  day_key TEXT NOT NULL CHECK(length(day_key)=10),
  game_key TEXT CHECK(game_key IS NULL OR length(game_key) BETWEEN 1 AND 64),
  source_pet_id TEXT,
  normalized_skill INTEGER CHECK(normalized_skill BETWEEN 0 AND 100),
  fixed_points INTEGER CHECK(fixed_points BETWEEN 0 AND 25),
  recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 1704067200000),
  PRIMARY KEY (source_system, source_event_id, effect_kind, policy_version),
  FOREIGN KEY (source_system,source_event_id,policy_version,telegram_id,
    day_key,earned_at_ms,verified_at_ms,verification_kind)
    REFERENCES championship_clout_sources (source_system,source_event_id,
      policy_version,telegram_id,day_key,earned_at_ms,verified_at_ms,
      verification_kind)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (
    (effect_kind = 'skill' AND game_key IS NOT NULL
      AND normalized_skill IS NOT NULL AND fixed_points IS NULL)
    OR
    (effect_kind = 'variety' AND game_key IS NOT NULL
      AND normalized_skill IS NULL AND fixed_points IS NULL)
    OR
    (effect_kind IN ('mission','community','streak') AND normalized_skill IS NULL
      AND fixed_points IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_championship_clout_effect_owner_day
  ON championship_clout_effects (telegram_id, day_key, policy_version);
CREATE INDEX IF NOT EXISTS idx_championship_clout_effect_day
  ON championship_clout_effects (day_key, policy_version, effect_kind);
CREATE INDEX IF NOT EXISTS idx_championship_clout_effect_source
  ON championship_clout_effects (source_system, telegram_id, earned_at_ms);

-- Materialized daily snapshot computed only from trusted effects above.
-- A later guarded adapter must recalculate this in a D1 transaction; never
-- increment total_points by client-provided or repeated deltas.
CREATE TABLE IF NOT EXISTS championship_clout_daily (
  telegram_id TEXT NOT NULL REFERENCES telegram_users(telegram_id),
  day_key TEXT NOT NULL CHECK(length(day_key)=10),
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 48),
  skill_points INTEGER NOT NULL DEFAULT 0 CHECK(skill_points BETWEEN 0 AND 40),
  mission_points INTEGER NOT NULL DEFAULT 0 CHECK(mission_points BETWEEN 0 AND 25),
  variety_points INTEGER NOT NULL DEFAULT 0 CHECK(variety_points BETWEEN 0 AND 15),
  community_points INTEGER NOT NULL DEFAULT 0 CHECK(community_points BETWEEN 0 AND 10),
  streak_points INTEGER NOT NULL DEFAULT 0 CHECK(streak_points BETWEEN 0 AND 10),
  total_points INTEGER NOT NULL DEFAULT 0 CHECK(total_points BETWEEN 0 AND 100),
  game_keys_json TEXT NOT NULL DEFAULT '[]'
    CHECK(json_valid(game_keys_json) AND json_type(game_keys_json)='array'),
  first_earned_at_ms INTEGER NOT NULL CHECK(first_earned_at_ms >= 1704067200000),
  recalculated_at_ms INTEGER NOT NULL CHECK(recalculated_at_ms >= 1704067200000),
  PRIMARY KEY (telegram_id, day_key, policy_version),
  CHECK(total_points = skill_points + mission_points + variety_points +
    community_points + streak_points)
);
CREATE INDEX IF NOT EXISTS idx_championship_clout_daily_period
  ON championship_clout_daily (policy_version, day_key, total_points DESC, telegram_id);

-- Immutable period snapshot is a *future* release step. PR1 has no freezing
-- scheduler or payout job; no Worker code writes this table.
CREATE TABLE IF NOT EXISTS championship_clout_archives (
  period_kind TEXT NOT NULL
    CHECK(period_kind IN ('daily','weekly','quarterly','annual')),
  period_key TEXT NOT NULL CHECK(length(period_key) BETWEEN 4 AND 20),
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 48),
  period_start_ms INTEGER NOT NULL,
  period_end_ms INTEGER NOT NULL,
  frozen_at_ms INTEGER NOT NULL,
  standings_json TEXT NOT NULL
    CHECK(json_valid(standings_json) AND json_type(standings_json)='array'),
  PRIMARY KEY (period_kind, period_key, policy_version),
  CHECK(period_end_ms > period_start_ms),
  CHECK(frozen_at_ms >= period_end_ms)
);

-- TAG RUN canonical schema, mirroring migration 103. Keep identical for fixture bootstraps.
-- TAG RUN: Telegram chat-local Street Cred and WAX reward planning (non-custodial).
-- This migration creates no token transfers and does not touch Arcade XP or MoonPet.
-- Apply in a reviewed D1 migration deployment BEFORE enabling TAG_RUN_ENABLED.
CREATE TABLE IF NOT EXISTS tag_run_messages (
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  week_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 17),
  message_unix INTEGER NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS tag_run_messages_member_day
  ON tag_run_messages(chat_id, telegram_id, day_key, message_unix);
CREATE INDEX IF NOT EXISTS tag_run_messages_member_week
  ON tag_run_messages(chat_id, week_key, telegram_id);
CREATE INDEX IF NOT EXISTS tag_run_messages_member_hash
  ON tag_run_messages(chat_id, telegram_id, content_hash, message_unix);

-- Rank thresholds are mirrored from core.js and checked in contract tests.
-- The receipt trigger is atomic with each accepted message, so concurrent
-- messages cannot miss a rank crossing or create a duplicate celebration.
CREATE TABLE IF NOT EXISTS tag_run_rank_levels (
  threshold INTEGER PRIMARY KEY CHECK(threshold >= 0),
  name TEXT NOT NULL UNIQUE
);
INSERT OR IGNORE INTO tag_run_rank_levels(threshold,name) VALUES
  (0, 'Newbie Tagger'),
  (25, 'Fresh Ink'),
  (60, 'Sticker Bandit'),
  (100, 'Street Rat'),
  (150, 'Marker Maniac'),
  (220, 'Alley Artist'),
  (300, 'Stencil Starter'),
  (420, 'Throwie Trainee'),
  (580, 'Rooftop Rookie'),
  (760, 'Trackside Tagger'),
  (1000, 'Train Bomber'),
  (1300, 'Night Shift Sprayer'),
  (1700, 'Chrome Chaser'),
  (2200, 'Outline Operator'),
  (2800, 'Fill-In Fiend'),
  (3500, 'Drip Doctor'),
  (4400, 'Wildstyle Wrangler'),
  (5500, 'Freight Phantom'),
  (7000, 'Tunnel Tactician'),
  (9000, 'Yard Ninja'),
  (11500, 'Roller Renegade'),
  (14500, 'Piece Prodigy'),
  (18500, 'Burner Maker'),
  (23500, 'Style General'),
  (30000, 'City-Wide'),
  (38000, 'Hall of Fame'),
  (48000, 'Graffiti Veteran'),
  (60000, 'Graffiti Legend'),
  (95000, 'Graffiti King');

-- Private-admin TAG RUN member blocks. Historical receipts remain immutable.
CREATE TABLE IF NOT EXISTS tag_run_member_blocks (
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL CHECK(telegram_id GLOB '[0-9]*' AND length(telegram_id) BETWEEN 1 AND 20),
  username TEXT NOT NULL COLLATE NOCASE CHECK(length(username) BETWEEN 5 AND 32),
  blocked INTEGER NOT NULL DEFAULT 1 CHECK(blocked IN (0,1)),
  updated_by TEXT NOT NULL CHECK(updated_by GLOB '[0-9]*' AND length(updated_by) BETWEEN 1 AND 20),
  blocked_at TEXT,
  unblocked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id,telegram_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS tag_run_member_blocks_username
  ON tag_run_member_blocks(chat_id,username COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS tag_run_member_blocks_active
  ON tag_run_member_blocks(chat_id,blocked,telegram_id);

CREATE TABLE IF NOT EXISTS tag_run_rank_announcements (
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  rank_threshold INTEGER NOT NULL CHECK(rank_threshold > 0),
  rank_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  total_points INTEGER NOT NULL CHECK(total_points > 0),
  source_message_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'attempted', 'sent', 'needs_review')),
  telegram_message_id INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempted_at TEXT,
  sent_at TEXT,
  PRIMARY KEY(chat_id, telegram_id, rank_threshold)
);
CREATE INDEX IF NOT EXISTS tag_run_rank_announcements_queue
  ON tag_run_rank_announcements(chat_id, status, created_at);

-- Incremental member totals keep every chat message O(1) rather than
-- rescanning the user's entire message history for every rank crossing.
CREATE TABLE IF NOT EXISTS tag_run_member_totals (
  chat_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score >= 0),
  posts INTEGER NOT NULL CHECK(posts >= 0),
  display_name TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id, telegram_id)
);
CREATE INDEX IF NOT EXISTS tag_run_member_totals_leaderboard
  ON tag_run_member_totals(chat_id, score DESC, posts DESC, telegram_id);

CREATE TRIGGER IF NOT EXISTS tag_run_message_rank_up
AFTER INSERT ON tag_run_messages
BEGIN
  INSERT INTO tag_run_member_totals
    (chat_id,telegram_id,score,posts,display_name)
  VALUES (NEW.chat_id,NEW.telegram_id,NEW.points,1,NEW.display_name)
  ON CONFLICT(chat_id,telegram_id) DO UPDATE SET
    score=tag_run_member_totals.score+excluded.score,
    posts=tag_run_member_totals.posts+1,
    display_name=excluded.display_name,
    updated_at=CURRENT_TIMESTAMP;

  INSERT OR IGNORE INTO tag_run_rank_announcements
    (chat_id,telegram_id,rank_threshold,rank_name,display_name,total_points,source_message_id)
  SELECT NEW.chat_id, NEW.telegram_id, levels.threshold, levels.name,
    NEW.display_name, totals.score, NEW.message_id
  FROM tag_run_rank_levels AS levels
  JOIN tag_run_member_totals AS totals
    ON totals.chat_id=NEW.chat_id AND totals.telegram_id=NEW.telegram_id
  WHERE levels.threshold > 0
    AND totals.score >= levels.threshold
    AND totals.score - NEW.points < levels.threshold
  ORDER BY levels.threshold DESC
  LIMIT 1;
END;

-- The chat member earns points without needing a website account link.
-- Wallet registration is private and always UNVERIFIED until a future signed proof.
CREATE TABLE IF NOT EXISTS tag_run_wallets (
  telegram_id TEXT PRIMARY KEY,
  wax_account TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(verification_status IN ('pending','verified')),
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT
);

-- One reward token selected at a time. Config may be replaced for future weeks.
-- Amounts use integer token minimum units, never floating-point tokens.
CREATE TABLE IF NOT EXISTS tag_run_reward_config (
  chat_id TEXT PRIMARY KEY,
  token_contract TEXT NOT NULL DEFAULT 'kingsofgraff',
  token_symbol TEXT NOT NULL DEFAULT 'LFGK',
  token_precision INTEGER CHECK(token_precision BETWEEN 0 AND 8),
  base_amount_units INTEGER NOT NULL DEFAULT 0 CHECK(base_amount_units >= 0),
  max_weekly_units INTEGER NOT NULL DEFAULT 0 CHECK(max_weekly_units >= 0),
  top1_multiplier INTEGER NOT NULL DEFAULT 5 CHECK(top1_multiplier BETWEEN 1 AND 20),
  top2_multiplier INTEGER NOT NULL DEFAULT 3 CHECK(top2_multiplier BETWEEN 1 AND 20),
  top3_multiplier INTEGER NOT NULL DEFAULT 2 CHECK(top3_multiplier BETWEEN 1 AND 20),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  -- Monotonic CAS version. Every admin mutation (including repeated disable)
  -- increments revision to reject stale reads and delayed RPC responses.
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Frozen drafts are NOT claimable/transferrable on-chain. No signer is installed.
-- A real payment service must be separately authorised and reconcile tx IDs.
CREATE TABLE IF NOT EXISTS tag_run_weekly_plans (
  chat_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  token_contract TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_precision INTEGER NOT NULL,
  base_amount_units INTEGER NOT NULL,
  max_weekly_units INTEGER NOT NULL,
  top1_multiplier INTEGER NOT NULL,
  top2_multiplier INTEGER NOT NULL,
  top3_multiplier INTEGER NOT NULL,
  planned_units INTEGER NOT NULL CHECK(planned_units > 0),
  recipient_count INTEGER NOT NULL CHECK(recipient_count BETWEEN 1 AND 1000),
  -- Frozen ranked results are the sole source of allocation rows. Never rescan
  -- live chat receipts after the budget validation or duplicate a payment plan.
  standings_json TEXT NOT NULL CHECK(
    json_valid(standings_json) AND json_type(standings_json)='array'
  ),
  status TEXT NOT NULL DEFAULT 'review_only'
    CHECK(status = 'review_only'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id, week_key)
);
CREATE TABLE IF NOT EXISTS tag_run_weekly_allocations (
  chat_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  rank_position INTEGER NOT NULL CHECK(rank_position > 0),
  street_cred INTEGER NOT NULL CHECK(street_cred > 0),
  amount_units INTEGER NOT NULL CHECK(amount_units > 0),
  registered_wax_account TEXT,
  wallet_verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(wallet_verification_status IN ('pending','verified')),
  status TEXT NOT NULL DEFAULT 'review_only'
    CHECK(status = 'review_only'),
  PRIMARY KEY(chat_id, week_key, telegram_id),
  FOREIGN KEY(chat_id, week_key) REFERENCES tag_run_weekly_plans(chat_id, week_key)
);
CREATE INDEX IF NOT EXISTS tag_run_weekly_allocations_member
  ON tag_run_weekly_allocations(telegram_id, week_key);

-- TAG RUN V2 Community Token Pot foundation. ADDITIVE; NEVER reset V1.
-- Public proposed WAX account: isthatajoint. Owner/custody unverified.
-- No token signing, payouts, price oracle, or transfer routes.
-- Apply to production D1 ONLY after backup and explicit migration review.

CREATE TABLE IF NOT EXISTS tag_run_v2_pool_config (
  config_id INTEGER PRIMARY KEY CHECK(config_id=1),
  wallet_account TEXT NOT NULL DEFAULT 'isthatajoint'
    CHECK(wallet_account='isthatajoint'),
  daily_bps INTEGER NOT NULL DEFAULT 500 CHECK(daily_bps = 500),
  historical_ticket_bps INTEGER NOT NULL DEFAULT 5000
    CHECK(historical_ticket_bps = 5000),
  status TEXT NOT NULL DEFAULT 'paused'
    CHECK(status IN ('paused','read_only','review_only')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active_daily_bps INTEGER NOT NULL DEFAULT 100 CHECK(active_daily_bps = 100),
  active_policy_version INTEGER NOT NULL DEFAULT 2 CHECK(active_policy_version = 2)
);
INSERT OR IGNORE INTO tag_run_v2_pool_config(config_id,wallet_account)
VALUES(1,'isthatajoint');

CREATE TABLE IF NOT EXISTS tag_run_v2_assets (
  asset_key TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL,
  token_contract TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_precision INTEGER NOT NULL CHECK(token_precision BETWEEN 0 AND 8),
  eligibility TEXT NOT NULL DEFAULT 'quarantined'
    CHECK(eligibility IN ('quarantined','approved','suspended')),
  verified_at TEXT,
  reviewed_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chain_id,token_contract,token_symbol,token_precision)
);
CREATE INDEX IF NOT EXISTS tag_run_v2_assets_eligibility
  ON tag_run_v2_assets(eligibility,token_symbol,token_contract);

-- Deposit events are NOT considered donated by default. Irreversible chain
-- history, memo policy, source and asset must be independently validated.
CREATE TABLE IF NOT EXISTS tag_run_v2_deposits (
  chain_id TEXT NOT NULL,
  global_action_seq TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  block_num INTEGER NOT NULL CHECK(block_num > 0),
  block_id TEXT NOT NULL,
  sender_account TEXT NOT NULL,
  recipient_account TEXT NOT NULL CHECK(recipient_account='isthatajoint'),
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  units TEXT NOT NULL CHECK(length(units) BETWEEN 1 AND 78 AND units NOT GLOB '*[^0-9]*' AND (units='0' OR substr(units,1,1)!='0')),
  memo_digest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'quarantined'
    CHECK(status IN ('quarantined','confirmed_donation','refund_review','rejected')),
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  PRIMARY KEY(chain_id,global_action_seq)
);
CREATE INDEX IF NOT EXISTS tag_run_v2_deposits_asset
  ON tag_run_v2_deposits(asset_key,status,block_num);

-- All units are decimal strings: SQLite INTEGER and JS Number cannot cover
-- arbitrary 8-decimal token holdings reliably. Never SQL SUM() these strings.
CREATE TABLE IF NOT EXISTS tag_run_v2_snapshots (
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  wallet_account TEXT NOT NULL CHECK(wallet_account='isthatajoint'),
  chain_irreversible_block INTEGER NOT NULL CHECK(chain_irreversible_block >= 0),
  chain_block_id TEXT NOT NULL,
  onchain_units TEXT NOT NULL,
  allocated_unpaid_units TEXT NOT NULL,
  excluded_units TEXT NOT NULL,
  spendable_units TEXT NOT NULL,
  five_percent_units TEXT NOT NULL,
  snapshot_digest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unverified'
    CHECK(status IN ('unverified','verified','quarantined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reward_policy_bps INTEGER NOT NULL DEFAULT 500 CHECK(reward_policy_bps IN (100,500)),
  daily_reward_units TEXT NOT NULL DEFAULT '0' CHECK(length(daily_reward_units) BETWEEN 1 AND 78 AND daily_reward_units NOT GLOB '*[^0-9]*' AND (daily_reward_units='0' OR substr(daily_reward_units,1,1)!='0')),
  PRIMARY KEY(chat_id,day_key,asset_key)
);
CREATE INDEX IF NOT EXISTS tag_run_v2_snapshots_day
  ON tag_run_v2_snapshots(chat_id,day_key,status);

-- Failed/partial midnight captures must be retried before advancing days.
-- The cursor is updated only after every member receipt for that UTC day
-- has been persisted. Replaying incomplete days is safe via INSERT OR IGNORE.
CREATE TABLE IF NOT EXISTS tag_run_v2_capture_cursors (
  chat_id TEXT PRIMARY KEY,
  last_completed_day_key TEXT NOT NULL
    CHECK(last_completed_day_key GLOB '????-??-??'),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A member's unspent ticket weight is not a fungible-token debt. Its creation
-- is tied to real V1 message receipts, which remain authoritative.
CREATE TABLE IF NOT EXISTS tag_run_v2_participation (
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  earned_weight INTEGER NOT NULL CHECK(earned_weight BETWEEN 0 AND 510),
  spent_historical_weight INTEGER NOT NULL DEFAULT 0
    CHECK(spent_historical_weight >= 0),
  source_receipts_digest TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id,day_key,telegram_id),
  CHECK(spent_historical_weight <= earned_weight)
);
CREATE INDEX IF NOT EXISTS tag_run_v2_participation_member
  ON tag_run_v2_participation(chat_id,telegram_id,day_key);

-- Immutable draw preview evidence. A review-only preview creates NO token
-- obligations. Funded reservations require a later approved custody release.
CREATE TABLE IF NOT EXISTS tag_run_v2_draws (
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview_only'
    CHECK(status IN ('preview_only','rejected','reviewed')),
  seed_commitment TEXT NOT NULL,
  seed_reveal TEXT,
  rules_digest TEXT NOT NULL,
  weights_digest TEXT NOT NULL,
  snapshots_digest TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT,
  reward_policy_bps INTEGER NOT NULL DEFAULT 500 CHECK(reward_policy_bps IN (100,500)),
  PRIMARY KEY(chat_id,day_key)
);
CREATE TABLE IF NOT EXISTS tag_run_v2_bundles (
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  bundle_index INTEGER NOT NULL CHECK(bundle_index BETWEEN 0 AND 999),
  telegram_id TEXT NOT NULL,
  ticket_class TEXT NOT NULL CHECK(ticket_class IN ('current','historical')),
  units TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview_only' CHECK(status='preview_only'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id,day_key,asset_key,bundle_index),
  FOREIGN KEY(chat_id,day_key) REFERENCES tag_run_v2_draws(chat_id,day_key)
);
CREATE INDEX IF NOT EXISTS tag_run_v2_bundles_member
  ON tag_run_v2_bundles(chat_id,telegram_id,day_key);

-- Future token obligations require a separate migration and guarded write
-- authority. This schema deliberately cannot mark token bundles 'paid'.
CREATE TABLE IF NOT EXISTS tag_run_v2_audit (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  reviewed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- Migration 105: TAG RUN V2 production payout ledger (execution gates OFF by default).
-- TAG RUN V2 payout ledger foundation; PRODUCTION migration, not an offline rehearsal.
-- APPLY ONLY AFTER BACKUP, OWNER AUTHORIZATION, REVIEW, AND REQUIRED CI CHECKS.
-- This migration DOES NOT enable payout flags, keys, transfer jobs, or funding.
-- Asset, donation and irreversible snapshot approvals remain separate gates.
CREATE TABLE IF NOT EXISTS tag_run_v2_payout_caps (
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL CHECK(day_key GLOB '????-??-??'),
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  snapshot_digest TEXT NOT NULL CHECK(length(snapshot_digest)=64 AND snapshot_digest NOT GLOB '*[^0-9a-f]*'),
  daily_limit_units TEXT NOT NULL CHECK(length(daily_limit_units) BETWEEN 1 AND 78 AND daily_limit_units NOT GLOB '*[^0-9]*' AND (daily_limit_units='0' OR substr(daily_limit_units,1,1)!='0')),
  last_intent_key TEXT NOT NULL DEFAULT '' CHECK(last_intent_key='' OR (length(last_intent_key)=64 AND last_intent_key NOT GLOB '*[^0-9a-f]*')),
  per_transfer_limit_units TEXT NOT NULL CHECK(
    length(per_transfer_limit_units) BETWEEN 1 AND 78
    AND per_transfer_limit_units NOT GLOB '*[^0-9]*'
    AND substr(per_transfer_limit_units,1,1)!='0'),
  -- Exact amount of the most recent cap increment. SQL INSERT intents
  -- must match this amount, not just last_intent_key.
  last_reserved_units TEXT NOT NULL DEFAULT '0' CHECK(
    length(last_reserved_units) BETWEEN 1 AND 78
    AND last_reserved_units NOT GLOB '*[^0-9]*'
    AND (last_reserved_units='0' OR substr(last_reserved_units,1,1)!='0')),
  committed_units TEXT NOT NULL DEFAULT '0' CHECK(length(committed_units) BETWEEN 1 AND 78 AND committed_units NOT GLOB '*[^0-9]*' AND (committed_units='0' OR substr(committed_units,1,1)!='0')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0 AND revision<=9007199254740991),
  paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1)),
  authorized_by TEXT NOT NULL CHECK(length(authorized_by)>0),
  reward_policy_bps INTEGER NOT NULL DEFAULT 500 CHECK(reward_policy_bps IN (100,500)),
  PRIMARY KEY(chat_id,day_key,asset_key),
  FOREIGN KEY(chat_id,day_key,asset_key) REFERENCES tag_run_v2_snapshots(chat_id,day_key,asset_key)
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_cap_source_guard
BEFORE INSERT ON tag_run_v2_payout_caps
WHEN NEW.reward_policy_bps!=100 OR NEW.paused!=1 OR NEW.revision!=0 OR NEW.committed_units!='0'
 OR NEW.last_reserved_units!='0' OR NEW.last_intent_key!=''
 OR NOT EXISTS (
  SELECT 1 FROM tag_run_v2_pool_config p
  WHERE p.config_id=1 AND p.status='review_only'
    AND p.wallet_account='isthatajoint' AND p.daily_bps=500
    AND p.active_daily_bps=100 AND p.active_policy_version=2
    AND p.historical_ticket_bps=5000
) OR NOT EXISTS (
  SELECT 1 FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a
    ON a.asset_key=s.asset_key
  WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key
    AND s.asset_key=NEW.asset_key AND s.status='verified'
    AND a.eligibility='approved' AND s.snapshot_digest=NEW.snapshot_digest
    AND s.reward_policy_bps=100 AND s.daily_reward_units=NEW.daily_limit_units
    AND s.daily_reward_units=(CASE WHEN length(s.spendable_units)<=2 THEN '0' ELSE substr(s.spendable_units,1,length(s.spendable_units)-2) END)
    AND (
      length(NEW.daily_limit_units)>length(NEW.per_transfer_limit_units)
      OR (length(NEW.daily_limit_units)=length(NEW.per_transfer_limit_units)
          AND NEW.daily_limit_units>=NEW.per_transfer_limit_units)
    )
) OR EXISTS (
  SELECT 1 FROM tag_run_v2_payout_caps c
  WHERE c.chat_id=NEW.chat_id AND c.day_key=NEW.day_key
    AND c.asset_key=NEW.asset_key
)
BEGIN SELECT RAISE(ABORT,'v2_payout_cap_source_unapproved_or_duplicate'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_cap_update_guard
BEFORE UPDATE ON tag_run_v2_payout_caps
WHEN NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key
 OR NEW.asset_key!=OLD.asset_key OR NEW.snapshot_digest!=OLD.snapshot_digest
 OR NEW.daily_limit_units!=OLD.daily_limit_units
 OR NEW.per_transfer_limit_units!=OLD.per_transfer_limit_units
 OR NEW.authorized_by!=OLD.authorized_by
 OR NEW.revision!=OLD.revision+1
 OR (NEW.committed_units!=OLD.committed_units AND (
      NEW.last_intent_key=OLD.last_intent_key
   OR length(NEW.last_intent_key)!=64
   OR NEW.last_reserved_units='0'
   OR (length(NEW.per_transfer_limit_units)<length(NEW.last_reserved_units)
      OR (length(NEW.per_transfer_limit_units)=length(NEW.last_reserved_units)
          AND NEW.per_transfer_limit_units<NEW.last_reserved_units))
   OR NEW.committed_units!=(
   WITH RECURSIVE exact_add(pos,carry,digits) AS (
     SELECT 0,0,''
     UNION ALL
     SELECT pos+1, (carry+CAST(CASE WHEN pos < length(OLD.committed_units) THEN substr(OLD.committed_units,length(OLD.committed_units)-pos,1) ELSE '0' END AS INTEGER)+CAST(CASE WHEN pos < length(NEW.last_reserved_units) THEN substr(NEW.last_reserved_units,length(NEW.last_reserved_units)-pos,1) ELSE '0' END AS INTEGER))/10, CAST((carry+CAST(CASE WHEN pos < length(OLD.committed_units) THEN substr(OLD.committed_units,length(OLD.committed_units)-pos,1) ELSE '0' END AS INTEGER)+CAST(CASE WHEN pos < length(NEW.last_reserved_units) THEN substr(NEW.last_reserved_units,length(NEW.last_reserved_units)-pos,1) ELSE '0' END AS INTEGER))%10 AS TEXT)||digits
     FROM exact_add
     WHERE pos < max(length(OLD.committed_units),length(NEW.last_reserved_units))
   )
   SELECT (CASE WHEN carry>0 THEN CAST(carry AS TEXT) ELSE '' END)||digits
   FROM exact_add ORDER BY pos DESC LIMIT 1
 )
   OR EXISTS (SELECT 1 FROM tag_run_v2_payout_intents i
      WHERE i.intent_key=NEW.last_intent_key)))
 OR (NEW.committed_units=OLD.committed_units AND
     (NEW.last_intent_key!=OLD.last_intent_key OR
      NEW.last_reserved_units!=OLD.last_reserved_units))
 OR NOT (length(NEW.committed_units)>length(OLD.committed_units)
      OR (length(NEW.committed_units)=length(OLD.committed_units)
       AND NEW.committed_units>=OLD.committed_units))
 OR NOT (length(NEW.daily_limit_units)>length(NEW.committed_units)
      OR (length(NEW.daily_limit_units)=length(NEW.committed_units)
       AND NEW.daily_limit_units>=NEW.committed_units))
 OR (NEW.committed_units!=OLD.committed_units AND (OLD.paused=1 OR NEW.paused=1))
BEGIN SELECT RAISE(ABORT,'v2_payout_cap_immutable'); END;
-- Only one active or unresolved cap may use a token asset at once.
-- Across UTC days, old UNKNOWN/RESERVED obligations must first be reconciled;
-- otherwise each day could independently spend 5% of the same old balance.
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_cap_no_overlap
BEFORE UPDATE OF paused ON tag_run_v2_payout_caps
WHEN NEW.paused=0 AND OLD.paused=1 AND EXISTS (
  SELECT 1 FROM tag_run_v2_payout_caps other
  WHERE other.asset_key=NEW.asset_key
    AND (other.chat_id!=NEW.chat_id OR other.day_key!=NEW.day_key)
    AND (
      other.paused=0 OR EXISTS (
        SELECT 1 FROM tag_run_v2_payout_intents i
        WHERE i.chat_id=other.chat_id AND i.day_key=other.day_key
          AND i.asset_key=other.asset_key
          AND i.status IN ('reserved','broadcast_unknown','reconciliation_review')
      )
    )
)
BEGIN SELECT RAISE(ABORT,'v2_payout_asset_obligations_unresolved'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_cap_no_delete
BEFORE DELETE ON tag_run_v2_payout_caps
BEGIN SELECT RAISE(ABORT,'v2_payout_cap_immutable'); END;

CREATE TABLE IF NOT EXISTS tag_run_v2_payout_intents (
  intent_key TEXT NOT NULL PRIMARY KEY CHECK(length(intent_key)=64 AND intent_key NOT GLOB '*[^0-9a-f]*'),
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  bundle_index INTEGER NOT NULL CHECK(bundle_index BETWEEN 0 AND 19),
  telegram_id TEXT NOT NULL,
  receiving_account TEXT NOT NULL,
  amount_units TEXT NOT NULL CHECK(length(amount_units) BETWEEN 1 AND 78 AND amount_units NOT GLOB '*[^0-9]*' AND substr(amount_units,1,1)!='0'),
  snapshot_digest TEXT NOT NULL,
  authorization_digest TEXT NOT NULL CHECK(length(authorization_digest)=64 AND authorization_digest NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','broadcast_unknown','confirmed','reconciliation_review')),
  signed_tx_id TEXT,
  approved_by TEXT NOT NULL CHECK(length(approved_by)>0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id,day_key,asset_key,bundle_index),
  FOREIGN KEY(chat_id,day_key,asset_key) REFERENCES tag_run_v2_payout_caps(chat_id,day_key,asset_key),
  CHECK((status IN ('reserved','broadcast_unknown','reconciliation_review')
         AND signed_tx_id IS NULL)
     OR (status='confirmed' AND signed_tx_id IS NOT NULL
         AND length(signed_tx_id)=64
         AND signed_tx_id NOT GLOB '*[^0-9a-f]*'))
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_intent_source_guard
BEFORE INSERT ON tag_run_v2_payout_intents
WHEN NEW.status!='reserved' OR NEW.signed_tx_id IS NOT NULL
OR NOT EXISTS (
  SELECT 1 FROM tag_run_v2_pool_config p
  WHERE p.config_id=1 AND p.status='review_only'
    AND p.wallet_account='isthatajoint' AND p.daily_bps=500
    AND p.active_daily_bps=100 AND p.active_policy_version=2
    AND p.historical_ticket_bps=5000
) OR NOT EXISTS (
  SELECT 1 FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a
    ON a.asset_key=s.asset_key
  WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key
    AND s.asset_key=NEW.asset_key AND s.status='verified'
    AND s.snapshot_digest=NEW.snapshot_digest
    AND s.reward_policy_bps=100
    AND s.daily_reward_units=(CASE WHEN length(s.spendable_units)<=2 THEN '0' ELSE substr(s.spendable_units,1,length(s.spendable_units)-2) END)
    AND a.eligibility='approved'
) OR NOT EXISTS (
  SELECT 1 FROM tag_run_v2_payout_caps c
  WHERE c.chat_id=NEW.chat_id AND c.day_key=NEW.day_key
    AND c.asset_key=NEW.asset_key AND c.snapshot_digest=NEW.snapshot_digest
    AND c.paused=0 AND c.reward_policy_bps=100 AND c.last_intent_key=NEW.intent_key
    AND c.last_reserved_units=NEW.amount_units
    AND (
      length(c.per_transfer_limit_units)>length(NEW.amount_units)
      OR (length(c.per_transfer_limit_units)=length(NEW.amount_units)
          AND c.per_transfer_limit_units>=NEW.amount_units)
    )
) OR NOT EXISTS (
  SELECT 1 FROM tag_run_wallets w
  WHERE w.telegram_id=NEW.telegram_id AND w.wax_account=NEW.receiving_account
) OR NOT EXISTS (
  SELECT 1 FROM tag_run_v2_bundles b
  WHERE b.chat_id=NEW.chat_id AND b.day_key=NEW.day_key
    AND b.asset_key=NEW.asset_key AND b.bundle_index=NEW.bundle_index
    AND b.telegram_id=NEW.telegram_id AND b.units=NEW.amount_units
    AND b.status='preview_only'
    AND EXISTS (
      SELECT 1 FROM tag_run_v2_draws d
      WHERE d.chat_id=b.chat_id AND d.day_key=b.day_key
        AND d.status='reviewed' AND d.reward_policy_bps=100
        AND d.reviewed_by IS NOT NULL AND length(d.reviewed_by)>0
    )
) OR EXISTS (
  SELECT 1 FROM tag_run_v2_payout_intents i
  WHERE i.intent_key=NEW.intent_key
     OR (i.chat_id=NEW.chat_id AND i.day_key=NEW.day_key
       AND i.asset_key=NEW.asset_key AND i.bundle_index=NEW.bundle_index)
)
BEGIN SELECT RAISE(ABORT,'v2_payout_intent_source_unapproved_or_duplicate'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_intent_update_guard
BEFORE UPDATE ON tag_run_v2_payout_intents
WHEN NEW.intent_key!=OLD.intent_key OR NEW.chat_id!=OLD.chat_id
 OR NEW.day_key!=OLD.day_key OR NEW.asset_key!=OLD.asset_key
 OR NEW.bundle_index!=OLD.bundle_index OR NEW.telegram_id!=OLD.telegram_id
 OR NEW.receiving_account!=OLD.receiving_account OR NEW.amount_units!=OLD.amount_units
 OR NEW.snapshot_digest!=OLD.snapshot_digest
 OR NEW.authorization_digest!=OLD.authorization_digest
 OR NEW.approved_by!=OLD.approved_by
 OR NOT (
    (OLD.status='reserved' AND NEW.status='broadcast_unknown')
 OR (OLD.status='broadcast_unknown' AND NEW.status IN ('confirmed','reconciliation_review'))
 OR (OLD.status='reconciliation_review' AND NEW.status='confirmed')
 OR (OLD.status=NEW.status AND OLD.signed_tx_id IS NEW.signed_tx_id)
 )
 OR (NEW.status='confirmed' AND (NEW.signed_tx_id IS NULL
     OR length(NEW.signed_tx_id)!=64
     OR NEW.signed_tx_id GLOB '*[^0-9a-f]*'))
 OR (OLD.signed_tx_id IS NOT NULL AND NEW.signed_tx_id IS NOT OLD.signed_tx_id)
BEGIN SELECT RAISE(ABORT,'v2_payout_intent_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_intent_no_delete
BEFORE DELETE ON tag_run_v2_payout_intents
BEGIN SELECT RAISE(ABORT,'v2_payout_intent_immutable'); END;
CREATE INDEX IF NOT EXISTS tag_run_v2_payout_intents_state
ON tag_run_v2_payout_intents(status,day_key);

-- Old caps may remain as historical evidence but can never be unpaused for
-- 1% execution. A cap from policy v2 also requires a v2 reviewed draw.
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_cap_policy_activation_guard
BEFORE UPDATE OF paused ON tag_run_v2_payout_caps
WHEN NEW.paused=0 AND (
  NEW.reward_policy_bps!=100
  OR NOT EXISTS (
    SELECT 1 FROM tag_run_v2_draws d
    WHERE d.chat_id=NEW.chat_id AND d.day_key=NEW.day_key
      AND d.status='reviewed' AND d.reward_policy_bps=100
  )
  OR NOT EXISTS (
    SELECT 1 FROM tag_run_v2_snapshots s
    WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key
      AND s.asset_key=NEW.asset_key AND s.status='verified'
      AND s.reward_policy_bps=100
      AND s.daily_reward_units=NEW.daily_limit_units
      AND s.daily_reward_units=(CASE WHEN length(s.spendable_units)<=2 THEN '0' ELSE substr(s.spendable_units,1,length(s.spendable_units)-2) END)
  )
)
BEGIN SELECT RAISE(ABORT,'v2_legacy_cap_cannot_activate'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_cap_policy_immutable
BEFORE UPDATE OF reward_policy_bps ON tag_run_v2_payout_caps
BEGIN SELECT RAISE(ABORT,'v2_payout_cap_policy_immutable'); END;

-- Legacy policy markers are HISTORICAL, not editable release approvals.
-- New policy rows are born as v2; UPDATE is never a supported conversion.
-- BEFORE INSERT duplicate guards also cover INSERT OR REPLACE even when
-- SQLite recursive_triggers is OFF (its internal DELETE trigger may not run).
CREATE TRIGGER IF NOT EXISTS tag_run_v2_snapshot_policy_immutable
BEFORE UPDATE OF reward_policy_bps ON tag_run_v2_snapshots
WHEN NEW.reward_policy_bps!=OLD.reward_policy_bps
BEGIN SELECT RAISE(ABORT,'v2_snapshot_policy_immutable'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_policy_immutable
BEFORE UPDATE OF reward_policy_bps ON tag_run_v2_draws
WHEN NEW.reward_policy_bps!=OLD.reward_policy_bps
BEGIN SELECT RAISE(ABORT,'v2_draw_policy_immutable'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_snapshot_no_replace_policy
BEFORE INSERT ON tag_run_v2_snapshots
WHEN EXISTS (
  SELECT 1 FROM tag_run_v2_snapshots old
  WHERE (old.chat_id=NEW.chat_id AND old.day_key=NEW.day_key
    AND old.asset_key=NEW.asset_key)
    OR old.rowid=NEW.rowid
)
BEGIN SELECT RAISE(ABORT,'v2_snapshot_policy_replacement_forbidden'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_no_replace_policy
BEFORE INSERT ON tag_run_v2_draws
WHEN EXISTS (
  SELECT 1 FROM tag_run_v2_draws old
  WHERE (old.chat_id=NEW.chat_id AND old.day_key=NEW.day_key)
    OR old.rowid=NEW.rowid
)
BEGIN SELECT RAISE(ABORT,'v2_draw_policy_replacement_forbidden'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_legacy_snapshot_no_delete
BEFORE DELETE ON tag_run_v2_snapshots
WHEN OLD.reward_policy_bps=500
BEGIN SELECT RAISE(ABORT,'v2_legacy_snapshot_immutable'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_legacy_draw_no_delete
BEFORE DELETE ON tag_run_v2_draws
WHEN OLD.reward_policy_bps=500
BEGIN SELECT RAISE(ABORT,'v2_legacy_draw_immutable'); END;



-- UPDATE OR REPLACE can delete a colliding legacy row without firing DELETE
-- triggers when recursive_triggers is OFF. All evidence identity, including
-- writable rowid, is immutable regardless of current policy version.
CREATE TRIGGER IF NOT EXISTS tag_run_v2_snapshot_scope_immutable
BEFORE UPDATE ON tag_run_v2_snapshots
WHEN NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key
  OR NEW.asset_key!=OLD.asset_key OR NEW.rowid!=OLD.rowid
BEGIN SELECT RAISE(ABORT,'v2_snapshot_scope_immutable'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_scope_immutable
BEFORE UPDATE ON tag_run_v2_draws
WHEN NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key
  OR NEW.rowid!=OLD.rowid
BEGIN SELECT RAISE(ABORT,'v2_draw_scope_immutable'); END;



-- Persistent owner-reviewed draw lifecycle. No signer, flags or live funding.
-- Apply only after a private backup, offline rehearsal and explicit approval.
CREATE TABLE IF NOT EXISTS tag_run_v2_draw_workflows (
  chat_id TEXT NOT NULL, day_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'committed' CHECK(state IN ('committed','revealed','reviewed','rejected')),
  committed_by TEXT NOT NULL CHECK(length(committed_by)>0), reviewed_by TEXT,
  input_json TEXT NOT NULL CHECK(json_valid(input_json) AND length(CAST(input_json AS BLOB))<=900000
    AND json_type(input_json,'$.snapshots') IS 'array' AND json_array_length(input_json,'$.snapshots') BETWEEN 1 AND 100
    AND json_type(input_json,'$.participation') IS 'array' AND json_array_length(input_json,'$.participation')<=20000
    AND json_type(input_json,'$.deposits') IS 'array' AND json_array_length(input_json,'$.deposits')<=5000
    AND json_type(input_json,'$.outstanding') IS 'array' AND json_array_length(input_json,'$.outstanding')<=20000
    AND json_extract(input_json,'$.domain') IS 'tag-run-v2:persisted-draw:v1'
    AND json_extract(input_json,'$.chatId') IS chat_id AND json_extract(input_json,'$.day') IS day_key),
  inputs_digest TEXT NOT NULL CHECK(length(inputs_digest)=64 AND inputs_digest NOT GLOB '*[^0-9a-f]*'),
  seed_commitment TEXT NOT NULL CHECK(length(seed_commitment)=64 AND seed_commitment NOT GLOB '*[^0-9a-f]*'),
  observed_head INTEGER NOT NULL CHECK(typeof(observed_head)='integer' AND observed_head>0 AND observed_head<=4294967175),
  beacon_block INTEGER NOT NULL CHECK(typeof(beacon_block)='integer' AND beacon_block>=observed_head+120 AND beacon_block<=4294967295),
  commit_not_after INTEGER NOT NULL,
  seed_reveal TEXT, beacon_id TEXT,
  bundles_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(bundles_json) AND json_type(bundles_json) IS 'array' AND json_array_length(bundles_json)<=2000
    AND length(CAST(bundles_json AS BLOB))<=300000),
  debits_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(debits_json) AND json_type(debits_json) IS 'array' AND length(CAST(debits_json AS BLOB))<=300000),
  rejection_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id,day_key),
  FOREIGN KEY(chat_id,day_key) REFERENCES tag_run_v2_draws(chat_id,day_key)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS tag_run_v2_draw_weight_claims (
  chat_id TEXT NOT NULL, draw_day TEXT NOT NULL, source_day TEXT NOT NULL,
  telegram_id TEXT NOT NULL, units INTEGER NOT NULL CHECK(units BETWEEN 1 AND 510),
  prior_spent INTEGER NOT NULL CHECK(prior_spent>=0),
  earned_weight INTEGER NOT NULL CHECK(earned_weight BETWEEN 1 AND 510),
  source_receipts_digest TEXT NOT NULL,
  winning_asset_key TEXT NOT NULL, winning_bundle_index INTEGER NOT NULL,
  PRIMARY KEY(chat_id,draw_day,source_day,telegram_id),
  FOREIGN KEY(chat_id,draw_day) REFERENCES tag_run_v2_draw_workflows(chat_id,day_key),
  FOREIGN KEY(chat_id,source_day,telegram_id) REFERENCES tag_run_v2_participation(chat_id,day_key,telegram_id),
  FOREIGN KEY(chat_id,draw_day,winning_asset_key,winning_bundle_index)
    REFERENCES tag_run_v2_bundles(chat_id,day_key,asset_key,bundle_index)
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_insert_guard BEFORE INSERT ON tag_run_v2_draw_workflows BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows WHERE chat_id=NEW.chat_id AND day_key=NEW.day_key)
    OR NEW.state!='committed' OR NEW.reviewed_by IS NOT NULL OR NEW.seed_reveal IS NOT NULL OR NEW.beacon_id IS NOT NULL
    OR NEW.bundles_json!='[]' OR NEW.debits_json!='[]' OR NEW.rejection_reason IS NOT NULL
    OR typeof(NEW.commit_not_after)!='integer' OR unixepoch('now')>NEW.commit_not_after OR NEW.commit_not_after>unixepoch('now')+10
    THEN RAISE(ABORT,'v2_draw_invalid_initial_commit') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tag_run_v2_draws d WHERE d.chat_id=NEW.chat_id AND d.day_key=NEW.day_key
    AND d.status='preview_only' AND d.seed_reveal IS NULL AND d.reward_policy_bps=100
    AND d.seed_commitment=NEW.seed_commitment
    AND d.snapshots_digest=json_extract(NEW.input_json,'$.snapshotsDigest')
    AND d.weights_digest=json_extract(NEW.input_json,'$.weightsDigest')
    AND d.rules_digest=json_extract(NEW.input_json,'$.rulesDigest'))
    THEN RAISE(ABORT,'v2_draw_parent_mismatch') END;

  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tag_run_v2_capture_cursors c WHERE c.chat_id=NEW.chat_id AND c.last_completed_day_key>=NEW.day_key)
    THEN RAISE(ABORT,'v2_draw_capture_incomplete') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tag_run_v2_pool_config p
    WHERE p.config_id=1 AND p.wallet_account='isthatajoint' AND p.status='review_only'
      AND p.daily_bps=500 AND p.active_daily_bps=100 AND p.active_policy_version=2
      AND p.historical_ticket_bps=5000) THEN RAISE(ABORT,'v2_draw_pool_not_reviewed') END;
  SELECT CASE WHEN (SELECT count(*) FROM tag_run_v2_snapshots s WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key)
    !=json_array_length(NEW.input_json,'$.snapshots') OR EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.snapshots') j WHERE NOT EXISTS(
      SELECT 1 FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a ON a.asset_key=s.asset_key
      WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key
        AND s.asset_key=json_extract(j.value,'$.asset_key') AND s.status='verified'
        AND a.eligibility='approved' AND length(a.reviewed_by)>0 AND length(a.verified_at)>0
        AND s.reward_policy_bps=100 AND s.snapshot_digest=json_extract(j.value,'$.snapshot_digest')
        AND s.chain_irreversible_block=json_extract(j.value,'$.chain_irreversible_block')
        AND s.chain_block_id=json_extract(j.value,'$.chain_block_id')
        AND s.onchain_units=json_extract(j.value,'$.onchain_units')
        AND s.allocated_unpaid_units=json_extract(j.value,'$.allocated_unpaid_units')
        AND s.excluded_units=json_extract(j.value,'$.excluded_units')
        AND s.spendable_units=json_extract(j.value,'$.spendable_units')
        AND s.daily_reward_units=json_extract(j.value,'$.daily_reward_units')
        AND a.chain_id=json_extract(j.value,'$.chain_id')
        AND a.token_contract=json_extract(j.value,'$.token_contract')
        AND a.token_symbol=json_extract(j.value,'$.token_symbol')
        AND a.token_precision=json_extract(j.value,'$.token_precision')
    )) THEN RAISE(ABORT,'v2_draw_snapshot_changed') END;
  SELECT CASE WHEN (SELECT count(*) FROM tag_run_v2_participation p WHERE p.chat_id=NEW.chat_id AND p.day_key<=NEW.day_key)
    !=json_array_length(NEW.input_json,'$.participation') OR EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.participation') j WHERE NOT EXISTS(
      SELECT 1 FROM tag_run_v2_participation p WHERE p.chat_id=NEW.chat_id
        AND p.day_key=json_extract(j.value,'$.day_key') AND p.telegram_id=json_extract(j.value,'$.telegram_id')
        AND p.earned_weight=json_extract(j.value,'$.earned_weight')
        AND p.spent_historical_weight=json_extract(j.value,'$.spent_historical_weight')
        AND p.source_receipts_digest=json_extract(j.value,'$.source_receipts_digest')
    )) THEN RAISE(ABORT,'v2_draw_participation_changed') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.input_json,'$.deposits') j WHERE NOT EXISTS(
    SELECT 1 FROM tag_run_v2_deposits d WHERE d.chain_id=json_extract(j.value,'$.chain_id')
      AND d.global_action_seq=json_extract(j.value,'$.global_action_seq')
      AND d.asset_key=json_extract(j.value,'$.asset_key') AND d.units=json_extract(j.value,'$.units')
      AND d.block_num=json_extract(j.value,'$.block_num') AND d.block_id=json_extract(j.value,'$.block_id')
      AND d.transaction_id=json_extract(j.value,'$.transaction_id') AND d.memo_digest=json_extract(j.value,'$.memo_digest')
      AND d.recipient_account='isthatajoint' AND d.status='confirmed_donation'
      AND d.reviewed_at=json_extract(j.value,'$.reviewed_at')
  )) THEN RAISE(ABORT,'v2_draw_donation_revoked') END;
  SELECT CASE WHEN (SELECT count(*) FROM tag_run_v2_bundles b JOIN tag_run_v2_draws d
    ON d.chat_id=b.chat_id AND d.day_key=b.day_key LEFT JOIN tag_run_v2_payout_intents i
    ON i.chat_id=b.chat_id AND i.day_key=b.day_key AND i.asset_key=b.asset_key AND i.bundle_index=b.bundle_index
    WHERE d.status='reviewed' AND (i.status IS NULL OR i.status!='confirmed')
      AND b.asset_key IN (SELECT json_extract(value,'$.asset_key') FROM json_each(NEW.input_json,'$.snapshots')))
    !=json_array_length(NEW.input_json,'$.outstanding') OR EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.outstanding') j WHERE NOT EXISTS(
      SELECT 1 FROM tag_run_v2_bundles b JOIN tag_run_v2_draws d ON d.chat_id=b.chat_id AND d.day_key=b.day_key
      LEFT JOIN tag_run_v2_payout_intents i ON i.chat_id=b.chat_id AND i.day_key=b.day_key
        AND i.asset_key=b.asset_key AND i.bundle_index=b.bundle_index
      WHERE b.chat_id=json_extract(j.value,'$.chat_id') AND b.day_key=json_extract(j.value,'$.day_key')
        AND b.asset_key=json_extract(j.value,'$.asset_key') AND b.bundle_index=json_extract(j.value,'$.bundle_index')
        AND b.units=json_extract(j.value,'$.units') AND d.status='reviewed' AND (i.status IS NULL OR i.status!='confirmed')
    )) THEN RAISE(ABORT,'v2_draw_reservations_changed') END;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_update_guard BEFORE UPDATE ON tag_run_v2_draw_workflows BEGIN
  SELECT CASE WHEN NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key OR NEW.committed_by!=OLD.committed_by
    OR NEW.input_json!=OLD.input_json OR NEW.inputs_digest!=OLD.inputs_digest OR NEW.seed_commitment!=OLD.seed_commitment
    OR NEW.observed_head!=OLD.observed_head OR NEW.beacon_block!=OLD.beacon_block
    OR NEW.commit_not_after!=OLD.commit_not_after OR NEW.created_at!=OLD.created_at
    OR NOT ((OLD.state='committed' AND NEW.state='revealed') OR (OLD.state='revealed' AND NEW.state='reviewed')
      OR (OLD.state IN ('committed','revealed') AND NEW.state='rejected'))
    THEN RAISE(ABORT,'v2_draw_workflow_immutable') END;
  SELECT CASE WHEN NEW.state='revealed' AND (NEW.reviewed_by IS NOT NULL OR NEW.rejection_reason IS NOT NULL
    OR json_array_length(NEW.bundles_json)=0 OR NEW.seed_reveal IS NULL OR length(NEW.seed_reveal)!=64 OR NEW.seed_reveal GLOB '*[^0-9a-f]*'
    OR NEW.beacon_id IS NULL OR length(NEW.beacon_id)!=64 OR NEW.beacon_id GLOB '*[^0-9a-f]*')
    THEN RAISE(ABORT,'v2_draw_bad_reveal') END;
  SELECT CASE WHEN NEW.state IN ('reviewed','rejected') AND (NEW.seed_reveal IS NOT OLD.seed_reveal OR NEW.beacon_id IS NOT OLD.beacon_id
    OR NEW.bundles_json!=OLD.bundles_json OR NEW.debits_json!=OLD.debits_json OR length(NEW.reviewed_by)=0
    OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.committed_by
    OR (NEW.state='rejected' AND (NEW.rejection_reason IS NULL OR length(NEW.rejection_reason)=0))
    OR (NEW.state='reviewed' AND NEW.rejection_reason IS NOT NULL))
    THEN RAISE(ABORT,'v2_draw_independent_review_required') END;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_source_guard BEFORE UPDATE ON tag_run_v2_draw_workflows
WHEN NEW.state IN ('revealed','reviewed') BEGIN

  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tag_run_v2_capture_cursors c WHERE c.chat_id=NEW.chat_id AND c.last_completed_day_key>=NEW.day_key)
    THEN RAISE(ABORT,'v2_draw_capture_incomplete') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tag_run_v2_pool_config p
    WHERE p.config_id=1 AND p.wallet_account='isthatajoint' AND p.status='review_only'
      AND p.daily_bps=500 AND p.active_daily_bps=100 AND p.active_policy_version=2
      AND p.historical_ticket_bps=5000) THEN RAISE(ABORT,'v2_draw_pool_not_reviewed') END;
  SELECT CASE WHEN (SELECT count(*) FROM tag_run_v2_snapshots s WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key)
    !=json_array_length(NEW.input_json,'$.snapshots') OR EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.snapshots') j WHERE NOT EXISTS(
      SELECT 1 FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a ON a.asset_key=s.asset_key
      WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key
        AND s.asset_key=json_extract(j.value,'$.asset_key') AND s.status='verified'
        AND a.eligibility='approved' AND length(a.reviewed_by)>0 AND length(a.verified_at)>0
        AND s.reward_policy_bps=100 AND s.snapshot_digest=json_extract(j.value,'$.snapshot_digest')
        AND s.chain_irreversible_block=json_extract(j.value,'$.chain_irreversible_block')
        AND s.chain_block_id=json_extract(j.value,'$.chain_block_id')
        AND s.onchain_units=json_extract(j.value,'$.onchain_units')
        AND s.allocated_unpaid_units=json_extract(j.value,'$.allocated_unpaid_units')
        AND s.excluded_units=json_extract(j.value,'$.excluded_units')
        AND s.spendable_units=json_extract(j.value,'$.spendable_units')
        AND s.daily_reward_units=json_extract(j.value,'$.daily_reward_units')
        AND a.chain_id=json_extract(j.value,'$.chain_id')
        AND a.token_contract=json_extract(j.value,'$.token_contract')
        AND a.token_symbol=json_extract(j.value,'$.token_symbol')
        AND a.token_precision=json_extract(j.value,'$.token_precision')
    )) THEN RAISE(ABORT,'v2_draw_snapshot_changed') END;
  SELECT CASE WHEN (SELECT count(*) FROM tag_run_v2_participation p WHERE p.chat_id=NEW.chat_id AND p.day_key<=NEW.day_key)
    !=json_array_length(NEW.input_json,'$.participation') OR EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.participation') j WHERE NOT EXISTS(
      SELECT 1 FROM tag_run_v2_participation p WHERE p.chat_id=NEW.chat_id
        AND p.day_key=json_extract(j.value,'$.day_key') AND p.telegram_id=json_extract(j.value,'$.telegram_id')
        AND p.earned_weight=json_extract(j.value,'$.earned_weight')
        AND p.spent_historical_weight=json_extract(j.value,'$.spent_historical_weight')
        AND p.source_receipts_digest=json_extract(j.value,'$.source_receipts_digest')
    )) THEN RAISE(ABORT,'v2_draw_participation_changed') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.input_json,'$.deposits') j WHERE NOT EXISTS(
    SELECT 1 FROM tag_run_v2_deposits d WHERE d.chain_id=json_extract(j.value,'$.chain_id')
      AND d.global_action_seq=json_extract(j.value,'$.global_action_seq')
      AND d.asset_key=json_extract(j.value,'$.asset_key') AND d.units=json_extract(j.value,'$.units')
      AND d.block_num=json_extract(j.value,'$.block_num') AND d.block_id=json_extract(j.value,'$.block_id')
      AND d.transaction_id=json_extract(j.value,'$.transaction_id') AND d.memo_digest=json_extract(j.value,'$.memo_digest')
      AND d.recipient_account='isthatajoint' AND d.status='confirmed_donation'
      AND d.reviewed_at=json_extract(j.value,'$.reviewed_at')
  )) THEN RAISE(ABORT,'v2_draw_donation_revoked') END;
  SELECT CASE WHEN (SELECT count(*) FROM tag_run_v2_bundles b JOIN tag_run_v2_draws d
    ON d.chat_id=b.chat_id AND d.day_key=b.day_key LEFT JOIN tag_run_v2_payout_intents i
    ON i.chat_id=b.chat_id AND i.day_key=b.day_key AND i.asset_key=b.asset_key AND i.bundle_index=b.bundle_index
    WHERE d.status='reviewed' AND (i.status IS NULL OR i.status!='confirmed')
      AND b.asset_key IN (SELECT json_extract(value,'$.asset_key') FROM json_each(NEW.input_json,'$.snapshots')))
    !=json_array_length(NEW.input_json,'$.outstanding') OR EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.outstanding') j WHERE NOT EXISTS(
      SELECT 1 FROM tag_run_v2_bundles b JOIN tag_run_v2_draws d ON d.chat_id=b.chat_id AND d.day_key=b.day_key
      LEFT JOIN tag_run_v2_payout_intents i ON i.chat_id=b.chat_id AND i.day_key=b.day_key
        AND i.asset_key=b.asset_key AND i.bundle_index=b.bundle_index
      WHERE b.chat_id=json_extract(j.value,'$.chat_id') AND b.day_key=json_extract(j.value,'$.day_key')
        AND b.asset_key=json_extract(j.value,'$.asset_key') AND b.bundle_index=json_extract(j.value,'$.bundle_index')
        AND b.units=json_extract(j.value,'$.units') AND d.status='reviewed' AND (i.status IS NULL OR i.status!='confirmed')
    )) THEN RAISE(ABORT,'v2_draw_reservations_changed') END;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_no_delete BEFORE DELETE ON tag_run_v2_draw_workflows
BEGIN SELECT RAISE(ABORT,'v2_draw_workflow_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_reveal AFTER UPDATE ON tag_run_v2_draw_workflows WHEN NEW.state='revealed' BEGIN
  INSERT INTO tag_run_v2_bundles(chat_id,day_key,asset_key,bundle_index,telegram_id,ticket_class,units)
  SELECT NEW.chat_id,NEW.day_key,json_extract(value,'$.assetKey'),json_extract(value,'$.bundleIndex'),
    json_extract(value,'$.telegramId'),json_extract(value,'$.pool'),json_extract(value,'$.units')
    FROM json_each(NEW.bundles_json);
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_review AFTER UPDATE ON tag_run_v2_draw_workflows WHEN NEW.state='reviewed' BEGIN
  INSERT INTO tag_run_v2_draw_weight_claims(chat_id,draw_day,source_day,telegram_id,units,prior_spent,earned_weight,
    source_receipts_digest,winning_asset_key,winning_bundle_index)
  SELECT NEW.chat_id,NEW.day_key,json_extract(value,'$.sourceDay'),json_extract(value,'$.telegramId'),
    json_extract(value,'$.units'),json_extract(value,'$.priorSpent'),json_extract(value,'$.earnedWeight'),
    json_extract(value,'$.receiptDigest'),json_extract(value,'$.winningAssetKey'),json_extract(value,'$.winningBundleIndex')
    FROM json_each(NEW.debits_json);
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_claim_insert_guard BEFORE INSERT ON tag_run_v2_draw_weight_claims BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_weight_claims c WHERE c.chat_id=NEW.chat_id
    AND c.draw_day=NEW.draw_day AND c.source_day=NEW.source_day AND c.telegram_id=NEW.telegram_id)
    OR NOT EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w JOIN tag_run_v2_bundles b
    ON b.chat_id=w.chat_id AND b.day_key=w.day_key WHERE w.chat_id=NEW.chat_id AND w.day_key=NEW.draw_day
    AND w.state='reviewed' AND b.asset_key=NEW.winning_asset_key AND b.bundle_index=NEW.winning_bundle_index
    AND b.ticket_class='historical' AND b.telegram_id=NEW.telegram_id AND b.units!='0')
    OR NOT EXISTS(SELECT 1 FROM tag_run_v2_participation p WHERE p.chat_id=NEW.chat_id AND p.day_key=NEW.source_day
      AND p.telegram_id=NEW.telegram_id AND p.earned_weight=NEW.earned_weight
      AND p.spent_historical_weight=NEW.prior_spent AND p.source_receipts_digest=NEW.source_receipts_digest
      AND NEW.prior_spent+NEW.units<=p.earned_weight)
    OR NEW.source_day>=NEW.draw_day
    OR NEW.units+coalesce((SELECT sum(units) FROM tag_run_v2_draw_weight_claims c
      WHERE c.chat_id=NEW.chat_id AND c.draw_day=NEW.draw_day AND c.telegram_id=NEW.telegram_id),0)>510
    THEN RAISE(ABORT,'v2_draw_historical_claim_invalid') END;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_claim_apply AFTER INSERT ON tag_run_v2_draw_weight_claims BEGIN
  UPDATE tag_run_v2_participation SET spent_historical_weight=spent_historical_weight+NEW.units
    WHERE chat_id=NEW.chat_id AND day_key=NEW.source_day AND telegram_id=NEW.telegram_id;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_claim_no_update BEFORE UPDATE ON tag_run_v2_draw_weight_claims
BEGIN SELECT RAISE(ABORT,'v2_draw_claim_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_claim_no_delete BEFORE DELETE ON tag_run_v2_draw_weight_claims
BEGIN SELECT RAISE(ABORT,'v2_draw_claim_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_claimed_weight_guard BEFORE UPDATE ON tag_run_v2_participation
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_weight_claims c WHERE c.chat_id=OLD.chat_id AND c.source_day=OLD.day_key AND c.telegram_id=OLD.telegram_id)
AND (NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key OR NEW.telegram_id!=OLD.telegram_id OR NEW.earned_weight!=OLD.earned_weight
  OR NEW.source_receipts_digest!=OLD.source_receipts_digest OR NEW.spent_historical_weight<
  (SELECT max(prior_spent+units) FROM tag_run_v2_draw_weight_claims c WHERE c.chat_id=OLD.chat_id AND c.source_day=OLD.day_key AND c.telegram_id=OLD.telegram_id))
BEGIN SELECT RAISE(ABORT,'v2_draw_claimed_source_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_claimed_weight_no_delete BEFORE DELETE ON tag_run_v2_participation
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_weight_claims c WHERE c.chat_id=OLD.chat_id AND c.source_day=OLD.day_key AND c.telegram_id=OLD.telegram_id)
BEGIN SELECT RAISE(ABORT,'v2_draw_claimed_source_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_managed_draw_update BEFORE UPDATE ON tag_run_v2_draws
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key) BEGIN
  SELECT CASE WHEN NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key OR NEW.seed_commitment!=OLD.seed_commitment
    OR NEW.rules_digest!=OLD.rules_digest OR NEW.weights_digest!=OLD.weights_digest OR NEW.snapshots_digest!=OLD.snapshots_digest
    OR NEW.reward_policy_bps!=OLD.reward_policy_bps OR NEW.created_at!=OLD.created_at
    OR NOT EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key
      AND ((w.state='revealed' AND NEW.status='preview_only' AND OLD.seed_reveal IS NULL AND NEW.seed_reveal=w.seed_reveal AND NEW.reviewed_by IS NULL)
        OR (w.state='reviewed' AND OLD.status='preview_only' AND NEW.status='reviewed' AND NEW.seed_reveal=OLD.seed_reveal AND NEW.reviewed_by=w.reviewed_by)
        OR (w.state='rejected' AND OLD.status='preview_only' AND NEW.status='rejected' AND NEW.seed_reveal IS OLD.seed_reveal AND NEW.reviewed_by=w.reviewed_by)))
    THEN RAISE(ABORT,'v2_managed_draw_immutable') END;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_managed_draw_no_delete BEFORE DELETE ON tag_run_v2_draws
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key)
BEGIN SELECT RAISE(ABORT,'v2_managed_draw_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_managed_draw_no_replace BEFORE INSERT ON tag_run_v2_draws
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE w.chat_id=NEW.chat_id AND w.day_key=NEW.day_key)
BEGIN SELECT RAISE(ABORT,'v2_managed_draw_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_managed_bundle_insert BEFORE INSERT ON tag_run_v2_bundles
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE w.chat_id=NEW.chat_id AND w.day_key=NEW.day_key) BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM tag_run_v2_bundles b WHERE b.chat_id=NEW.chat_id AND b.day_key=NEW.day_key
    AND b.asset_key=NEW.asset_key AND b.bundle_index=NEW.bundle_index) OR NOT EXISTS(
    SELECT 1 FROM tag_run_v2_draw_workflows w,json_each(w.bundles_json) j
    WHERE w.chat_id=NEW.chat_id AND w.day_key=NEW.day_key AND w.state='revealed'
      AND json_extract(j.value,'$.assetKey')=NEW.asset_key AND json_extract(j.value,'$.bundleIndex')=NEW.bundle_index
      AND json_extract(j.value,'$.telegramId')=NEW.telegram_id AND json_extract(j.value,'$.pool')=NEW.ticket_class
      AND json_extract(j.value,'$.units')=NEW.units)
    THEN RAISE(ABORT,'v2_managed_bundle_invalid') END;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_managed_bundle_no_update BEFORE UPDATE ON tag_run_v2_bundles
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE (w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key)
  OR (w.chat_id=NEW.chat_id AND w.day_key=NEW.day_key))
BEGIN SELECT RAISE(ABORT,'v2_managed_bundle_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_managed_bundle_no_delete BEFORE DELETE ON tag_run_v2_bundles
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key)
BEGIN SELECT RAISE(ABORT,'v2_managed_bundle_immutable'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_claimed_weight_no_replace BEFORE INSERT ON tag_run_v2_participation
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_weight_claims c WHERE c.chat_id=NEW.chat_id AND c.source_day=NEW.day_key AND c.telegram_id=NEW.telegram_id)
BEGIN SELECT RAISE(ABORT,'v2_draw_claimed_source_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_committed_snapshot_no_delete BEFORE DELETE ON tag_run_v2_snapshots
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w,json_each(w.input_json,'$.snapshots') j
  WHERE w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key AND json_extract(j.value,'$.asset_key')=OLD.asset_key)
BEGIN SELECT RAISE(ABORT,'v2_committed_snapshot_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_committed_snapshot_no_replace BEFORE INSERT ON tag_run_v2_snapshots
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w,json_each(w.input_json,'$.snapshots') j
  WHERE w.chat_id=NEW.chat_id AND w.day_key=NEW.day_key AND json_extract(j.value,'$.asset_key')=NEW.asset_key)
BEGIN SELECT RAISE(ABORT,'v2_committed_snapshot_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_committed_snapshot_update BEFORE UPDATE ON tag_run_v2_snapshots
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w,json_each(w.input_json,'$.snapshots') j
  WHERE w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key AND json_extract(j.value,'$.asset_key')=OLD.asset_key)
AND (NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key OR NEW.asset_key!=OLD.asset_key
  OR NEW.wallet_account!=OLD.wallet_account OR NEW.chain_irreversible_block!=OLD.chain_irreversible_block
  OR NEW.chain_block_id!=OLD.chain_block_id OR NEW.onchain_units!=OLD.onchain_units
  OR NEW.allocated_unpaid_units!=OLD.allocated_unpaid_units OR NEW.excluded_units!=OLD.excluded_units
  OR NEW.spendable_units!=OLD.spendable_units OR NEW.daily_reward_units!=OLD.daily_reward_units
  OR NEW.reward_policy_bps!=OLD.reward_policy_bps OR NEW.snapshot_digest!=OLD.snapshot_digest)
BEGIN SELECT RAISE(ABORT,'v2_committed_snapshot_immutable'); END;

CREATE INDEX IF NOT EXISTS tag_run_v2_weight_claim_source ON tag_run_v2_draw_weight_claims(chat_id,source_day,telegram_id);
CREATE INDEX IF NOT EXISTS tag_run_v2_bundle_asset_journal ON tag_run_v2_bundles(asset_key,chat_id,day_key,bundle_index);


-- TAG RUN V2 automatic payout custody and contract pinning.
-- Apply only after a production D1 backup and rehearsal. The Worker remains
-- fail-closed until its separate automation flags and encrypted secrets exist.
ALTER TABLE tag_run_v2_assets
  ADD COLUMN approved_code_hash TEXT;
ALTER TABLE tag_run_v2_assets
  ADD COLUMN approved_abi_hash TEXT;

ALTER TABLE tag_run_v2_payout_intents
  ADD COLUMN submission_tx_id TEXT;
ALTER TABLE tag_run_v2_payout_intents
  ADD COLUMN signed_transaction_json TEXT;
ALTER TABLE tag_run_v2_payout_intents
  ADD COLUMN reconcile_after TEXT;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_asset_contract_pin_guard
BEFORE UPDATE ON tag_run_v2_assets
WHEN NEW.eligibility='approved' AND (
  NEW.approved_code_hash IS NULL
  OR length(NEW.approved_code_hash)!=64
  OR NEW.approved_code_hash GLOB '*[^0-9a-f]*'
  OR NEW.approved_abi_hash IS NULL
  OR length(NEW.approved_abi_hash)!=64
  OR NEW.approved_abi_hash GLOB '*[^0-9a-f]*'
)
BEGIN SELECT RAISE(ABORT,'v2_asset_contract_pin_required'); END;

DROP TRIGGER IF EXISTS tag_run_v2_payout_intent_update_guard;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_intent_update_guard
BEFORE UPDATE ON tag_run_v2_payout_intents
WHEN NEW.intent_key!=OLD.intent_key OR NEW.chat_id!=OLD.chat_id
 OR NEW.day_key!=OLD.day_key OR NEW.asset_key!=OLD.asset_key
 OR NEW.bundle_index!=OLD.bundle_index OR NEW.telegram_id!=OLD.telegram_id
 OR NEW.receiving_account!=OLD.receiving_account OR NEW.amount_units!=OLD.amount_units
 OR NEW.snapshot_digest!=OLD.snapshot_digest
 OR NEW.authorization_digest!=OLD.authorization_digest
 OR NEW.approved_by!=OLD.approved_by
 OR NOT (
    (OLD.status='reserved' AND NEW.status='broadcast_unknown')
 OR (OLD.status='broadcast_unknown' AND NEW.status IN ('confirmed','reconciliation_review'))
 OR (OLD.status='reconciliation_review' AND NEW.status='confirmed')
 OR (OLD.status=NEW.status AND OLD.signed_tx_id IS NEW.signed_tx_id)
 )
 OR (
   NEW.status='broadcast_unknown' AND NOT (
     (NEW.submission_tx_id IS NULL AND NEW.signed_transaction_json IS NULL)
     OR (
       NEW.submission_tx_id IS NOT NULL
       AND length(NEW.submission_tx_id)=64
       AND NEW.submission_tx_id NOT GLOB '*[^0-9a-f]*'
       AND NEW.signed_transaction_json IS NOT NULL
       AND json_valid(NEW.signed_transaction_json)
       AND length(CAST(NEW.signed_transaction_json AS BLOB)) BETWEEN 100 AND 20000
     )
   )
 )
 OR (NEW.status='confirmed' AND (
      NEW.signed_tx_id IS NULL
      OR length(NEW.signed_tx_id)!=64
      OR NEW.signed_tx_id GLOB '*[^0-9a-f]*'
      OR (NEW.submission_tx_id IS NOT NULL
          AND NEW.signed_tx_id!=NEW.submission_tx_id)
 ))
 OR (OLD.signed_tx_id IS NOT NULL AND NEW.signed_tx_id IS NOT OLD.signed_tx_id)
 OR (OLD.submission_tx_id IS NOT NULL
     AND NEW.submission_tx_id IS NOT OLD.submission_tx_id)
 OR (OLD.signed_transaction_json IS NOT NULL
     AND NEW.signed_transaction_json IS NOT OLD.signed_transaction_json)
BEGIN SELECT RAISE(ABORT,'v2_payout_intent_immutable'); END;

CREATE INDEX IF NOT EXISTS tag_run_v2_payout_submission_tx
ON tag_run_v2_payout_intents(submission_tx_id);

CREATE INDEX IF NOT EXISTS tag_run_v2_payout_reconcile_queue
ON tag_run_v2_payout_intents(status,reconcile_after,updated_at);

-- This is the durable policy-state transition only. Runtime automation still
-- fails closed until all release flags and both Worker secrets are present.
UPDATE tag_run_v2_pool_config
SET status='review_only',revision=revision+1,updated_at=CURRENT_TIMESTAMP
WHERE config_id=1 AND wallet_account='isthatajoint' AND status='paused'
  AND daily_bps=500 AND active_daily_bps=100
  AND active_policy_version=2 AND historical_ticket_bps=5000;
