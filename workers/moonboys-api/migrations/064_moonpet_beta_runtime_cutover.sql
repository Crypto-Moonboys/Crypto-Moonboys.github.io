-- Moonpet beta runtime cutover.
--
-- This intentionally discards only replayable beta gameplay state. Account,
-- authentication, Telegram linking, pet ownership/lifecycle, Sanctuary, season
-- completion, cosmetic ownership, and Arcade XP wallet rows are not touched.
-- No pet_id constraint or trigger is installed here: each bounded writer group
-- must complete its own pet_id conversion before enforcement is introduced.

CREATE TABLE IF NOT EXISTS telegram_pet_runtime_cutovers (
  cutover_key TEXT PRIMARY KEY,
  policy_version INTEGER NOT NULL,
  reason TEXT NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Children and settlement ledgers precede their parent runtime rows.
DELETE FROM telegram_pet_arena_rounds;
DELETE FROM telegram_pet_arena_battles;
DELETE FROM telegram_pet_arena_queue;
DELETE FROM telegram_pet_kaiju_queue;
DELETE FROM telegram_pet_kaiju_matches;

DELETE FROM telegram_pet_daily_challenge_events;
DELETE FROM telegram_pet_daily_challenge_progress;
DELETE FROM telegram_pet_daily_leaderboard_records;
DELETE FROM telegram_pet_daily_analytics;
DELETE FROM telegram_pet_daily_runs;
DELETE FROM telegram_pet_seasonal_achievements;
DELETE FROM telegram_pet_seasonal_challenge_state;

DELETE FROM telegram_pet_run_analytics;
DELETE FROM telegram_pet_run_history;
DELETE FROM telegram_pet_run_modifiers;
DELETE FROM telegram_pet_run_rooms;
DELETE FROM telegram_pet_relics;
DELETE FROM telegram_pet_run_steps;
DELETE FROM telegram_pet_reward_assets;
DELETE FROM telegram_pet_reward_claims;
DELETE FROM telegram_pet_runs;

DELETE FROM telegram_pet_equipment_events;
DELETE FROM telegram_pet_equipment_progression;
DELETE FROM telegram_pet_activity_sessions;
DELETE FROM telegram_pet_effects;
DELETE FROM telegram_pet_repeat_reward_slots;
DELETE FROM telegram_pet_inventory_legacy_sync_042;
DELETE FROM telegram_pet_inventory;
DELETE FROM telegram_pet_runtime_events;
DELETE FROM telegram_pet_material_balances;
DELETE FROM telegram_pet_progression_state;
DELETE FROM telegram_pet_events;
DELETE FROM telegram_pet_mission_completions;
DELETE FROM telegram_pet_season_state;

DELETE FROM telegram_pet_weekly_boss_events;
DELETE FROM telegram_pet_weekly_boss_progress;
DELETE FROM telegram_pet_season_reward_claims;
DELETE FROM telegram_pet_boss_victories;
DELETE FROM telegram_pet_identity_analytics;
DELETE FROM telegram_pet_identity_events;
DELETE FROM telegram_pet_memories;
DELETE FROM telegram_pet_personality_traits;
DELETE FROM telegram_pet_achievements;
DELETE FROM telegram_pet_dialogue_history;
DELETE FROM telegram_pet_guidance_notices;
DELETE FROM telegram_pet_system_events;
DELETE FROM telegram_pet_event_chain_progress;
DELETE FROM telegram_pet_seasonal_boss_progress;

-- The legacy profile mixes durable naming/identity with owner-scoped runtime.
-- Keep pet_name/species/stage and the row itself, but clear gameplay fields so
-- they cannot be mistaken for pet-instance authority after the boundary.
UPDATE telegram_pet_profiles SET
  pet_xp = 0,
  level = 1,
  hunger = 25,
  happiness = 70,
  cleanliness = 70,
  energy = 70,
  health = 75,
  streak_days = 0,
  moon_gold = 0,
  moon_crystals = 0,
  style_tokens = 0,
  equipped_food = NULL,
  equipped_toy = NULL,
  equipped_outfit = NULL,
  equipped_armor = NULL,
  equipped_weapon = NULL,
  equipped_charm = NULL,
  last_active_day = NULL,
  last_decay_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP;

-- Pet instance rows are retained as ownership/season-slot evidence, but the
-- runtime fields copied during the beta mirror era must also be cleared. Without
-- this, later active-slot switching or Sanctuary reconciliation can restore the
-- unsafe beta balances/equipment back into the account profile.
UPDATE telegram_pet_instances SET
  pet_xp = 0,
  level = 1,
  hunger = 25,
  happiness = 70,
  cleanliness = 70,
  energy = 70,
  health = 75,
  streak_days = 0,
  moon_gold = 0,
  moon_crystals = 0,
  style_tokens = 0,
  equipped_food = NULL,
  equipped_toy = NULL,
  equipped_outfit = NULL,
  equipped_armor = NULL,
  equipped_weapon = NULL,
  equipped_charm = NULL,
  last_active_day = NULL,
  last_decay_at = CURRENT_TIMESTAMP,
  source_profile_updated_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO telegram_pet_runtime_cutovers
  (cutover_key, policy_version, reason)
VALUES
  ('moonpet-beta-pet-id-2026-08', 1, 'Discard unsafe beta runtime before bounded pet_id writer conversions');
