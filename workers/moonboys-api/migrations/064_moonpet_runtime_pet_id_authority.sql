-- Immutable Moonpet gameplay authority.
-- Existing account-only records remain readable; every insert after this migration
-- must name the participating pet. No historical row is backfilled from today's
-- active selector because that would manufacture ownership evidence.

ALTER TABLE telegram_pet_activity_sessions ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_runs ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_run_steps ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_daily_runs ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_arena_queue ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_arena_battles ADD COLUMN player1_pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_arena_battles ADD COLUMN player2_pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_kaiju_queue ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_kaiju_matches ADD COLUMN player1_pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_kaiju_matches ADD COLUMN player2_pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_reward_claims ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_reward_assets ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_events ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_identity_events ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_identity_analytics ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_personality_traits ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_memories ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_boss_victories ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
ALTER TABLE telegram_pet_run_history ADD COLUMN pet_id TEXT REFERENCES telegram_pet_instances(pet_id);
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
