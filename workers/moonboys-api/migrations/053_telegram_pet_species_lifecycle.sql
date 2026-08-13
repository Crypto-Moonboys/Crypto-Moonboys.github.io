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

-- Existing companions keep every stat, item and evolution. The Worker assigns
-- their stable species/appearance on first read; only future adoptions begin as eggs.
INSERT OR IGNORE INTO telegram_pet_lifecycle
  (telegram_id, identity_seed, phase, incubation_progress, incubation_json, innate_traits_json, hatched_at, adult_at)
SELECT telegram_id, 'legacy:' || telegram_id || ':' || created_at, 'adult', 12, '{}', '[]', created_at, created_at
FROM telegram_pet_profiles;
