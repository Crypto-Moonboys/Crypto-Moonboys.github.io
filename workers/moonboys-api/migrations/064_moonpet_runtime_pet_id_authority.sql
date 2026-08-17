-- Immutable Moonpet gameplay authority.
-- Existing account-only records remain readable; every insert after this migration
-- must name the participating pet. No historical row is backfilled from today's
-- active selector because that would manufacture ownership evidence.

ALTER TABLE telegram_pet_activity_sessions ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_runs ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_run_steps ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_daily_runs ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_weekly_boss_progress ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_weekly_boss_events ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_season_reward_claims ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_arena_queue ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_arena_battles ADD COLUMN player1_pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_arena_battles ADD COLUMN player2_pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_kaiju_queue ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_kaiju_matches ADD COLUMN player1_pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_kaiju_matches ADD COLUMN player2_pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_reward_claims ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_reward_assets ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_events ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_identity_events RENAME TO telegram_pet_identity_events_legacy_064;
CREATE TABLE telegram_pet_identity_events (
  event_id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, pet_id TEXT, event_key TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK(event_kind IN ('personality','memory')), payload TEXT NOT NULL DEFAULT '{}',
  day_key TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d','now')), progress_delta INTEGER NOT NULL DEFAULT 0 CHECK(progress_delta>=0),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, applied_at DATETIME,
  FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id)
);
INSERT INTO telegram_pet_identity_events(event_id,telegram_id,event_key,event_kind,payload,day_key,progress_delta,created_at,applied_at)
SELECT event_id,telegram_id,event_key,event_kind,payload,day_key,progress_delta,created_at,applied_at FROM telegram_pet_identity_events_legacy_064;
CREATE UNIQUE INDEX uq_pet_identity_event_authority ON telegram_pet_identity_events(pet_id,event_key,event_kind) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_identity_event_owner ON telegram_pet_identity_events(telegram_id,event_key,event_kind) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_identity_events_legacy_064;
ALTER TABLE telegram_pet_identity_analytics ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_personality_traits RENAME TO telegram_pet_personality_traits_legacy_064;
CREATE TABLE telegram_pet_personality_traits (
  pet_id TEXT, telegram_id TEXT NOT NULL, trait_id TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0 CHECK(progress>=0),
  unlocked_at DATETIME, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id), FOREIGN KEY(telegram_id) REFERENCES telegram_pet_profiles(telegram_id)
);
INSERT INTO telegram_pet_personality_traits(telegram_id,trait_id,progress,unlocked_at,updated_at)
SELECT telegram_id,trait_id,progress,unlocked_at,updated_at FROM telegram_pet_personality_traits_legacy_064;
CREATE UNIQUE INDEX uq_pet_personality_authority ON telegram_pet_personality_traits(pet_id,trait_id) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_personality_owner ON telegram_pet_personality_traits(telegram_id,trait_id) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_personality_traits_legacy_064;

ALTER TABLE telegram_pet_memories RENAME TO telegram_pet_memories_legacy_064;
CREATE TABLE telegram_pet_memories (
  pet_id TEXT, telegram_id TEXT NOT NULL, first_adoption_at DATETIME, first_run_at DATETIME, first_extraction_at DATETIME,
  first_boss_victory_at DATETIME, first_boss_id TEXT, biggest_reward_amount INTEGER NOT NULL DEFAULT 0 CHECK(biggest_reward_amount>=0),
  biggest_reward_currency TEXT, favourite_activity TEXT, total_runs INTEGER NOT NULL DEFAULT 0 CHECK(total_runs>=0),
  total_bosses_defeated INTEGER NOT NULL DEFAULT 0 CHECK(total_bosses_defeated>=0), milestones TEXT NOT NULL DEFAULT '[]',
  combat_actions INTEGER NOT NULL DEFAULT 0 CHECK(combat_actions>=0), exploration_actions INTEGER NOT NULL DEFAULT 0 CHECK(exploration_actions>=0),
  care_actions INTEGER NOT NULL DEFAULT 0 CHECK(care_actions>=0), event_actions INTEGER NOT NULL DEFAULT 0 CHECK(event_actions>=0),
  adventure_actions INTEGER NOT NULL DEFAULT 0 CHECK(adventure_actions>=0), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id)
);
INSERT INTO telegram_pet_memories(telegram_id,first_adoption_at,first_run_at,first_extraction_at,first_boss_victory_at,first_boss_id,biggest_reward_amount,biggest_reward_currency,favourite_activity,total_runs,total_bosses_defeated,milestones,combat_actions,exploration_actions,care_actions,event_actions,adventure_actions,created_at,updated_at)
SELECT telegram_id,first_adoption_at,first_run_at,first_extraction_at,first_boss_victory_at,first_boss_id,biggest_reward_amount,biggest_reward_currency,favourite_activity,total_runs,total_bosses_defeated,milestones,combat_actions,exploration_actions,care_actions,event_actions,adventure_actions,created_at,updated_at FROM telegram_pet_memories_legacy_064;
CREATE UNIQUE INDEX uq_pet_memories_authority ON telegram_pet_memories(pet_id) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_memories_owner ON telegram_pet_memories(telegram_id) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_memories_legacy_064;

