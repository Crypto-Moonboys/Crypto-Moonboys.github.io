-- Crypto Moonboy Pets identity expansion.
-- Adds permanent cosmetic evolution, behaviour-earned personality, historical
-- memories and balancing analytics without changing migration 042 authorities.

CREATE TABLE telegram_pet_evolutions (
  telegram_id TEXT NOT NULL,
  evolution_id TEXT NOT NULL,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 0 AND 4),
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

CREATE TABLE telegram_pet_personality_traits (
  telegram_id TEXT NOT NULL,
  trait_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  unlocked_at DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, trait_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_memories (
  telegram_id TEXT PRIMARY KEY,
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
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_boss_victories (
  telegram_id TEXT NOT NULL,
  boss_id TEXT NOT NULL,
  victories INTEGER NOT NULL DEFAULT 0 CHECK (victories >= 0),
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, boss_id),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_identity_events (
  event_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('personality', 'memory')),
  payload TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME,
  UNIQUE (telegram_id, event_key, event_kind),
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

CREATE TABLE telegram_pet_identity_analytics (
  analytics_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('evolution_unlock', 'personality_unlock', 'memory_milestone')),
  evolution_id TEXT,
  trait_id TEXT,
  milestone_id TEXT,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_pet_profiles(telegram_id) ON DELETE CASCADE
);

-- Existing Moonpets begin at the first identity stage without changing their
-- profile XP/stage fields or consuming inventory.
INSERT OR IGNORE INTO telegram_pet_evolutions
  (telegram_id, evolution_id, stage, unlock_event_key, cosmetic_unlocks, achievement_unlocks, materials_consumed, unlocked_at)
SELECT telegram_id, 'moon_egg', 0, 'migration:043:moon_egg:' || telegram_id,
  '["moon_egg_identity"]', '["moonpet_beginning"]', 1, created_at
FROM telegram_pet_profiles;

INSERT OR IGNORE INTO telegram_pet_memories
  (telegram_id, first_adoption_at, first_run_at, first_extraction_at, first_boss_victory_at, first_boss_id,
   total_runs, total_bosses_defeated, milestones)
SELECT p.telegram_id,
  p.created_at,
  (SELECT MIN(r.started_at) FROM telegram_pet_runs r WHERE r.telegram_id = p.telegram_id),
  (SELECT MIN(r.ended_at) FROM telegram_pet_runs r WHERE r.telegram_id = p.telegram_id AND r.status = 'extracted'),
  (SELECT MIN(a.created_at) FROM telegram_pet_run_analytics a WHERE a.telegram_id = p.telegram_id
    AND a.event_type = 'boss_fought' AND json_extract(a.event_data, '$.outcome') = 'win'),
  (SELECT json_extract(a.event_data, '$.boss_id') FROM telegram_pet_run_analytics a WHERE a.telegram_id = p.telegram_id
    AND a.event_type = 'boss_fought' AND json_extract(a.event_data, '$.outcome') = 'win' ORDER BY a.created_at LIMIT 1),
  COALESCE(h.runs_completed, 0), COALESCE(h.bosses_defeated, 0), '["first_adoption"]'
FROM telegram_pet_profiles p
LEFT JOIN telegram_pet_run_history h ON h.telegram_id = p.telegram_id;

INSERT INTO telegram_pet_boss_victories (telegram_id, boss_id, victories)
SELECT telegram_id, json_extract(event_data, '$.boss_id'), COUNT(*)
FROM telegram_pet_run_analytics
WHERE event_type = 'boss_fought' AND json_extract(event_data, '$.outcome') = 'win'
  AND json_extract(event_data, '$.boss_id') IS NOT NULL
GROUP BY telegram_id, json_extract(event_data, '$.boss_id')
ON CONFLICT(telegram_id, boss_id) DO UPDATE SET victories = MAX(telegram_pet_boss_victories.victories, excluded.victories);

INSERT OR IGNORE INTO telegram_pet_identity_analytics
  (analytics_id, telegram_id, event_type, evolution_id, duration_seconds, event_data, created_at)
SELECT 'evolution_unlock:' || telegram_id || ':moon_egg', telegram_id, 'evolution_unlock', 'moon_egg', 0,
  '{"stage":0,"name":"Moon Egg","backfilled":true}', unlocked_at
FROM telegram_pet_evolutions WHERE evolution_id = 'moon_egg';

INSERT OR IGNORE INTO telegram_pet_identity_analytics
  (analytics_id, telegram_id, event_type, milestone_id, event_data, created_at)
SELECT 'memory_milestone:' || telegram_id || ':first_adoption', telegram_id, 'memory_milestone', 'first_adoption',
  '{"memory_type":"first_adoption","backfilled":true}', first_adoption_at
FROM telegram_pet_memories WHERE first_adoption_at IS NOT NULL;

CREATE INDEX idx_telegram_pet_identity_events_owner ON telegram_pet_identity_events(telegram_id, created_at DESC);
CREATE INDEX idx_telegram_pet_identity_analytics_type ON telegram_pet_identity_analytics(event_type, created_at DESC);
CREATE INDEX idx_telegram_pet_identity_analytics_evolution ON telegram_pet_identity_analytics(evolution_id, duration_seconds);
