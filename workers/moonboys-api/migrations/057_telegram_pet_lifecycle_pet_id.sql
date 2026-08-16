-- Per-pet lifecycle cutover. The migration runner records each migration once;
-- all created objects and copy operations are conflict-safe and use no triggers.
CREATE TABLE IF NOT EXISTS telegram_pet_lifecycle_by_pet (
  pet_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  lifecycle_version INTEGER NOT NULL DEFAULT 1,
  identity_seed TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'egg' CHECK (phase IN ('egg', 'young', 'adult', 'rare')),
  species_id TEXT, palette_id TEXT, marking_id TEXT, eye_style TEXT, temperament TEXT,
  innate_traits_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(innate_traits_json)),
  incubation_progress INTEGER NOT NULL DEFAULT 0 CHECK (incubation_progress BETWEEN 0 AND 12),
  incubation_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(incubation_json)),
  rare_route_index INTEGER CHECK (rare_route_index BETWEEN 0 AND 3),
  rare_morph_id TEXT, hatched_at DATETIME, adult_at DATETIME, rare_morphed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (telegram_id, pet_id),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_instances(pet_id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO telegram_pet_lifecycle_by_pet
  (pet_id, telegram_id, lifecycle_version, identity_seed, phase, species_id, palette_id, marking_id,
   eye_style, temperament, innate_traits_json, incubation_progress, incubation_json, rare_route_index,
   rare_morph_id, hatched_at, adult_at, rare_morphed_at, created_at, updated_at)
SELECT s.pet_id, l.telegram_id, l.lifecycle_version, l.identity_seed, l.phase, l.species_id, l.palette_id,
  l.marking_id, l.eye_style, l.temperament, l.innate_traits_json, l.incubation_progress,
  l.incubation_json, l.rare_route_index, l.rare_morph_id, l.hatched_at, l.adult_at,
  l.rare_morphed_at, l.created_at, l.updated_at
FROM telegram_pet_lifecycle l
JOIN telegram_pet_season_slots s ON s.telegram_id=l.telegram_id AND s.slot_number=1
JOIN telegram_pet_instances i ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id
WHERE s.status='active';

CREATE TABLE IF NOT EXISTS telegram_pet_lifecycle_events_by_pet (
  event_id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('egg_created', 'incubate_warm', 'incubate_talk', 'incubate_music', 'incubate_rest', 'hatch', 'rare_morph')),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
  progress_delta INTEGER NOT NULL DEFAULT 0 CHECK (progress_delta BETWEEN 0 AND 2),
  day_key TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
  applied_at DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pet_id, event_key),
  FOREIGN KEY (pet_id) REFERENCES telegram_pet_lifecycle_by_pet(pet_id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO telegram_pet_lifecycle_events_by_pet
  (event_id, pet_id, telegram_id, event_key, action, payload_json, progress_delta, day_key, applied_at, created_at)
SELECT e.event_id, l.pet_id, e.telegram_id, e.event_key, e.action, e.payload_json,
  e.progress_delta, e.day_key, e.applied_at, e.created_at
FROM telegram_pet_lifecycle_events e
JOIN telegram_pet_lifecycle_by_pet l ON l.telegram_id=e.telegram_id;

CREATE TABLE IF NOT EXISTS telegram_pet_evolutions_by_pet (
  pet_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  evolution_id TEXT NOT NULL,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 0 AND 4),
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

INSERT OR IGNORE INTO telegram_pet_evolutions_by_pet
  (pet_id, telegram_id, evolution_id, stage, unlock_event_key, cosmetic_unlocks, achievement_unlocks,
   materials_consumed, unlocked_at)
SELECT s.pet_id, e.telegram_id, e.evolution_id, e.stage, e.unlock_event_key, e.cosmetic_unlocks,
  e.achievement_unlocks, e.materials_consumed, e.unlocked_at
FROM telegram_pet_evolutions e
JOIN telegram_pet_season_slots s ON s.telegram_id=e.telegram_id AND s.slot_number=1
JOIN telegram_pet_instances i ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id
WHERE s.status='active' AND i.status='active';

CREATE INDEX IF NOT EXISTS idx_pet_lifecycle_by_pet_owner ON telegram_pet_lifecycle_by_pet(telegram_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_lifecycle_by_pet_phase ON telegram_pet_lifecycle_by_pet(phase, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_lifecycle_events_by_pet_daily ON telegram_pet_lifecycle_events_by_pet(pet_id, day_key, action);
CREATE INDEX IF NOT EXISTS idx_pet_evolutions_by_pet_owner ON telegram_pet_evolutions_by_pet(telegram_id, stage DESC, unlocked_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_evolutions_by_pet_stage ON telegram_pet_evolutions_by_pet(stage, unlocked_at DESC);