ALTER TABLE telegram_pet_boss_victories RENAME TO telegram_pet_boss_victories_legacy_064;
CREATE TABLE telegram_pet_boss_victories (pet_id TEXT, telegram_id TEXT NOT NULL, boss_id TEXT NOT NULL, victories INTEGER NOT NULL DEFAULT 0 CHECK(victories>=0), updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id));
INSERT INTO telegram_pet_boss_victories(telegram_id,boss_id,victories,updated_at) SELECT telegram_id,boss_id,victories,updated_at FROM telegram_pet_boss_victories_legacy_064;
CREATE UNIQUE INDEX uq_pet_boss_victories_authority ON telegram_pet_boss_victories(pet_id,boss_id) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_boss_victories_owner ON telegram_pet_boss_victories(telegram_id,boss_id) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_boss_victories_legacy_064;
ALTER TABLE telegram_pet_run_history RENAME TO telegram_pet_run_history_legacy_064;
CREATE TABLE telegram_pet_run_history (
  telegram_id TEXT NOT NULL, pet_id TEXT, runs_completed INTEGER NOT NULL DEFAULT 0 CHECK(runs_completed>=0),
  bosses_defeated INTEGER NOT NULL DEFAULT 0 CHECK(bosses_defeated>=0), highest_room_reached INTEGER NOT NULL DEFAULT 0 CHECK(highest_room_reached>=0),
  best_score INTEGER NOT NULL DEFAULT 0 CHECK(best_score>=0), fastest_completion_seconds INTEGER, rare_discoveries TEXT NOT NULL DEFAULT '[]',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id)
);
INSERT INTO telegram_pet_run_history(telegram_id,runs_completed,bosses_defeated,highest_room_reached,best_score,fastest_completion_seconds,rare_discoveries,updated_at)
SELECT telegram_id,runs_completed,bosses_defeated,highest_room_reached,best_score,fastest_completion_seconds,rare_discoveries,updated_at FROM telegram_pet_run_history_legacy_064;
CREATE UNIQUE INDEX uq_pet_run_history_authority ON telegram_pet_run_history(pet_id) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_run_history_owner ON telegram_pet_run_history(telegram_id) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_run_history_legacy_064;
ALTER TABLE telegram_pet_run_analytics ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_daily_analytics ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_run_rooms ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);

CREATE INDEX idx_pet_activity_pet ON telegram_pet_activity_sessions(pet_id, status, started_at DESC);
CREATE INDEX idx_pet_runs_pet ON telegram_pet_runs(pet_id, status, updated_at DESC);
CREATE INDEX idx_pet_daily_runs_pet ON telegram_pet_daily_runs(pet_id, utc_day DESC);
CREATE INDEX idx_pet_reward_claims_pet ON telegram_pet_reward_claims(pet_id, created_at DESC);
CREATE INDEX idx_pet_identity_events_pet ON telegram_pet_identity_events(pet_id, created_at DESC);
CREATE INDEX idx_pet_personality_pet ON telegram_pet_personality_traits(pet_id, trait_id);
CREATE INDEX idx_pet_memories_pet ON telegram_pet_memories(pet_id);
CREATE INDEX idx_pet_boss_victories_pet ON telegram_pet_boss_victories(pet_id, boss_id);

