-- Pet-specific Moonpet identity and achievement authority.
-- Historical beta identity rows were account-scoped and may be contaminated
-- across three-pet rosters, so this migration resets only those identity and
-- achievement ledgers while preserving account, slot, lifecycle, wallet,
-- inventory, material, run, and economy authority tables.
-- The marker records that this beta reset happened; DROP IF EXISTS plus
-- CREATE IF NOT EXISTS makes local rehearsal/canonical replay retry-safe.

CREATE TABLE IF NOT EXISTS moonpet_identity_authority_cutovers (
  cutover_key TEXT PRIMARY KEY,
  migration_name TEXT NOT NULL,
  reset_beta_identity_rows INTEGER NOT NULL DEFAULT 1 CHECK (reset_beta_identity_rows IN (0, 1)),
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS telegram_pet_personality_traits;
DROP TABLE IF EXISTS telegram_pet_memories;
DROP TABLE IF EXISTS telegram_pet_boss_victories;
DROP TABLE IF EXISTS telegram_pet_identity_events;
DROP TABLE IF EXISTS telegram_pet_identity_analytics;
DROP TABLE IF EXISTS telegram_pet_achievements;

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

CREATE INDEX IF NOT EXISTS idx_telegram_pet_identity_events_owner
  ON telegram_pet_identity_events(telegram_id, pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_identity_events_pet_kind_day
  ON telegram_pet_identity_events(pet_id, event_kind, day_key);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_identity_analytics_type
  ON telegram_pet_identity_analytics(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_identity_analytics_evolution
  ON telegram_pet_identity_analytics(evolution_id, duration_seconds);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_achievements_unlocked
  ON telegram_pet_achievements(achievement_id, unlocked_at);
CREATE INDEX IF NOT EXISTS idx_telegram_pet_achievements_owner
  ON telegram_pet_achievements(telegram_id, pet_id, unlocked_at);

INSERT OR IGNORE INTO moonpet_identity_authority_cutovers
  (cutover_key, migration_name, reset_beta_identity_rows)
  VALUES ('pet_identity_achievement_authority_v1', '070_moonpet_pet_identity_achievement_authority.sql', 1);