-- Compatibility views deliberately expose legacy NULL ownership. Readers can
-- display those rows, but may not treat the current selector as their owner.
CREATE VIEW telegram_pet_activity_sessions_compatible AS SELECT * FROM telegram_pet_activity_sessions;
CREATE VIEW telegram_pet_daily_runs_compatible AS SELECT * FROM telegram_pet_daily_runs;

CREATE TABLE telegram_pet_reward_authority (
  claim_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  source TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, source, idempotency_key),
  FOREIGN KEY (claim_id) REFERENCES telegram_pet_reward_claims(claim_id) ON DELETE CASCADE,
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id)
);
CREATE INDEX idx_pet_reward_authority_owner ON telegram_pet_reward_authority(telegram_id, pet_id, created_at DESC);


-- Phase 5 progression and live-system state were also account keyed. Rebuild the
-- two tables whose legacy primary/unique keys would otherwise collapse distinct
-- pets; retain all historical rows with NULL authority.
ALTER TABLE telegram_pet_progression_state RENAME TO telegram_pet_progression_state_legacy_064;
CREATE TABLE telegram_pet_progression_state (
  telegram_id TEXT NOT NULL, pet_id TEXT, care_xp INTEGER NOT NULL DEFAULT 0, training_xp INTEGER NOT NULL DEFAULT 0,
  adventure_xp INTEGER NOT NULL DEFAULT 0, arena_xp INTEGER NOT NULL DEFAULT 0, job_xp INTEGER NOT NULL DEFAULT 0, bond_xp INTEGER NOT NULL DEFAULT 0,
  daily_key TEXT NOT NULL DEFAULT '', care_daily INTEGER NOT NULL DEFAULT 0, training_daily INTEGER NOT NULL DEFAULT 0,
  adventure_daily INTEGER NOT NULL DEFAULT 0, arena_daily INTEGER NOT NULL DEFAULT 0, job_daily INTEGER NOT NULL DEFAULT 0, bond_daily INTEGER NOT NULL DEFAULT 0,
  traits_json TEXT NOT NULL DEFAULT '{}', region_mastery_json TEXT NOT NULL DEFAULT '{}', completed_regions_json TEXT NOT NULL DEFAULT '[]',
  event_chains_json TEXT NOT NULL DEFAULT '{}', prestige_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id)
);
INSERT INTO telegram_pet_progression_state(telegram_id,care_xp,training_xp,adventure_xp,arena_xp,job_xp,bond_xp,daily_key,care_daily,training_daily,adventure_daily,arena_daily,job_daily,bond_daily,traits_json,region_mastery_json,completed_regions_json,event_chains_json,prestige_count,created_at,updated_at)
SELECT telegram_id,care_xp,training_xp,adventure_xp,arena_xp,job_xp,bond_xp,daily_key,care_daily,training_daily,adventure_daily,arena_daily,job_daily,bond_daily,traits_json,region_mastery_json,completed_regions_json,event_chains_json,prestige_count,created_at,updated_at FROM telegram_pet_progression_state_legacy_064;
CREATE UNIQUE INDEX uq_pet_progression_authority ON telegram_pet_progression_state(pet_id) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_progression_owner ON telegram_pet_progression_state(telegram_id) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_progression_state_legacy_064;

ALTER TABLE telegram_pet_runtime_events RENAME TO telegram_pet_runtime_events_legacy_064;
CREATE TABLE telegram_pet_runtime_events (id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, pet_id TEXT, event_key TEXT NOT NULL, action TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id));
INSERT INTO telegram_pet_runtime_events(id,telegram_id,event_key,action,payload_json,created_at) SELECT id,telegram_id,event_key,action,payload_json,created_at FROM telegram_pet_runtime_events_legacy_064;
CREATE UNIQUE INDEX uq_pet_runtime_event_authority ON telegram_pet_runtime_events(pet_id,event_key) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_runtime_event_owner ON telegram_pet_runtime_events(telegram_id,event_key) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_runtime_events_legacy_064;

ALTER TABLE telegram_pet_system_events RENAME TO telegram_pet_system_events_legacy_064;
CREATE TABLE telegram_pet_system_events (id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, pet_id TEXT, system_key TEXT NOT NULL, action_key TEXT NOT NULL, period_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','settling','completed','rejected')), payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id));
INSERT INTO telegram_pet_system_events(id,telegram_id,system_key,action_key,period_key,status,payload_json,created_at,updated_at) SELECT id,telegram_id,system_key,action_key,period_key,status,payload_json,created_at,updated_at FROM telegram_pet_system_events_legacy_064;
CREATE UNIQUE INDEX uq_pet_system_event_authority ON telegram_pet_system_events(pet_id,system_key,action_key,period_key) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_system_event_owner ON telegram_pet_system_events(telegram_id,system_key,action_key,period_key) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_system_events_legacy_064;

ALTER TABLE telegram_pet_event_chain_progress RENAME TO telegram_pet_event_chain_progress_legacy_064;
CREATE TABLE telegram_pet_event_chain_progress (telegram_id TEXT NOT NULL, pet_id TEXT, chain_key TEXT NOT NULL, step_index INTEGER NOT NULL DEFAULT 0, completed_cycles INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id));
INSERT INTO telegram_pet_event_chain_progress(telegram_id,chain_key,step_index,completed_cycles,updated_at) SELECT telegram_id,chain_key,step_index,completed_cycles,updated_at FROM telegram_pet_event_chain_progress_legacy_064;
CREATE UNIQUE INDEX uq_pet_event_chain_authority ON telegram_pet_event_chain_progress(pet_id,chain_key) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_event_chain_owner ON telegram_pet_event_chain_progress(telegram_id,chain_key) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_event_chain_progress_legacy_064;

ALTER TABLE telegram_pet_seasonal_boss_progress RENAME TO telegram_pet_seasonal_boss_progress_legacy_064;
CREATE TABLE telegram_pet_seasonal_boss_progress (telegram_id TEXT NOT NULL, pet_id TEXT, season_key TEXT NOT NULL, boss_key TEXT NOT NULL, damage INTEGER NOT NULL DEFAULT 0, defeated_at TEXT, reward_claimed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id));
INSERT INTO telegram_pet_seasonal_boss_progress(telegram_id,season_key,boss_key,damage,defeated_at,reward_claimed_at,updated_at) SELECT telegram_id,season_key,boss_key,damage,defeated_at,reward_claimed_at,updated_at FROM telegram_pet_seasonal_boss_progress_legacy_064;
CREATE UNIQUE INDEX uq_pet_seasonal_boss_authority ON telegram_pet_seasonal_boss_progress(pet_id,season_key,boss_key) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_seasonal_boss_owner ON telegram_pet_seasonal_boss_progress(telegram_id,season_key,boss_key) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_seasonal_boss_progress_legacy_064;

ALTER TABLE telegram_pet_cosmetic_unlocks RENAME TO telegram_pet_cosmetic_unlocks_legacy_064;
CREATE TABLE telegram_pet_cosmetic_unlocks (telegram_id TEXT NOT NULL, pet_id TEXT, cosmetic_key TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id));
INSERT INTO telegram_pet_cosmetic_unlocks(telegram_id,cosmetic_key,quantity,unlocked_at,updated_at) SELECT telegram_id,cosmetic_key,quantity,unlocked_at,updated_at FROM telegram_pet_cosmetic_unlocks_legacy_064;
CREATE UNIQUE INDEX uq_pet_cosmetic_authority ON telegram_pet_cosmetic_unlocks(pet_id,cosmetic_key) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_cosmetic_owner ON telegram_pet_cosmetic_unlocks(telegram_id,cosmetic_key) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_cosmetic_unlocks_legacy_064;

ALTER TABLE telegram_pet_equipment_events RENAME TO telegram_pet_equipment_events_legacy_064;
ALTER TABLE telegram_pet_equipment_progression RENAME TO telegram_pet_equipment_progression_legacy_064;
CREATE TABLE telegram_pet_equipment_progression (
  telegram_id TEXT NOT NULL, pet_id TEXT, item_key TEXT NOT NULL, slot TEXT NOT NULL, item_level INTEGER NOT NULL DEFAULT 1 CHECK(item_level BETWEEN 1 AND 10),
  item_xp INTEGER NOT NULL DEFAULT 0, mastery_xp INTEGER NOT NULL DEFAULT 0, mastery_tier INTEGER NOT NULL DEFAULT 0 CHECK(mastery_tier BETWEEN 0 AND 5),
  unlocked_effects_json TEXT NOT NULL DEFAULT '{}', last_used_action TEXT, last_used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id)
);
INSERT INTO telegram_pet_equipment_progression(telegram_id,item_key,slot,item_level,item_xp,mastery_xp,mastery_tier,unlocked_effects_json,last_used_action,last_used_at,created_at,updated_at)
SELECT telegram_id,item_key,slot,item_level,item_xp,mastery_xp,mastery_tier,unlocked_effects_json,last_used_action,last_used_at,created_at,updated_at FROM telegram_pet_equipment_progression_legacy_064;
CREATE UNIQUE INDEX uq_pet_equipment_authority ON telegram_pet_equipment_progression(pet_id,item_key) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_equipment_owner ON telegram_pet_equipment_progression(telegram_id,item_key) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_equipment_progression_legacy_064;
CREATE TABLE telegram_pet_equipment_events (id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, pet_id TEXT, item_key TEXT NOT NULL, action TEXT NOT NULL, event_key TEXT NOT NULL, item_xp_awarded INTEGER NOT NULL DEFAULT 0, mastery_xp_awarded INTEGER NOT NULL DEFAULT 0, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(pet_id) REFERENCES telegram_pet_instances(pet_id));
INSERT INTO telegram_pet_equipment_events(id,telegram_id,item_key,action,event_key,item_xp_awarded,mastery_xp_awarded,metadata_json,created_at)
SELECT id,telegram_id,item_key,action,event_key,item_xp_awarded,mastery_xp_awarded,metadata_json,created_at FROM telegram_pet_equipment_events_legacy_064;
CREATE UNIQUE INDEX uq_pet_equipment_event_authority ON telegram_pet_equipment_events(pet_id,item_key,event_key) WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX uq_legacy_equipment_event_owner ON telegram_pet_equipment_events(telegram_id,item_key,event_key) WHERE pet_id IS NULL;
DROP TABLE telegram_pet_equipment_events_legacy_064;
CREATE INDEX idx_pet_system_events_pet ON telegram_pet_system_events(pet_id,system_key,created_at DESC);

-- D1 cannot add NOT NULL to an existing column without rebuilding and risking
-- old data. These guards enforce the new-write contract while retaining rows
-- that predate this migration.
CREATE TRIGGER require_activity_pet_id BEFORE INSERT ON telegram_pet_activity_sessions WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:activity'); END;
CREATE TRIGGER require_run_pet_id BEFORE INSERT ON telegram_pet_runs WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:run'); END;
CREATE TRIGGER require_run_step_pet_id BEFORE INSERT ON telegram_pet_run_steps WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:run_step'); END;
CREATE TRIGGER require_daily_run_pet_id BEFORE INSERT ON telegram_pet_daily_runs WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:daily_run'); END;
CREATE TRIGGER require_arena_queue_pet_id BEFORE INSERT ON telegram_pet_arena_queue WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:arena_queue'); END;
CREATE TRIGGER require_arena_battle_pet_id BEFORE INSERT ON telegram_pet_arena_battles WHEN NEW.player1_pet_id IS NULL OR (NEW.player2_telegram_id IS NOT NULL AND NEW.player2_telegram_id <> 'app' AND NEW.player2_pet_id IS NULL) BEGIN SELECT RAISE(ABORT, 'pet_id_required:arena_battle'); END;
CREATE TRIGGER require_kaiju_queue_pet_id BEFORE INSERT ON telegram_pet_kaiju_queue WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:kaiju_queue'); END;
CREATE TRIGGER require_kaiju_match_pet_id BEFORE INSERT ON telegram_pet_kaiju_matches WHEN NEW.player1_pet_id IS NULL OR (NEW.player2_telegram_id IS NOT NULL AND NEW.player2_pet_id IS NULL) BEGIN SELECT RAISE(ABORT, 'pet_id_required:kaiju_match'); END;
CREATE TRIGGER require_identity_event_pet_id BEFORE INSERT ON telegram_pet_identity_events WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:identity_event'); END;

CREATE TRIGGER require_weekly_boss_progress_pet_id BEFORE INSERT ON telegram_pet_weekly_boss_progress WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:weekly_boss_progress'); END;
CREATE TRIGGER require_weekly_boss_event_pet_id BEFORE INSERT ON telegram_pet_weekly_boss_events WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:weekly_boss_event'); END;
CREATE TRIGGER require_season_reward_pet_id BEFORE INSERT ON telegram_pet_season_reward_claims WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:season_reward'); END;
CREATE TRIGGER require_reward_claim_pet_id BEFORE INSERT ON telegram_pet_reward_claims WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:reward_claim'); END;
CREATE TRIGGER require_pet_event_pet_id BEFORE INSERT ON telegram_pet_events WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:pet_event'); END;
CREATE TRIGGER require_reward_asset_pet_id BEFORE INSERT ON telegram_pet_reward_assets WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:reward_asset'); END;
CREATE TRIGGER require_identity_analytics_pet_id BEFORE INSERT ON telegram_pet_identity_analytics WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:identity_analytics'); END;
CREATE TRIGGER require_personality_pet_id BEFORE INSERT ON telegram_pet_personality_traits WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:personality'); END;
CREATE TRIGGER require_memory_pet_id BEFORE INSERT ON telegram_pet_memories WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:memory'); END;
CREATE TRIGGER require_boss_victory_pet_id BEFORE INSERT ON telegram_pet_boss_victories WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:boss_victory'); END;
CREATE TRIGGER require_run_room_pet_id BEFORE INSERT ON telegram_pet_run_rooms WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:run_room'); END;
CREATE TRIGGER require_run_analytics_pet_id BEFORE INSERT ON telegram_pet_run_analytics WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:run_analytics'); END;
CREATE TRIGGER require_run_history_pet_id BEFORE INSERT ON telegram_pet_run_history WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:run_history'); END;
CREATE TRIGGER require_daily_analytics_pet_id BEFORE INSERT ON telegram_pet_daily_analytics WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:daily_analytics'); END;

CREATE TRIGGER require_progression_pet_id BEFORE INSERT ON telegram_pet_progression_state WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:progression'); END;
CREATE TRIGGER require_runtime_event_pet_id BEFORE INSERT ON telegram_pet_runtime_events WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:runtime_event'); END;
CREATE TRIGGER require_system_event_pet_id BEFORE INSERT ON telegram_pet_system_events WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:system_event'); END;
CREATE TRIGGER require_event_chain_pet_id BEFORE INSERT ON telegram_pet_event_chain_progress WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:event_chain'); END;
CREATE TRIGGER require_seasonal_boss_pet_id BEFORE INSERT ON telegram_pet_seasonal_boss_progress WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:seasonal_boss'); END;
CREATE TRIGGER require_cosmetic_pet_id BEFORE INSERT ON telegram_pet_cosmetic_unlocks WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:cosmetic'); END;
CREATE TRIGGER require_equipment_pet_id BEFORE INSERT ON telegram_pet_equipment_progression WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:equipment'); END;
CREATE TRIGGER require_equipment_event_pet_id BEFORE INSERT ON telegram_pet_equipment_events WHEN NEW.pet_id IS NULL BEGIN SELECT RAISE(ABORT, 'pet_id_required:equipment_event'); END;
